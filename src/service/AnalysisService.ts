import { readFileSync, existsSync, statSync, rmSync } from 'fs';
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
import { join, extname, relative, isAbsolute, dirname, normalize } from 'path';
import os from 'os';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 개별 파일 분석 결과를 담는 내부 인터페이스입니다.
 */
interface AnalysisResult {
  fileViolations: Violation[];
}

/**
 * 프로젝트 전체의 코드 품질 분석 프로세스를 관장하는 메인 서비스 클래스입니다.
 * 각 언어별 프로바이더를 조율하고 의존성 그래프를 구축하여 종합적인 품질 리포트를 생성합니다.
 */
export class AnalysisService {
  /** Git 명령 실행을 위한 인스턴스 */
  private git: SimpleGit;
  /** 등록된 언어별 품질 검사 프로바이더 목록 */
  private providers: QualityProvider[] = [];
  /** 프로젝트 의존성 분석을 위한 그래프 인스턴스 */
  private depGraph: DependencyGraph;
  /** 현재 분석 중인 프로젝트의 절대 경로 */
  private workspacePath: string;

  /**
   * AnalysisService 인스턴스를 초기화합니다.
   * @param stateManager 품질 상태(커버리지 등) 관리자
   * @param config 프로젝트 설정 서비스
   * @param semantic 시맨틱 분석 서비스
   */
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

  /**
   * Git 상태를 확인하여 변경된 파일 목록을 가져옵니다.
   * 지원되는 확장자를 가진 파일들만 필터링하여 반환합니다.
   */
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

  /**
   * 병렬 처리를 통해 각 파일에 대한 품질 분석을 수행합니다.
   * @param files 분석 대상 파일 경로 목록
   * @param options 동적 분석 옵션
   */
  private async performFileAnalysis(files: string[], options?: {
    securityThreshold?: number;
    maxLines?: number;
    maxComplexity?: number;
  }): Promise<Violation[]> {
    const cpuCount = os.cpus().length;
    const analysisResults = await pMap(
      files,
      async (file) => {
        try {
          // v4.0.0: 이벤트 루프 차단 방지를 위한 양보 (Responsive MCP)
          await new Promise((resolve) => setImmediate(resolve));

          const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
          const ext = extname(fullPath);
          const provider = this.providers.find((p) => p.extensions.includes(ext));
          if (!provider) return null;
          const fileViolations = await provider.check(fullPath, options);
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

  /**
   * 전체 품질 체크 파이프라인을 실행합니다. (v3.9.0 Multi-Module Pro)
   * 동적 파라미터를 지원하며, 상세한 메타데이터와 추론 근거를 포함한 리포트를 생성합니다.
   * @param options 동적 임계값 및 분석 옵션
   */
  async runAllChecks(options: {
    securityThreshold?: number;
    maxLines?: number;
    maxComplexity?: number;
    incremental?: boolean;
    coveragePath?: string;
  } = {}): Promise<QualityReport> {
    // 1. 레거시 상태 파일 청소
    const legacyStateFile = join(this.workspacePath, '.fast-lint-state.json');
    if (existsSync(legacyStateFile)) {
      try {
        rmSync(legacyStateFile);
      } catch (e) {}
    }

    // 2. 실행 환경 확인
    const envResult = await checkEnv();
    if (!envResult.pass) {
      return {
        pass: false,
        violations: [{ type: 'ENV', message: envResult.suggestion || '필수 도구 누락' }],
        suggestion: '필수 도구를 설치하세요.',
      };
    }

    const violations: Violation[] = [];
    const rules = { ...this.config.rules }; // 런타임 수정을 위해 복사본 사용
    
    // 동적 파라미터 적용 (v3.8)
    if (options.maxLines) rules.maxLineCount = options.maxLines;
    if (options.maxComplexity) rules.maxComplexity = options.maxComplexity;
    const incrementalOption = options.incremental ?? this.config.incremental;

    let files: string[] = [];
    let incrementalMode = false;

    const supportedExts = this.providers.flatMap((p) => p.extensions);
    const ignorePatterns = this.config.exclude;

    // 3. One-Pass 파일 스캔
    let allProjectFiles = await getProjectFiles(this.workspacePath, ignorePatterns);
    allProjectFiles = allProjectFiles.filter((file) => {
      const lower = file.toLowerCase();
      const isExcluded = ignorePatterns.some((p) =>
        new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(file)
      );
      const isCommonNoise =
        lower.includes('/dist/') ||
        lower.includes('/.next/') ||
        lower.includes('/out/') ||
        lower.includes('/build/') ||
        lower.includes('/coverage/') ||
        lower.endsWith('.min.js') ||
        lower.endsWith('.map');
      return !isExcluded && !isCommonNoise;
    });

    await this.depGraph.build(allProjectFiles);

    // 4. 분석 대상 파일 결정
    if (incrementalOption) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const filteredChanges = changedFiles.filter((file) => {
          return !ignorePatterns.some((pattern) => {
            const regex = new RegExp(
              '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
            );
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
              const isIgnored = ignorePatterns.some((p) =>
                new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(
                  relativeDep
                )
              );
              if (supportedExts.includes(extname(relativeDep)) && !isIgnored) {
                affectedFiles.add(relativeDep);
              }
            });
          } catch (e) {}
        }
        files = Array.from(affectedFiles);
      } else {
        files = allProjectFiles.filter((f) => supportedExts.includes(extname(f)));
      }
    } else {
      files = allProjectFiles.filter((f) => supportedExts.includes(extname(f)));
    }

    // 5. 소스 파일 최신 수정 시간 기록 (v3.9.1: 병렬 처리로 성능 개선)
    const lastSrcUpdate =
      files.length > 0
        ? Math.max(
            ...(await pMap(
              files,
              async (f) => {
                try {
                  return statSync(isAbsolute(f) ? f : join(this.workspacePath, f)).mtimeMs;
                } catch (e) {
                  return 0;
                }
              },
              { concurrency: os.cpus().length }
            ))
          )
        : 0;


    // 6. 자가 치유 및 정적 분석 수행
    // v3.8: 프로바이더에게 런타임 옵션 전달 로직 추가 예정
    const fileViolations = await this.performFileAnalysis(files, options);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    // 7. 기술 부채 스캔
    const techDebtCount = await countTechDebt(this.workspacePath, ignorePatterns);
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    // 8. 테스트 커버리지 및 신선도 메타데이터 생성
    let currentCoverage = 0;
    let coverageFreshness: 'fresh' | 'stale' | 'missing' = 'missing';
    let coverageLastUpdated = '';
    const fileCoverageMap = new Map<string, { total: number; hit: number }>();

    // v3.9.0: 재귀적 커버리지 탐색 및 수동 경로 지원
    let coveragePath = '';
    
    if (options.coveragePath) {
      const manualPath = isAbsolute(options.coveragePath) 
        ? options.coveragePath 
        : join(this.workspacePath, options.coveragePath);
      if (existsSync(manualPath)) {
        coveragePath = manualPath;
      }
    }

    if (!coveragePath) {
      const fastCandidates = [
        rules.coveragePath,
        join(this.workspacePath, rules.coverageDirectory, 'coverage-summary.json'),
        join(this.workspacePath, rules.coverageDirectory, 'lcov.info'),
        join(this.workspacePath, 'coverage', 'lcov.info'),
        join(this.workspacePath, 'lcov.info'),
      ].filter(Boolean) as string[];

      for (const cand of fastCandidates) {
        const fullCand = isAbsolute(cand) ? cand : join(this.workspacePath, cand);
        if (existsSync(fullCand)) {
          coveragePath = fullCand;
          break;
        }
      }
    }

    // 여전히 못 찾았다면 하위 디렉토리 재귀적 검색 (v3.9.1: 탐색 범위 최적화)
    if (!coveragePath) {
      try {
        const foundReports = await glob(['**/lcov.info', '**/coverage-summary.json'], {
          cwd: this.workspacePath,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**', '**/.next/**'],
          deep: 5 // 깊이 제한으로 성능 보호
        });
        
        if (foundReports.length > 0) {
          const sorted = foundReports.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
          coveragePath = sorted[0];
        }
      } catch (e) {}
    }

    if (coveragePath) {
      try {
        const coverageStat = statSync(coveragePath);
        coverageLastUpdated = coverageStat.mtime.toISOString();
        const isStale = coverageStat.mtimeMs < lastSrcUpdate - 300000;
        coverageFreshness = isStale ? 'stale' : 'fresh';

        const content = readFileSync(coveragePath, 'utf-8');

        if (coveragePath.endsWith('.json')) {
          const coverageData = JSON.parse(content);
          currentCoverage = coverageData.total?.lines?.pct ?? 0;
        } else if (coveragePath.endsWith('lcov.info')) {
          // v4.1.0: 파일별 상세 커버리지 맵 구축
          const lines = content.split(/\r?\n/);
          let currentFile = '';
          let totalLines = 0;
          let hitLines = 0;

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('SF:')) {
              const rawPath = trimmedLine.split(':')[1];
              currentFile = normalize(isAbsolute(rawPath) ? rawPath : join(dirname(coveragePath), '..', rawPath));
            } else if (trimmedLine.startsWith('LF:')) {
              const val = parseInt(trimmedLine.split(':')[1].trim());
              if (!isNaN(val)) {
                totalLines += val;
                if (currentFile) {
                  if (!fileCoverageMap.has(currentFile)) fileCoverageMap.set(currentFile, { total: 0, hit: 0 });
                  fileCoverageMap.get(currentFile)!.total = val;
                }
              }
            } else if (trimmedLine.startsWith('LH:')) {
              const val = parseInt(trimmedLine.split(':')[1].trim());
              if (!isNaN(val)) {
                hitLines += val;
                if (currentFile) {
                  if (!fileCoverageMap.has(currentFile)) fileCoverageMap.set(currentFile, { total: 0, hit: 0 });
                  fileCoverageMap.get(currentFile)!.hit = val;
                }
              }
            }
          }
          currentCoverage = totalLines > 0 ? (hitLines / totalLines) * 100 : 0;
        }

        if (isStale && rules.minCoverage > 0) {
          violations.push({
            type: 'COVERAGE',
            message: `테스트 리포트가 소스 코드보다 오래되었습니다 (만료됨). 최신 커버리지를 반영하려면 'npm test'를 실행하세요.`,
            rationale: `리포트: ${coveragePath.split('/').pop()}, 시각: ${coverageLastUpdated}`,
          });
        }
      } catch (e) {}
    } else if (rules.minCoverage > 0) {
      violations.push({
        type: 'COVERAGE',
        message: `테스트 커버리지 리포트를 찾을 수 없습니다. 다중 모듈 프로젝트라면 'coveragePath' 옵션을 사용하거나 각 모듈에서 테스트를 실행하세요.`,
        rationale: `검색 루트: ${this.workspacePath}`,
      });
    }

    if (currentCoverage < rules.minCoverage && coveragePath !== '') {
      // v4.1.0: 취약 파일(Low Coverage) 분석 및 리포팅
      const lowCoverageFiles = Array.from(fileCoverageMap.entries())
        .map(([file, data]) => ({
          file: relative(this.workspacePath, file),
          pct: data.total > 0 ? (data.hit / data.total) * 100 : 0
        }))
        .filter(f => !f.file.includes('node_modules') && !f.file.includes('tests/'))
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 5);

      const fileList = lowCoverageFiles.map(f => `${f.file.split('/').pop()}(${f.pct.toFixed(1)}%)`).join(', ');

      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage.toFixed(1)}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다.`,
        rationale: `현재: ${currentCoverage.toFixed(1)}% / 기준: ${rules.minCoverage}% (취약: ${fileList || 'N/A'})`,
      });
    }

    // 9. 최종 리포트 및 메타데이터 구성
    const lastCoverage = await this.stateManager.getLastCoverage();
    let pass = violations.length === 0;

    // v4.2.0: 커버리지 인사이트 (Top 3 취약 파일) 추출 로직
    const allFileCoverage = Array.from(fileCoverageMap.entries())
      .map(([file, data]) => ({
        file: relative(this.workspacePath, file),
        pct: data.total > 0 ? (data.hit / data.total) * 100 : 0
      }))
      .filter(f => !f.file.includes('node_modules') && !f.file.includes('tests/'))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

    const coverageInsight = allFileCoverage.length > 0
      ? `\n### 💡 Coverage Insights (Top 3 Vulnerable Files)\n${allFileCoverage.map(f => `- \`${f.file}\`: **${f.pct.toFixed(1)}%**`).join('\n')}\n`
      : '';

    if (lastCoverage !== null && currentCoverage < lastCoverage) {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage.toFixed(1)}%`,
        limit: `${lastCoverage}%`,
        message: `이전 세션보다 커버리지가 하락했습니다.`,
      });
      pass = false;
    }

    const report: QualityReport = {
      pass,
      violations,
      suggestion: (pass ? '모든 품질 기준을 통과했습니다.' : '위반 사항을 조치하세요.') + (coverageInsight ? `\n${coverageInsight}` : ''),
      metadata: {
        version: 'v4.2.0', // Full Coverage Transparency
        timestamp: new Date().toISOString(),
        coverageFreshness,
        coverageLastUpdated,
        coveragePercentage: currentCoverage,
        analysisMode: incrementalMode ? 'incremental' : 'full',
        filesAnalyzed: files.length,
      },
    };


    // 캐시 정리 및 상태 저장
    AstCacheManager.getInstance().clear();
    clearProjectFilesCache();
    clearPathCache();
    await this.stateManager.saveCoverage(currentCoverage);
    return report;
  }
}
