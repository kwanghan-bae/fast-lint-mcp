import { readFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import glob from 'fast-glob';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { QualityDB } from '../db.js';
import { ConfigService } from '../config.js';
import { getDependencyMap, findOrphanFiles } from '../analysis/fd.js';
import { countTechDebt } from '../analysis/rg.js';
import { checkEnv } from '../checkers/env.js';
import { checkPackageAudit } from '../checkers/security.js';
import { JavascriptProvider } from '../providers/JavascriptProvider.js';
import { Violation, QualityReport, QualityProvider } from '../types/index.js';
import { join, extname } from 'path';
import os from 'os';

export class AnalysisService {
  private git: SimpleGit;
  private providers: QualityProvider[] = [];

  constructor(
    private db: QualityDB,
    private config: ConfigService
  ) {
    this.git = simpleGit();

    // 프로바이더 등록 (TS/JS 중심)
    this.providers.push(new JavascriptProvider(this.config));
    // 향후 다른 언어 추가 시 이곳에 동적으로 주입하거나 registry에서 로드 가능
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
        (f) =>
          (f.startsWith('src/') || f.startsWith('tests/')) && supportedExts.includes(extname(f))
      );
    } catch (error) {
      console.warn('Warning: Failed to get changed files from git, fallback to full scan.');
      return [];
    }
  }

  private detectCycles(depMap: Map<string, string[]>): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of depMap.get(node) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (stack.has(neighbor)) {
          const cycleStartIdx = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStartIdx), neighbor]);
        }
      }

      stack.delete(node);
    };

    for (const node of depMap.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
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

    if (this.config.incremental) {
      files = await this.getChangedFiles();
      if (files.length > 0) {
        incrementalMode = true;
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

    // 보안 감사
    const auditViolations = await checkPackageAudit();
    violations.push(...auditViolations);

    // 병렬 파일 분석 (mtimeMs 기반 초고속 1차 캐싱 + 해시 기반 2차 캐싱)
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

          // [최적화 1단계] 수정 시간(mtimeMs) 비교 (파일을 읽지 않음)
          if (cachedMetric && cachedMetric.mtime_ms === stats.mtimeMs) {
            return { fileViolations: JSON.parse(cachedMetric.violations || '[]') };
          }

          // [최적화 2단계] 파일 내용 해시 비교 (mtime은 변했으나 내용이 같은 경우)
          const currentHash = this.getFileHash(file);
          if (cachedMetric && cachedMetric.hash === currentHash) {
            // mtime 정보만 업데이트하고 리턴
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

          // 캐시 미스: 실제 분석 수행
          const fileViolations = await provider.check(file);
          const lineCount = readFileSync(file, 'utf-8').split('\n').length;

          // 분석 데이터 업데이트
          this.db.updateFileMetric(file, currentHash, stats.mtimeMs, lineCount, 0, fileViolations);

          return { fileViolations };
        } catch (e) {
          return null;
        }
      },
      { concurrency: Math.max(1, cpuCount - 1) }
    );

    analysisResults.filter(Boolean).forEach((res: any) => {
      violations.push(...res.fileViolations);
    });

    // 의존성 분석
    const depMap = await getDependencyMap();
    const cycles = this.detectCycles(depMap);
    for (const cycle of cycles) {
      violations.push({
        type: 'CUSTOM',
        message: `순환 참조 발견: ${cycle.join(' -> ')}`,
      });
    }

    const orphans = await findOrphanFiles();
    for (const orphan of orphans) {
      violations.push({
        type: 'ORPHAN',
        file: orphan,
        message: '어떤 파일에서도 참조되지 않는 파일입니다. 삭제를 고려하세요.',
      });
    }

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
    const coveragePath = join(process.cwd(), 'coverage', 'coverage-summary.json');
    if (existsSync(coveragePath)) {
      try {
        const coverageData = JSON.parse(readFileSync(coveragePath, 'utf-8'));
        currentCoverage = coverageData.total.lines.pct || 0;
      } catch (e) {}
    }

    if (currentCoverage < rules.minCoverage && rules.minCoverage > 0) {
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

    return {
      pass,
      violations,
      suggestion,
    };
  }
}
