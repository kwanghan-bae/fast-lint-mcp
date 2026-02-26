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

interface AnalysisResult {
  fileViolations: Violation[];
}

/**
 * 프로젝트 전체의 코드 품질 분석 프로세스를 관장하는 메인 서비스 클래스입니다.
 * 환경 진단, 증분 분석, 파일별 메트릭 측정, 커버리지 검증 및 자가 치유(Self-Healing) 로직을 통합 실행합니다.
 */
export class AnalysisService {
  // Git 저장소 상태를 조회하고 변경된 파일을 추적하기 위한 SimpleGit 인스턴스
  private git: SimpleGit;
  // 소스 코드 분석을 수행하는 언어별 프로바이더(예: JavascriptProvider) 목록
  private providers: QualityProvider[] = [];
  // 파일 간의 임포트 관계를 파악하여 증분 분석 범위를 결정하는 의존성 그래프
  private depGraph: DependencyGraph;

  /**
   * AnalysisService 인스턴스를 생성합니다.
   * @param db 품질 이력 및 캐시 저장을 위한 데이터베이스 인스턴스
   * @param config 프로젝트 설정 정보 서비스
   * @param semantic 시맨틱 분석(심볼 인덱싱 등)을 담당하는 서비스
   */
  constructor(
    private db: QualityDB,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.git = simpleGit();
    this.providers.push(new JavascriptProvider(this.config));
    this.depGraph = new DependencyGraph();
  }

  /**
   * 파일의 무결성 검사 및 캐싱 여부 판단을 위해 SHA-256 해시값을 생성합니다.
   * @param filePath 대상 파일 경로
   * @returns 16진수 해시 문자열
   */
  private getFileHash(filePath: string): string {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Git 상태를 분석하여 마지막 분석 이후 수정되거나 새로 생성된 파일 목록을 가져옵니다.
   * src/ 디렉토리 내의 지원되는 확장자(ts, js 등) 파일만 필터링합니다.
   */
  private async getChangedFiles(): Promise<string[]> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) return [];

      const status = await this.git.status();
      // 수정됨, 추적되지 않음, 생성됨, 스테이징됨, 이름 변경됨 등 모든 변경 사항을 통합
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
      // Git 명령 실패 시 빈 목록 반환 (안전한 폴백)
      return [];
    }
  }

  /**
   * 대상 파일들에 대해 정밀 분석을 수행합니다.
   * 파일 수정 시간(mtime) 및 해시 기반 캐시를 활용하여 분석 속도를 최적화하며,
   * CPU 코어 수를 고려한 병렬 처리를 수행합니다.
   * @param files 분석할 파일 경로 목록
   */
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

          // 1차 최적화: 파일 수정 시간이 동일하면 분석 생략
          if (cachedMetric && cachedMetric.mtime_ms === stats.mtimeMs) {
            return {
              fileViolations: JSON.parse(cachedMetric.violations || '[]'),
            } as AnalysisResult;
          }

          const currentHash = this.getFileHash(file);
          // 2차 최적화: 파일 내용의 해시값이 동일하면 캐시된 데이터 활용
          if (cachedMetric && cachedMetric.hash === currentHash) {
            this.db.updateFileMetric(
              file,
              currentHash,
              stats.mtimeMs,
              cachedMetric.line_count,
              cachedMetric.complexity,
              JSON.parse(cachedMetric.violations)
            );
            return {
              fileViolations: JSON.parse(cachedMetric.violations || '[]'),
            } as AnalysisResult;
          }

          // 캐시가 없거나 파일이 변경된 경우 실제 분석 수행
          const fileViolations = await provider.check(file);
          const metrics = await analyzeFile(file);
          const lineCount = metrics.lineCount;

          // 분석 결과 데이터베이스 업데이트
          this.db.updateFileMetric(
            file,
            currentHash,
            stats.mtimeMs,
            lineCount,
            metrics.complexity,
            fileViolations
          );

          return { fileViolations } as AnalysisResult;
        } catch (e) {
          // 개별 파일 처리 중 오류 발생 시 해당 파일은 건너뜀
          return null;
        }
      },
      // CPU 자원을 효율적으로 사용하기 위해 병렬도 조절
      { concurrency: Math.max(1, cpuCount - 1) }
    );

    const violations: Violation[] = [];
    analysisResults.forEach((res) => {
      if (res) {
        violations.push(...res.fileViolations);
      }
    });
    return violations;
  }

  /**
   * 프로젝트의 모든 품질 인증 항목을 순차적으로 검사합니다.
   * 1. 환경 진단 (필수 도구 체크)
   * 2. 의존성 그래프 빌드 및 증분 분석 범위 결정
   * 3. 자가 치유(Linter/Formatter 자동 적용)
   * 4. 파일별 정적 분석 및 구조적 무결성(순환 참조 등) 검사
   * 5. 기술 부채(TODO) 및 테스트 커버리지 검증
   * @returns 최종 품질 리포트 객체
   */
  async runAllChecks(): Promise<QualityReport> {
    // 필수 도구(ripgrep 등) 설치 여부 확인
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

    // 고속 의존성 그래프 빌드 (Regex 기반, 프로젝트 구조 파악용)
    await this.depGraph.build();

    // 분석 모드 결정: 설정에 따라 변경된 파일만 분석하거나 전체 분석 수행
    if (this.config.incremental) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const affectedFiles = new Set<string>(changedFiles);

        // 지능형 역의존성 추적: 수정된 파일을 임포트하는 상위 파일들도 분석 범위에 포함
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
            // 개별 파일 오류 무시 (안정성 보장)
          }
        }
        files = Array.from(affectedFiles);
      } else {
        // 변경 사항이 없으면 전체 파일 대상으로 검사
        files = await glob(
          supportedExts.map((ext) => `src/**/*${ext}`),
          { ignore: ignorePatterns }
        );
      }
    } else {
      // 전체 분석 모드
      files = await glob(
        supportedExts.map((ext) => `src/**/*${ext}`),
        { ignore: ignorePatterns }
      );
    }

    // 자가 치유(Self-Healing): 린트 및 포맷 오류 자동 수정 시도
    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files.filter((f) => provider.extensions.includes(extname(f)));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, process.cwd());
        healingMessages.push(...res.messages);
      }
    }

    // 개별 파일의 상세 품질 분석 수행
    const fileViolations = await this.performFileAnalysis(files);

    // 프로젝트 아키텍처 및 구조 분석 (통합된 의존성 그래프 활용)
    const structuralViolations = checkStructuralIntegrity(this.depGraph);

    violations.push(...fileViolations, ...structuralViolations);

    // 기술 부채 스캔: TODO, FIXME 등의 키워드 개수 측정
    const techDebtCount = await countTechDebt();
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    // 테스트 커버리지 검증 프로세스
    let currentCoverage = 0;
    const coverageCandidates = [
      join(process.cwd(), 'coverage', 'coverage-summary.json'),
      join(process.cwd(), 'coverage-summary.json'),
      'coverage/coverage-summary.json',
    ];

    let coveragePath = '';
    // 다양한 경로에서 커버리지 리포트 탐색
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
        // 라인 커버리지 퍼센트 추출
        currentCoverage = coverageData.total.lines.pct || 0;
      } catch (e) {
        // 리포트 파싱 에러 시 0%로 간주하고 로깅 없이 통과
      }
    } else if (rules.minCoverage > 0) {
      // 설정된 최소 커버리지가 있는데 리포트가 없는 경우 차단
      violations.push({
        type: 'COVERAGE',
        message: '테스트 커버리지 리포트를 찾을 수 없습니다. 테스트를 먼저 실행하세요.',
      });
    }

    // 커버리지 기준치 미달 여부 확인
    if (currentCoverage < rules.minCoverage && coveragePath !== '') {
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다.`,
      });
    }

    // 이전 세션 대비 커버리지 하락 여부 확인 (품질 저하 방지)
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

    // 최종 결과 메시지 구성
    let suggestion = pass
      ? `모든 품질 인증 기준을 통과했습니다. (모드: ${incrementalMode ? '증분' : '전체'})`
      : violations.map((v) => v.message).join('\n') +
        '\n\n위 사항들을 수정한 후 다시 인증을 요청하세요.';

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    // 이번 분석 세션 정보를 이력에 기록
    this.db.saveSession(currentCoverage, violations.length, pass);

    return { pass, violations, suggestion };
  }
}
