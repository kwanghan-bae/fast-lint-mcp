import { readFileSync, existsSync, statSync } from 'fs';
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
import { getProjectFiles, clearProjectFilesCache } from '../analysis/import-check.js';
import { clearPathCache } from '../utils/PathResolver.js';
import { join, extname, relative, isAbsolute, normalize } from 'path';
import os from 'os';
import { AstCacheManager } from '../utils/AstCacheManager.js';
import { SYSTEM, VERSION } from '../constants.js';
import { CoverageAnalyzer } from '../utils/CoverageAnalyzer.js';
import { runBatchAnalysisNative } from '../../native/index.js';

/**
 * 품질 분석 결과를 담는 내부 인터페이스입니다.
 */
interface AnalysisResult {
  fileViolations: Violation[];
}

/**
 * 프로젝트 전반의 코드 품질을 통합 관리하고 분석을 지시하는 메인 서비스 클래스입니다.
 * v5.4.1: CoverageAnalyzer 분리를 통해 파일 크기 및 복잡도를 최적화했습니다.
 */
export class AnalysisService {
  private workspacePath: string;
  private git: SimpleGit;
  private providers: QualityProvider[] = [];
  private depGraph: DependencyGraph;
  private coverageAnalyzer: CoverageAnalyzer;

  /**
   * AnalysisService 인스턴스를 생성하고 의존성을 주입받습니다.
   */
  constructor(
    private stateManager: StateManager,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.workspacePath = this.config.workspacePath || process.cwd();
    this.git = simpleGit(this.workspacePath);
    this.depGraph = new DependencyGraph(this.workspacePath);
    this.coverageAnalyzer = new CoverageAnalyzer(this.workspacePath);

    this.providers.push(new JavascriptProvider(this.config, this.semantic));
    this.providers.push(new KotlinProvider(this.config, this.semantic));
  }

  /**
   * 전체 품질 체크 파이프라인을 실행합니다. (SOP 준수)
   */
  async runAllChecks(
    options: {
      securityThreshold?: number;
      maxLines?: number;
      maxComplexity?: number;
      incremental?: boolean;
      forceFullScan?: boolean;
      coveragePath?: string;
    } = {}
  ): Promise<QualityReport> {
    // 1. 실행 환경 사전 점검
    const envCheck = await this.validateEnvironment();
    if (!envCheck.pass) return envCheck.report!;

    const violations: Violation[] = [];
    const rules = this.resolveRules(options);

    // forceFullScan이 true이면 incrementalOption을 강제로 false로 설정
    const incrementalOption = options.forceFullScan
      ? false
      : (options.incremental ?? this.config.incremental);

    // 2. 프로젝트 파일 스캔 및 의존성 구축
    const allProjectFiles = await this.scanProjectFiles();
    await this.depGraph.build(allProjectFiles);

    // 3. 분석 대상 파일 확정
    const files = await this.resolveTargetFiles(incrementalOption, allProjectFiles);
    const lastSrcUpdate = await this.getLatestMtime(files);

    // 4. 품질 분석 수행 (자가 치유 포함)
    const healingMessages = await this.performSelfHealing(files);
    const fileViolations = await this.performFileAnalysis(files, options);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    // 5. 기술 부채 및 커버리지 분석 (Delegated)
    await this.scanTechDebt(allProjectFiles, rules, violations);
    const coverage = await this.coverageAnalyzer.analyze(
      options,
      rules,
      lastSrcUpdate,
      allProjectFiles,
      violations
    );

    // 6. 지능형 자동 딥다이브 (Intelligent Turn Optimization)
    const deepDive = this.performDeepDive(violations);

    // 7. 최종 리포트 조립 및 상태 저장
    const report = await this.assembleFinalReport(
      violations,
      coverage,
      deepDive,
      healingMessages,
      files,
      incrementalOption && files.length < allProjectFiles.length
    );
    this.cleanupCaches();
    return report;
  }

  /** 실행 환경의 무결성을 검증합니다. */
  private async validateEnvironment() {
    const envResult = await checkEnv();
    if (!envResult.pass) {
      return {
        pass: false,
        report: {
          pass: false,
          violations: [{ type: 'ENV', message: envResult.suggestion || '필수 도구 누락' }],
          suggestion: '필수 도구를 설치하세요.',
        } as QualityReport,
      };
    }
    return { pass: true };
  }

  /** 런타임 옵션을 반영한 최종 규칙을 반환합니다. */
  private resolveRules(options: any) {
    const rules = { ...this.config.rules };
    if (options.maxLines) rules.maxLineCount = options.maxLines;
    if (options.maxComplexity) rules.maxComplexity = options.maxComplexity;
    return rules;
  }

  /** 프로젝트 파일 목록을 스캔합니다. (기본 제외 패턴 적용) */
  private async scanProjectFiles() {
    const ignorePatterns = [...SYSTEM.DEFAULT_IGNORE_PATTERNS, ...(this.config.exclude || [])];
    return await getProjectFiles(this.workspacePath, ignorePatterns);
  }

  /** 분석 대상 파일들을 결정합니다. (증분 모드 지원) */
  private async resolveTargetFiles(incremental: boolean, allFiles: string[]) {
    const supportedExts = this.providers.flatMap((p) => p.extensions);
    if (!incremental) return allFiles.filter((f) => supportedExts.includes(extname(f)));
    const changedFiles = await this.getChangedFiles();
    if (changedFiles.length === 0)
      return allFiles.filter((f) => supportedExts.includes(extname(f)));
    const affected = new Set<string>();
    changedFiles.forEach((file) => {
      const full = isAbsolute(file) ? file : join(this.workspacePath, file);
      if (full.startsWith(this.workspacePath)) {
        affected.add(relative(this.workspacePath, full));
        this.depGraph.getDependents(full).forEach((d) => {
          if (d.startsWith(this.workspacePath)) affected.add(relative(this.workspacePath, d));
        });
      }
    });
    return Array.from(affected).filter((f) => supportedExts.includes(extname(f)));
  }

  /** Git 상태로부터 변경된 파일 목록을 가져옵니다. */
  private async getChangedFiles() {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) return [];
      const status = await this.git.status();
      return [...status.modified, ...status.not_added, ...status.created, ...status.staged].map(
        (f) => normalize(f)
      );
    } catch (e) {
      return [];
    }
  }

  /** 개별 파일들에 대한 품질 분석을 병렬로 수행합니다. */
  private async performFileAnalysis(files: string[], options: any) {
    const cpuCount = os.cpus().length;

    // v0.0.1: Rust Native Batch Analysis (Symbols + Secrets)
    const absFiles = files.map((f) => (isAbsolute(f) ? f : join(this.workspacePath, f)));
    const batchResults = runBatchAnalysisNative(absFiles);

    // 결과를 맵에 저장하여 Provider가 활용할 수 있게 함
    const batchMap = new Map(batchResults.map((r) => [normalize(r.file), r]));

    const analysisResults = await pMap(
      files,
      async (file) => {
        await new Promise((resolve) => setImmediate(resolve));
        const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
        const provider = this.providers.find((p) => p.extensions.includes(extname(fullPath)));
        if (!provider) return null;

        // 배치 결과 주입 (Provider가 내부적으로 사용하도록 옵션으로 전달)
        const fileViolations = await provider.check(fullPath, {
          ...options,
          batchResult: batchMap.get(normalize(fullPath)),
        });
        return { fileViolations } as AnalysisResult;
      },
      { concurrency: Math.max(1, cpuCount - SYSTEM.CONCURRENCY_MARGIN) }
    );
    const violations: Violation[] = [];
    analysisResults.forEach((res) => {
      if (res) violations.push(...res.fileViolations);
    });
    return violations;
  }

  /** 프로바이더를 통해 코드 자동 수정을 시도합니다. */
  private async performSelfHealing(files: string[]) {
    const messages: string[] = [];
    for (const provider of this.providers) {
      const targets = files
        .filter((f) => provider.extensions.includes(extname(f)))
        .map((f) => (isAbsolute(f) ? f : join(this.workspacePath, f)));
      if (targets.length > 0 && provider.fix) {
        const res = await provider.fix(targets, this.workspacePath);
        messages.push(...res.messages);
      }
    }
    return messages;
  }

  /** 기술 부채(TODO) 수치를 측정하고 위반 여부를 결정합니다. */
  private async scanTechDebt(allFiles: string[], rules: any, violations: Violation[]) {
    const techDebtCount = await countTechDebt(allFiles);
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }
  }

  /** 위반 파일들의 상세 심볼 데이터를 수집합니다. (Deep Dive) */
  private performDeepDive(violations: Violation[]) {
    const deepDive: { [file: string]: any[] } = {};
    const violationFiles = new Set<string>(
      violations.map((v) => v.file).filter(Boolean) as string[]
    );
    for (const vFile of Array.from(violationFiles)) {
      try {
        const full = isAbsolute(vFile) ? vFile : join(this.workspacePath, vFile);
        if (existsSync(full)) {
          const metrics = this.semantic.getSymbolMetrics(full);
          const problematic = metrics.filter((m) => m.complexity > 10 || m.lineCount > 50);
          if (problematic.length > 0) deepDive[vFile] = problematic;
        }
      } catch (e) {}
    }
    return deepDive;
  }

  /** 분석 결과를 최종 품질 리포트 객체로 구성합니다. */
  private async assembleFinalReport(
    violations: Violation[],
    cov: any,
    deepDive: any,
    healing: string[],
    files: string[],
    incremental: boolean
  ): Promise<QualityReport> {
    // v6.1.0: 위반 사항 중복 제거 (Deduplication)
    const uniqueViolations = Array.from(
      new Map(violations.map((v) => [`${v.type}:${v.file}:${v.line}:${v.message}`, v])).values()
    );

    const lastCoverage = await this.stateManager.getLastCoverage();
    let pass = uniqueViolations.length === 0;
    if (lastCoverage !== null && cov.currentCoverage < lastCoverage) {
      uniqueViolations.push({
        type: 'COVERAGE',
        message: `커버리지가 하락했습니다 (${lastCoverage.toFixed(1)}% -> ${cov.currentCoverage.toFixed(1)}%)`,
      });
      pass = false;
    }
    let suggestion = pass ? '모든 품질 기준을 통과했습니다.' : '위반 사항을 조치하세요.';
    if (healing.length > 0) suggestion += `\n\n[Self-Healing Result]\n${healing.join('\n')}`;
    await this.stateManager.saveCoverage(cov.currentCoverage);
    return {
      pass,
      violations: uniqueViolations,
      deepDive,
      suggestion: suggestion + (cov.coverageInsight ? `\n${cov.coverageInsight}` : ''),
      metadata: {
        version: VERSION,
        timestamp: new Date().toISOString(),
        coverageFreshness: cov.coverageFreshness,
        coverageLastUpdated: cov.coverageLastUpdated,
        coveragePercentage: cov.currentCoverage,
        analysisMode: incremental ? 'incremental' : 'full',
        filesAnalyzed: files.length,
      },
    };
  }

  /** 대상 파일들의 최신 수정 시간을 기록합니다. */
  private async getLatestMtime(files: string[]) {
    if (files.length === 0) return 0;
    const times = await pMap(
      files,
      async (f) => {
        try {
          return statSync(isAbsolute(f) ? f : join(this.workspacePath, f)).mtimeMs;
        } catch (e) {
          return 0;
        }
      },
      { concurrency: os.cpus().length }
    );
    return Math.max(...times);
  }

  /** 메모리 캐시를 정리합니다. */
  private cleanupCaches() {
    AstCacheManager.getInstance().clear();
    clearProjectFilesCache();
    clearPathCache();
  }
}
