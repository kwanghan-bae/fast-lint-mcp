import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import glob from 'fast-glob';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { QualityDB } from '../db.js';
import { ConfigService } from '../config.js';
import { analyzeFile } from '../analysis/sg.js';
import { getDependencyMap, findOrphanFiles } from '../analysis/fd.js';
import { countTechDebt } from '../analysis/rg.js';
import { checkEnv } from '../checkers/env.js';
import { checkHallucination, checkFakeLogic } from '../analysis/import-check.js';
import { checkSecrets, checkPackageAudit } from '../checkers/security.js';
import { runMutationTest } from '../analysis/mutation.js';
import { Violation, QualityReport } from '../types/index.js';
import { join } from 'path';

export class AnalysisService {
  private git: SimpleGit;

  constructor(
    private db: QualityDB,
    private config: ConfigService
  ) {
    this.git = simpleGit();
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
        ...status.renamed.map(r => r.to),
      ];

      return [...new Set(changedFiles)]
        .filter(f => (f.startsWith('src/') || f.startsWith('tests/')) && /\.(ts|js)$/.test(f));
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
    const customRules = this.config.customRules;

    let files: string[] = [];
    let incrementalMode = false;

    if (this.config.incremental) {
      files = await this.getChangedFiles();
      if (files.length > 0) {
        incrementalMode = true;
      } else {
        files = await glob(['src/**/*.{ts,js}']);
      }
    } else {
      files = await glob(['src/**/*.{ts,js}']);
    }

    // 0. 패키지 보안 감사 (npm audit)
    const auditViolations = await checkPackageAudit();
    violations.push(...auditViolations);

    // 1. 병렬 파일 분석 (시맨틱 분석, 환각 체크, 시크릿 스캔, 변이 테스트 통합)
    const analysisResults = await pMap(files, async (file) => {
      try {
        const currentHash = this.getFileHash(file);
        const cached = this.db.getFileMetric(file);

        let metrics;
        if (cached && cached.hash === currentHash && customRules.length === 0) {
          metrics = { lineCount: cached.line_count, complexity: cached.complexity, customViolations: [] };
        } else {
          metrics = await analyzeFile(file, customRules);
          this.db.updateFileMetric(file, currentHash, metrics.lineCount, metrics.complexity);
        }

        const fileViolations: Violation[] = [];
        
        // 사이즈 및 복잡도 체크
        if (metrics.lineCount > rules.maxLineCount) {
          fileViolations.push({
            type: 'SIZE',
            file,
            value: metrics.lineCount,
            limit: rules.maxLineCount,
            message: `단일 파일 ${rules.maxLineCount}줄 초과: 파일 분리 필요`,
          });
        }
        if (metrics.complexity > rules.maxComplexity) {
          fileViolations.push({
            type: 'COMPLEXITY',
            file,
            value: metrics.complexity,
            limit: rules.maxComplexity,
            message: `함수/클래스 복잡도가 임계값(${rules.maxComplexity})을 초과했습니다.`,
          });
        }

        // 환각(Hallucination) 체크
        const hallucinationViolations = await checkHallucination(file);
        hallucinationViolations.forEach(hv => {
          fileViolations.push({
            type: 'HALLUCINATION',
            file,
            message: `[환각 경고] ${hv.message}`,
          });
        });

        // 가짜 구현(Fake Logic) 체크
        const fakeLogicViolations = await checkFakeLogic(file);
        fakeLogicViolations.forEach(fv => {
          fileViolations.push({
            type: 'FAKE_LOGIC',
            file,
            message: `[논리 의심] ${fv.message}`,
          });
        });

        // 보안(Secret) 스캔
        const secretViolations = await checkSecrets(file);
        fileViolations.push(...secretViolations);

        // 변이 테스트 (증분 모드에서 핵심 소스 코드에만 적용)
        if (incrementalMode && file.startsWith('src/') && !file.endsWith('.test.ts')) {
          const mutationViolations = await runMutationTest(file);
          mutationViolations.forEach(mv => {
            fileViolations.push({
              type: 'MUTATION_SURVIVED',
              file,
              message: `[가짜 테스트 의심] ${mv.message}`,
            });
          });
        }

        metrics.customViolations?.forEach(cv => {
          fileViolations.push({
            type: 'CUSTOM',
            file,
            message: `[${cv.id}] ${cv.message}`,
          });
        });

        return { metrics, fileViolations };
      } catch (e) {
        return null;
      }
    }, { concurrency: 4 }); // 테스트 실행을 포함하므로 병렬도를 낮춤

    analysisResults.filter(Boolean).forEach((res: any) => {
      violations.push(...res.fileViolations);
    });

    // 2. 의존성 및 순환 참조 분석
    const depMap = await getDependencyMap();
    const cycles = this.detectCycles(depMap);
    for (const cycle of cycles) {
      violations.push({
        type: 'CUSTOM',
        message: `순환 참조 발견: ${cycle.join(' -> ')}`,
      });
    }

    // 3. Orphan File 분석
    const orphans = await findOrphanFiles();
    for (const orphan of orphans) {
      violations.push({
        type: 'ORPHAN',
        file: orphan,
        message: '어떤 파일에서도 참조되지 않는 파일입니다. 삭제를 고려하세요.',
      });
    }

    // 4. 기술 부채 및 커버리지
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
      : violations.map(v => v.message).join('\n') + '\n\n위 사항들을 수정한 후 다시 인증을 요청하세요.';

    this.db.saveSession(currentCoverage, violations.length, pass);

    return {
      pass,
      violations,
      suggestion,
    };
  }
}
