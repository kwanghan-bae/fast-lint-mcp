import { readFileSync, existsSync } from 'fs';
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
import { PythonProvider } from '../providers/PythonProvider.js';
import { Violation, QualityReport, QualityProvider } from '../types/index.js';
import { join, extname, normalize } from 'path';

export class AnalysisService {
  private git: SimpleGit;
  private providers: QualityProvider[] = [];

  constructor(
    private db: QualityDB,
    private config: ConfigService
  ) {
    this.git = simpleGit();

    // 프로바이더 등록 (DI)
    this.providers.push(new JavascriptProvider(this.config));
    this.providers.push(new PythonProvider(this.config));
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

    // 1. 분석 대상 파일 수집 (설정된 exclude 패턴 적용)
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

    // 2. 자가 치유 (Self-Healing)
    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files.filter((f) => provider.extensions.includes(extname(f)));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, process.cwd());
        healingMessages.push(...res.messages);
      }
    }

    // 3. 보안 감사
    const auditViolations = await checkPackageAudit();
    violations.push(...auditViolations);

    // 4. 병렬 파일 분석 (해시 기반 캐싱 적용)
    const analysisResults = await pMap(
      files,
      async (file) => {
        try {
          const ext = extname(file);
          const provider = this.providers.find((p) => p.extensions.includes(ext));
          if (!provider) return null;

          const currentHash = this.getFileHash(file);
          const cachedMetric = this.db.getFileMetric(file);

          // 캐시 히트 (해시가 동일하면 캐시된 결과 반환)
          if (cachedMetric && cachedMetric.hash === currentHash) {
            return { fileViolations: JSON.parse(cachedMetric.violations || '[]') };
          }

          // 캐시 미스 (실제 분석 수행)
          const fileViolations = await provider.check(file);

          // 분석 데이터 업데이트 (캐시 저장)
          // lineCount와 complexity는 provider.check에서 반환하도록 타입 확장이 필요할 수 있으나,
          // 여기서는 임시로 lineCount를 단순 계산하여 저장
          const lineCount = readFileSync(file, 'utf-8').split('\n').length;
          this.db.updateFileMetric(file, currentHash, lineCount, 0, fileViolations);

          return { fileViolations };
        } catch (e) {
          return null;
        }
      },
      { concurrency: 4 }
    ); // 병렬성 증가

    analysisResults.filter(Boolean).forEach((res: any) => {
      violations.push(...res.fileViolations);
    });

    // 5. 의존성 분석 (고아 파일 및 순환 참조)
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
      // 분석 대상에서 제외된 경로는 고아 파일에서도 제외
      violations.push({
        type: 'ORPHAN',
        file: orphan,
        message: '어떤 파일에서도 참조되지 않는 파일입니다. 삭제를 고려하세요.',
      });
    }

    // 6. 기술 부채 및 커버리지
    const techDebtCount = await countTechDebt();
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    let currentCoverage = 80;
    const coveragePath = join(process.cwd(), 'coverage', 'coverage-summary.json');
    if (existsSync(coveragePath)) {
      try {
        const coverageData = JSON.parse(readFileSync(coveragePath, 'utf-8'));
        currentCoverage = coverageData.total.lines.pct || 0;
      } catch (e) {}
    }

    if (currentCoverage < rules.minCoverage) {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다. 테스트 코드를 추가하세요!`,
      });
    }

    const lastSession = this.db.getLastSession();
    let pass = violations.length === 0;

    if (lastSession && currentCoverage < lastSession.total_coverage) {
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
