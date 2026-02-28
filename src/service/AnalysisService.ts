import { readFileSync, existsSync, statSync } from 'fs';
import glob from 'fast-glob';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { StateManager } from '../state.js';
import { ConfigService } from '../config.js';
import { SemanticService } from './SemanticService.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { countTechDebt } from '../analysis/rg.js';
import { analyzeFile } from '../analysis/sg.js';
import { checkEnv } from '../checkers/env.js';
import { JavascriptProvider } from '../providers/JavascriptProvider.js';
import { Violation, QualityReport, QualityProvider } from '../types/index.js';
import { checkStructuralIntegrity } from '../utils/AnalysisUtils.js';
import { join, extname, relative } from 'path';
import os from 'os';
import { AstCacheManager } from '../utils/AstCacheManager.js';

interface AnalysisResult {
  fileViolations: Violation[];
}

/**
 * 프로젝트 전체의 코드 품질 분석 프로세스를 관장하는 메인 서비스 클래스입니다.
 */
export class AnalysisService {
  private git: SimpleGit;
  private providers: QualityProvider[] = [];
  private depGraph: DependencyGraph;

  constructor(
    private stateManager: StateManager,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.git = simpleGit();
    this.providers.push(new JavascriptProvider(this.config));
    this.depGraph = new DependencyGraph();
  }

  private async getChangedFiles(): Promise<string[]> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) return [];

      const status = await this.git.status();
      const changedFiles = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.staged,
        ...status.renamed.map((r) => r.to),
      ];

      const supportedExts = this.providers.flatMap((p) => p.extensions);
      return [...new Set(changedFiles)].filter((f) => supportedExts.includes(extname(f)));
    } catch (error) {
      return [];
    }
  }

  private async performFileAnalysis(files: string[]): Promise<Violation[]> {
    const cpuCount = os.cpus().length;
    const analysisResults = await pMap(
      files,
      async (file) => {
        try {
          const ext = extname(file);
          const provider = this.providers.find((p) => p.extensions.includes(ext));
          if (!provider) return null;
          const fileViolations = await provider.check(file);
          return { fileViolations } as AnalysisResult;
        } catch (e) {
          return null;
        }
      },
      { concurrency: Math.max(1, cpuCount - 1) }
    );

    const violations: Violation[] = [];
    analysisResults.forEach((res) => {
      if (res) violations.push(...res.fileViolations);
    });
    return violations;
  }

  async runAllChecks(): Promise<QualityReport> {
    const envResult = await checkEnv();
    if (!envResult.pass) {
      return {
        pass: false,
        violations: [{ type: 'ENV', message: envResult.suggestion || '필수 도구 누락' }],
        suggestion: '필수 도구를 설치하세요.',
      };
    }

    const violations: Violation[] = [];
    const rules = this.config.rules;
    let files: string[] = [];
    let incrementalMode = false;

    const supportedExts = this.providers.flatMap((p) => p.extensions);
    const ignorePatterns = this.config.exclude;

    await this.depGraph.build();

    if (this.config.incremental) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        // v2.2.2: 증분 분석 시에도 제외 패턴 적용
        const filteredChanges = changedFiles.filter(file => {
          return !ignorePatterns.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
            return regex.test(file);
          });
        });

        const affectedFiles = new Set<string>(filteredChanges);
        for (const file of filteredChanges) {
          try {
            const fullPath = join(process.cwd(), file);
            const dependents = this.depGraph.getDependents(fullPath);
            dependents.forEach((dep) => {
              const relativeDep = relative(process.cwd(), dep);
              const isIgnored = ignorePatterns.some(p => new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(relativeDep));
              if (supportedExts.includes(extname(relativeDep)) && !isIgnored) {
                affectedFiles.add(relativeDep);
              }
            });
          } catch (e) {}
        }
        files = Array.from(affectedFiles);
      } else {
        files = await glob(supportedExts.map((ext) => `**/*${ext}`), { ignore: ignorePatterns });
      }
    } else {
      files = await glob(supportedExts.map((ext) => `**/*${ext}`), { ignore: ignorePatterns });
    }

    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files.filter((f) => provider.extensions.includes(extname(f)));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, process.cwd());
        healingMessages.push(...res.messages);
      }
    }

    const fileViolations = await this.performFileAnalysis(files);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    // v2.2.2: 기술 부채 스캔 시에도 제외 패턴 적용
    const techDebtCount = await countTechDebt(process.cwd(), ignorePatterns);
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    let currentCoverage = 0;
    const coverageCandidates = [
      this.config.rules.coveragePath,
      join(process.cwd(), this.config.rules.coverageDirectory, 'coverage-summary.json'),
      join(process.cwd(), 'coverage', 'coverage-summary.json'),
      'coverage/coverage-summary.json',
      'coverage-summary.json',
    ].filter(Boolean) as string[];

    let coveragePath = '';
    for (const cand of coverageCandidates) {
      if (existsSync(cand)) {
        coveragePath = cand;
        break;
      }
    }

    if (coveragePath) {
      try {
        const coverageStat = statSync(coveragePath);
        const lastSrcUpdate = files.length > 0 
          ? Math.max(...files.map(f => {
              try { return statSync(join(process.cwd(), f)).mtimeMs; } catch(e) { return 0; }
            }))
          : 0;

        const isStale = coverageStat.mtimeMs < lastSrcUpdate - 60000;
        const content = readFileSync(coveragePath, 'utf-8');
        
        if (coveragePath.endsWith('.json')) {
          const coverageData = JSON.parse(content);
          currentCoverage = coverageData.total?.lines?.pct ?? 0;
        } else if (coveragePath.endsWith('lcov.info')) {
          const lines = content.split('\n');
          const found = lines.filter(l => l.startsWith('LF:')).reduce((a, b) => a + parseInt(b.split(':')[1]), 0);
          const hit = lines.filter(l => l.startsWith('LH:')).reduce((a, b) => a + parseInt(b.split(':')[1]), 0);
          currentCoverage = found > 0 ? (hit / found) * 100 : 0;
        }

        if (isStale && rules.minCoverage > 0) {
          violations.push({
            type: 'COVERAGE',
            message: `테스트 리포트가 소스 코드보다 오래되었습니다 (만료됨). 최신 커버리지를 반영하려면 'npm test'를 실행하세요.`,
          });
        }
      } catch (e) {}
    } else if (rules.minCoverage > 0) {
      violations.push({
        type: 'COVERAGE',
        message: `테스트 커버리지 리포트를 찾을 수 없습니다 (검색 경로: ${this.config.rules.coverageDirectory}). 'npm test'를 실행하여 리포트를 생성하세요.`,
      });
    }

    if (currentCoverage < rules.minCoverage && coveragePath !== '') {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다.`,
      });
    }

    const lastCoverage = this.stateManager.getLastCoverage();
    let pass = violations.length === 0;

    if (lastCoverage !== null && currentCoverage < lastCoverage) {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${lastCoverage}%`,
        message: `이전 세션보다 커버리지가 하락했습니다 (${lastCoverage}% -> ${currentCoverage}%). REJECT!`,
      });
      pass = false;
    }

    let suggestion = '';
    if (files.length === 0) {
      pass = false;
      violations.push({ type: 'ENV', message: '분석할 소스 파일을 찾지 못했습니다.' });
      suggestion = '분석 대상 파일이 없습니다. exclude 설정을 확인하세요.';
    } else {
      const modeDesc = incrementalMode ? '증분 분석' : '전체 분석';
      suggestion = pass
        ? `모든 품질 인증 기준을 통과했습니다. (v2.2.2 / 대상: ${files.length}개, ${modeDesc})`
        : violations.map((v) => v.message).join('\n') + `\n\n(v2.2.2 / 총 ${files.length}개 파일 분석됨 - ${modeDesc})`;
    }

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    // 세션 종료 후 AST 캐시 정리 (v3.0 Memory Management)
    AstCacheManager.getInstance().clear();

    this.stateManager.saveCoverage(currentCoverage);
    return { pass, violations, suggestion };
  }
}
