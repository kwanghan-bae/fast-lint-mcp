import { readFileSync, existsSync, statSync } from 'fs';
import glob from 'fast-glob';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { StateManager } from '../state.js';
import { ConfigService } from '../config.js';
import { SemanticService } from './SemanticService.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { countTechDebt } from '../analysis/rg.js';
import { checkEnv } from '../checkers/env.js';
import { JavascriptProvider } from '../providers/JavascriptProvider.js';
import { KotlinProvider } from '../providers/KotlinProvider.js';
import { Violation, QualityReport, QualityProvider } from '../types/index.js';
import { checkStructuralIntegrity } from '../utils/AnalysisUtils.js';
import { clearProjectFilesCache, getProjectFiles } from '../analysis/import-check.js';
import { clearPathCache } from '../utils/PathResolver.js';
import { join, extname, relative, isAbsolute } from 'path';
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
  private workspacePath: string;

  constructor(
    private stateManager: StateManager,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.workspacePath = this.config.workspacePath || process.cwd();
    this.git = simpleGit(this.workspacePath);
    this.providers.push(new JavascriptProvider(this.config));
    this.providers.push(new KotlinProvider(this.config));
    this.depGraph = new DependencyGraph(this.workspacePath);
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
          const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
          const ext = extname(fullPath);
          const provider = this.providers.find((p) => p.extensions.includes(ext));
          if (!provider) return null;
          const fileViolations = await provider.check(fullPath);
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

    // v3.4: One-Pass Scan (JS/TS + Kotlin 지원)
    const allProjectFiles = await getProjectFiles(this.workspacePath, ignorePatterns);
    
    await this.depGraph.build(allProjectFiles);

    if (this.config.incremental) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const filteredChanges = changedFiles.filter(file => {
          return !ignorePatterns.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
            return regex.test(file);
          });
        });

        const affectedFiles = new Set<string>(filteredChanges);
        for (const file of filteredChanges) {
          try {
            const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
            const dependents = this.depGraph.getDependents(fullPath);
            dependents.forEach((dep) => {
              const relativeDep = relative(this.workspacePath, dep);
              const isIgnored = ignorePatterns.some(p => new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(relativeDep));
              if (supportedExts.includes(extname(relativeDep)) && !isIgnored) {
                affectedFiles.add(relativeDep);
              }
            });
          } catch (e) {}
        }
        files = Array.from(affectedFiles);
      } else {
        files = allProjectFiles.filter(f => supportedExts.includes(extname(f)));
      }
    } else {
      files = allProjectFiles.filter(f => supportedExts.includes(extname(f)));
    }

    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files.filter((f) => provider.extensions.includes(extname(f)))
                               .map(f => isAbsolute(f) ? f : join(this.workspacePath, f));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, this.workspacePath);
        healingMessages.push(...res.messages);
      }
    }

    const fileViolations = await this.performFileAnalysis(files);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    const techDebtCount = await countTechDebt(this.workspacePath, ignorePatterns);
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
      join(this.workspacePath, this.config.rules.coverageDirectory, 'coverage-summary.json'),
      join(this.workspacePath, 'coverage', 'coverage-summary.json'),
      join(this.workspacePath, 'coverage-summary.json'),
    ].filter(Boolean) as string[];

    let coveragePath = '';
    for (const cand of coverageCandidates) {
      const fullCand = isAbsolute(cand) ? cand : join(this.workspacePath, cand);
      if (existsSync(fullCand)) {
        coveragePath = fullCand;
        break;
      }
    }

    if (coveragePath) {
      try {
        const coverageStat = statSync(coveragePath);
        const lastSrcUpdate = files.length > 0 
          ? Math.max(...files.map(f => {
              try { return statSync(isAbsolute(f) ? f : join(this.workspacePath, f)).mtimeMs; } catch(e) { return 0; }
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
    if (allProjectFiles.length === 0) {
      pass = false;
      violations.push({ type: 'ENV', message: '분석할 소스 파일을 찾지 못했습니다.' });
      suggestion = `분석 대상 파일이 없습니다. [${this.workspacePath}] 디렉토리를 확인하세요.`;
    } else {
      const modeDesc = incrementalMode ? '증분 분석' : '전체 분석';
      suggestion = pass
        ? `모든 품질 인증 기준을 통과했습니다. (v3.4.0 / 대상: ${files.length}개, ${modeDesc})`
        : violations.map((v) => v.message).join('\n') + `\n\n(v3.4.0 / 총 ${files.length}개 파일 분석됨 - ${modeDesc})`;
    }

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    AstCacheManager.getInstance().clear();
    clearProjectFilesCache();
    clearPathCache();
    this.stateManager.saveCoverage(currentCoverage);
    return { pass, violations, suggestion };
  }
}
