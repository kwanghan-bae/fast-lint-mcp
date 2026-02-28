import { readFileSync, existsSync } from 'fs';
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
   * @param stateManager 품질 세션 상태(커버리지 등)를 관리하는 매니저
   * @param config 프로젝트 설정 정보 서비스
   * @param semantic 시맨틱 분석(심볼 인덱싱 등)을 담당하는 서비스
   */
  constructor(
    private stateManager: StateManager,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.git = simpleGit();
    this.providers.push(new JavascriptProvider(this.config));
    this.depGraph = new DependencyGraph();
  }

  /**
   * Git 상태를 분석하여 마지막 분석 이후 수정되거나 새로 생성된 파일 목록을 가져옵니다.
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
      return [...new Set(changedFiles)].filter((f) => supportedExts.includes(extname(f)));
    } catch (error) {
      // Git 명령 실패 시 빈 목록 반환 (안전한 폴백)
      return [];
    }
  }

  /**
   * 대상 파일들에 대해 정밀 분석을 수행합니다.
   * Native Rust (ast-grep) 기반으로 초고속(Zero-Cache) 분석을 수행합니다.
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

          // 캐시 없이 항상 최신 상태로 정밀 분석 수행
          const fileViolations = await provider.check(file);
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
   * 4. 파일별 정적 분석 및 구조적 무결성 검사
   * 5. 기술 부채(TODO) 및 테스트 커버리지 검증
   * @returns 최종 품질 리포트 객체
   */
  async runAllChecks(): Promise<QualityReport> {
    // 필수 도구 설치 여부 확인
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

    // 고속 의존성 그래프 빌드
    await this.depGraph.build();

    // 분석 모드 결정: 설정에 따라 변경된 파일만 분석하거나 전체 분석 수행
    if (this.config.incremental) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const affectedFiles = new Set<string>(changedFiles);

        // 지능형 역의존성 추적
        for (const file of changedFiles) {
          try {
            const fullPath = join(process.cwd(), file);
            const dependents = this.depGraph.getDependents(fullPath);
            dependents.forEach((dep) => {
              const relativeDep = relative(process.cwd(), dep);
              if (supportedExts.includes(extname(relativeDep))) {
                affectedFiles.add(relativeDep);
              }
            });
          } catch (e) {
            // 개별 파일 오류 무시
          }
        }
        files = Array.from(affectedFiles);
      } else {
        files = await glob(
          supportedExts.map((ext) => `**/*${ext}`),
          { ignore: ignorePatterns }
        );
      }
    } else {
      files = await glob(
        supportedExts.map((ext) => `**/*${ext}`),
        { ignore: ignorePatterns }
      );
    }

    // 자가 치유(Self-Healing)
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

    // 프로젝트 아키텍처 및 구조 분석
    const structuralViolations = checkStructuralIntegrity(this.depGraph);

    violations.push(...fileViolations, ...structuralViolations);

    // 기술 부채 스캔
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
        // 리포트 파싱 에러 시 0%로 간주
      }
    } else if (rules.minCoverage > 0) {
      violations.push({
        type: 'COVERAGE',
        message: '테스트 커버리지 리포트를 찾을 수 없습니다. 테스트를 먼저 실행하세요.',
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

    // 이전 세션 대비 커버리지 하락 여부 확인
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

    // 최종 결과 메시지 구성
    let suggestion = '';

    if (files.length === 0) {
      pass = false;
      violations.push({
        type: 'ENV',
        message: '분석할 소스 파일을 찾지 못했습니다. 프로젝트 구조를 확인하세요.',
      });
      suggestion =
        '분석 대상 파일이 없습니다. .fast-lintrc의 exclude 설정이나 디렉토리 구조를 확인하세요.';
    } else {
      const modeDesc = incrementalMode 
        ? 'Git 변경 및 역의존성 기반 증분 분석' 
        : '프로젝트 전체 정밀 분석';
        
      suggestion = pass
        ? `모든 품질 인증 기준을 통과했습니다. (v2.1.2 / 대상 파일: ${files.length}개, 모드: ${modeDesc})`
        : violations.map((v) => v.message).join('\n') +
          `\n\n(v2.1.2 / 총 ${files.length}개 파일 분석됨 - ${modeDesc}) 위 사항들을 수정한 후 다시 인증을 요청하세요.`;
    }

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    // 이번 분석 세션 정보를 상태 파일에 기록
    this.stateManager.saveCoverage(currentCoverage);

    return { pass, violations, suggestion };
  }
}
