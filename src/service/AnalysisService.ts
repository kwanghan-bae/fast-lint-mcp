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
import { join, extname, relative, isAbsolute } from 'path';
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
   */
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

  /**
   * 전체 품질 체크 파이프라인을 실행합니다. (v3.7 Turbo)
   * 환경 검사, 파일 스캔, 의존성 분석, 개별 파일 분석, 기술 부채 및 커버리지 확인을 순차적으로 수행합니다.
   */
  async runAllChecks(): Promise<QualityReport> {
    // 1. 레거시 상태 파일 청소 (프로젝트 성역화)
    const legacyStateFile = join(this.workspacePath, '.fast-lint-state.json');
    if (existsSync(legacyStateFile)) {
      try {
        rmSync(legacyStateFile);
      } catch (e) {}
    }

    // 2. 실행 환경( ripgrep 등) 확인
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

    // 3. One-Pass 파일 스캔 및 의존성 그래프 구축
    let allProjectFiles = await getProjectFiles(this.workspacePath, ignorePatterns);
    
    // v3.7.3: 노이즈 파일(빌드 산출물, 미니파이) 2중 차단 - 리포트 오염 방지의 핵심
    allProjectFiles = allProjectFiles.filter(file => {
      const lower = file.toLowerCase();
      const isNoise = lower.includes('/dist/') || 
                      lower.includes('/.next/') || 
                      lower.includes('/out/') || 
                      lower.includes('/build/') || 
                      lower.includes('/coverage/') ||
                      lower.endsWith('.min.js') ||
                      lower.endsWith('.map');
      return !isNoise;
    });

    await this.depGraph.build(allProjectFiles);

    // 4. 분석 대상 파일 결정 (증분 vs 전체)
    if (this.config.incremental) {
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

    // 5. 자가 치유(Self-Healing) 및 정적 분석 수행
    const healingMessages: string[] = [];
    for (const provider of this.providers) {
      const targetFiles = files
        .filter((f) => provider.extensions.includes(extname(f)))
        .map((f) => (isAbsolute(f) ? f : join(this.workspacePath, f)));
      if (targetFiles.length > 0 && provider.fix) {
        const res = await provider.fix(targetFiles, this.workspacePath);
        healingMessages.push(...res.messages);
      }
    }

    const fileViolations = await this.performFileAnalysis(files);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    // 6. 기술 부채(TODO) 스캔
    const techDebtCount = await countTechDebt(this.workspacePath, ignorePatterns);
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    // 7. 테스트 커버리지 검증 및 신선도 검사
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
        const lastSrcUpdate =
          files.length > 0
            ? Math.max(
                ...files.map((f) => {
                  try {
                    return statSync(isAbsolute(f) ? f : join(this.workspacePath, f)).mtimeMs;
                  } catch (e) {
                    return 0;
                  }
                })
              )
            : 0;

        const isStale = coverageStat.mtimeMs < lastSrcUpdate - 60000;
        const content = readFileSync(coveragePath, 'utf-8');

        if (coveragePath.endsWith('.json')) {
          const coverageData = JSON.parse(content);
          currentCoverage = coverageData.total?.lines?.pct ?? 0;
        } else if (coveragePath.endsWith('lcov.info')) {
          const lines = content.split('\n');
          const found = lines
            .filter((l) => l.startsWith('LF:'))
            .reduce((a, b) => a + parseInt(b.split(':')[1]), 0);
          const hit = lines
            .filter((l) => l.startsWith('LH:'))
            .reduce((a, b) => a + parseInt(b.split(':')[1]), 0);
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

    // 8. 세션 간 품질 하락 감지 (가드레일)
    const lastCoverage = await this.stateManager.getLastCoverage();
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

    // 9. 최종 결과 요약 생성
    let suggestion = '';
    if (allProjectFiles.length === 0) {
      pass = false;
      violations.push({ type: 'ENV', message: '분석할 소스 파일을 찾지 못했습니다.' });
      suggestion = `분석 대상 파일이 없습니다. [${this.workspacePath}] 디렉토리를 확인하세요.`;
    } else {
      const modeDesc = incrementalMode ? '증분 분석' : '전체 분석';
      suggestion = pass
        ? `모든 품질 인증 기준을 통과했습니다. (v3.7.0 / 대상: ${files.length}개, ${modeDesc})`
        : violations.map((v) => v.message).join('\n') +
          `\n\n(v3.7.0 / 총 ${files.length}개 파일 분석됨 - ${modeDesc})`;
    }

    if (healingMessages.length > 0) {
      suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    // 10. 캐시 정리 및 상태 저장
    AstCacheManager.getInstance().clear();
    clearProjectFilesCache();
    clearPathCache();
    await this.stateManager.saveCoverage(currentCoverage);
    return { pass, violations, suggestion };
  }
}
