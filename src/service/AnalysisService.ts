import { readFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import glob from 'fast-glob';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { QualityDB } from '../db.js';
import { ConfigService } from '../config.js';
import { SemanticService } from './SemanticService.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { countTechDebt } from '../analysis/rg.js';
import { analyzeFile } from '../analysis/sg.js';
import { checkEnv } from '../checkers/env.js';
import { checkPackageAudit } from '../checkers/security.js';
import { JavascriptProvider } from '../providers/JavascriptProvider.js';
import { Violation, QualityReport, QualityProvider } from '../types/index.js';
import { checkStructuralIntegrity } from '../utils/AnalysisUtils.js';
import { join, extname, relative } from 'path';
import os from 'os';

export class AnalysisService {
  private git: SimpleGit;
  private providers: QualityProvider[] = [];
  private depGraph: DependencyGraph;

  constructor(
    private db: QualityDB,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.git = simpleGit();
    this.providers.push(new JavascriptProvider(this.config));
    this.depGraph = new DependencyGraph();
  }

  private getFileHash(filePath: string): string {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
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
      return [...new Set(changedFiles)].filter(
        (f) => f.startsWith('src/') && supportedExts.includes(extname(f))
      );
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

          const stats = statSync(file);
          const cachedMetric = this.db.getFileMetric(file);

          if (cachedMetric && cachedMetric.mtime_ms === stats.mtimeMs) {
            return { fileViolations: JSON.parse(cachedMetric.violations || '[]') };
          }

          const currentHash = this.getFileHash(file);
          if (cachedMetric && cachedMetric.hash === currentHash) {
            this.db.updateFileMetric(
              file,
              currentHash,
              stats.mtimeMs,
              cachedMetric.line_count,
              cachedMetric.complexity,
              JSON.parse(cachedMetric.violations)
            );
            return { fileViolations: JSON.parse(cachedMetric.violations || '[]') };
          }

          const fileViolations = await provider.check(file);
          const metrics = await analyzeFile(file); // 메트릭 재추출 (또는 provider.check 결과에 포함 권장)
          const lineCount = metrics.lineCount;
          this.db.updateFileMetric(
            file,
            currentHash,
            stats.mtimeMs,
            lineCount,
            metrics.complexity,
            fileViolations
          );

          return { fileViolations };
        } catch (e) {
          return null;
        }
      },
      { concurrency: Math.max(1, cpuCount - 1) }
    );

    const violations: Violation[] = [];
    analysisResults.filter(Boolean).forEach((res: any) => {
      violations.push(...res.fileViolations);
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

    // 고속 의존성 그래프 빌드 (Regex 기반, 1초 미만 소요)
    await this.depGraph.build();

    if (this.config.incremental) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const affectedFiles = new Set<string>(changedFiles);

        // 역의존성 추적 (1단계 상위까지만 우선 추적하여 과도한 분석 방지)
        for (const file of changedFiles) {
          try {
            const fullPath = join(process.cwd(), file);
            const dependents = this.depGraph.getDependents(fullPath);
            dependents.forEach((dep) => {
              const relativeDep = relative(process.cwd(), dep);
              if (relativeDep.startsWith('src/') && supportedExts.includes(extname(relativeDep))) {
                affectedFiles.add(relativeDep);
              }
            });
          } catch (e) {
            // Ignore errors for individual files
          }
        }
        files = Array.from(affectedFiles);
      } else {
        files = await glob(
          supportedExts.map((ext) => `src/**/*${ext}`),
          { ignore: ignorePatterns }
        );
      }
    } else {
      files = await glob(
        supportedExts.map((ext) => `src/**/*${ext}`),
        { ignore: ignorePatterns }
      );
    }

    // 자가 치유
    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files.filter((f) => provider.extensions.includes(extname(f)));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, process.cwd());
        healingMessages.push(...res.messages);
      }
    }

    // 보안 감사 (너무 느려서 기본 제외)
    const fileViolations = await this.performFileAnalysis(files);

    // 구조 분석 (통합된 depGraph 전달)
    const structuralViolations = await checkStructuralIntegrity(this.depGraph);

    violations.push(...fileViolations, ...structuralViolations);

    // 기술 부채 및 커버리지
    const techDebtCount = await countTechDebt();
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
      join(process.cwd(), 'coverage', 'coverage-summary.json'),
      join(process.cwd(), 'coverage-summary.json'),
      'coverage/coverage-summary.json',
    ];

    let coveragePath = '';
    for (const cand of coverageCandidates) {
      if (existsSync(cand)) {
        coveragePath = cand;
        break;
      }
    }

    if (coveragePath) {
      try {
        const content = readFileSync(coveragePath, 'utf-8');
        const coverageData = JSON.parse(content);
        currentCoverage = coverageData.total.lines.pct || 0;
      } catch (e) {
        console.error('DEBUG: Failed to parse coverage file:', e);
      }
    } else {
      console.log(`DEBUG: Coverage summary file not found in candidates.`);
    }

    if (currentCoverage > 0 && currentCoverage < rules.minCoverage) {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다.`,
      });
    }

    const lastSession = this.db.getLastSession();
    let pass = violations.length === 0;

    if (lastSession && currentCoverage < lastSession.total_coverage && currentCoverage > 0) {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${lastSession.total_coverage}%`,
        message: `이전 세션보다 커버리지가 하락했습니다 (${lastSession.total_coverage}% -> ${currentCoverage}%). REJECT!`,
      });
      pass = false;
    }

    let suggestion = pass
      ? `모든 품질 인증 기준을 통과했습니다. (모드: ${incrementalMode ? '증분' : '전체'})`
      : violations.map((v) => v.message).join('\n') +
        '\n\n위 사항들을 수정한 후 다시 인증을 요청하세요.';

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    this.db.saveSession(currentCoverage, violations.length, pass);

    return { pass, violations, suggestion };
  }
}
