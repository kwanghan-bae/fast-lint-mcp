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
import { VERSION } from '../index.js';
import { SYSTEM, COVERAGE } from '../constants.js';

/**
 * 개별 파일 분석 결과를 담는 내부 인터페이스입니다.
 */
interface AnalysisResult {
  fileViolations: Violation[];
}

/**
 * 프로젝트 전반의 코드 품질을 통합 관리하고 분석을 지시하는 메인 서비스 클래스입니다.
 */
export class AnalysisService {
  private workspacePath: string;
  private git: SimpleGit;
  private providers: QualityProvider[] = [];
  private depGraph: DependencyGraph;

  constructor(
    private stateManager: StateManager,
    private config: ConfigService,
    private semantic: SemanticService
  ) {
    this.workspacePath = this.config.workspacePath || process.cwd();
    this.git = simpleGit(this.workspacePath);
    this.depGraph = new DependencyGraph(this.workspacePath);

    // 지원하는 언어별 프로바이더 등록
    this.providers.push(new JavascriptProvider(this.config));
    this.providers.push(new KotlinProvider(this.config));
  }

  /**
   * Git 변경 사항을 바탕으로 분석이 필요한 파일 목록을 가져옵니다.
   */
  private async getChangedFiles(): Promise<string[]> {
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

  /**
   * 병렬 처리를 통해 각 파일에 대한 품질 분석을 수행합니다.
   * @param files 분석 대상 파일 경로 목록
   * @param options 동적 분석 옵션
   */
  private async performFileAnalysis(
    files: string[],
    options?: {
      securityThreshold?: number;
      maxLines?: number;
      maxComplexity?: number;
    }
  ): Promise<Violation[]> {
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
      { concurrency: Math.max(1, cpuCount - SYSTEM.CONCURRENCY_MARGIN) }
    );

    const violations: Violation[] = [];
    analysisResults.forEach((res) => {
      if (res) violations.push(...res.fileViolations);
    });
    return violations;
  }

  /**
   * 전체 품질 체크 파이프라인을 실행합니다. (v4.8.0 Enterprise Resilience)
   * @param options 동적 임계값 및 분석 옵션
   */
  async runAllChecks(
    options: {
      securityThreshold?: number;
      maxLines?: number;
      maxComplexity?: number;
      incremental?: boolean;
      coveragePath?: string;
    } = {}
  ): Promise<QualityReport> {
    // 1. 실행 환경 확인
    const envResult = await checkEnv();
    if (!envResult.pass) {
      return {
        pass: false,
        violations: [{ type: 'ENV', message: envResult.suggestion || '필수 도구 누락' }],
        suggestion: '필수 도구를 설치하세요.',
      };
    }

    const violations: Violation[] = [];
    const rules = { ...this.config.rules };
    if (options.maxLines) rules.maxLineCount = options.maxLines;
    if (options.maxComplexity) rules.maxComplexity = options.maxComplexity;
    const incrementalOption = options.incremental ?? this.config.incremental;

    let files: string[] = [];
    let incrementalMode = false;
    const supportedExts = this.providers.flatMap((p) => p.extensions);
    const ignorePatterns = this.config.exclude;

    // 2. 파일 스캔 및 의존성 그래프 구축 (v5.0: 시스템 기본 패턴 병합)
    const combinedIgnorePatterns = [
      ...SYSTEM.DEFAULT_IGNORE_PATTERNS,
      ...(ignorePatterns || []),
    ];
    let allProjectFiles = await getProjectFiles(this.workspacePath, combinedIgnorePatterns);
    await this.depGraph.build(allProjectFiles);

    // 3. 분석 대상 파일 결정 (v4.6.0 Strict Scoping)
    if (incrementalOption) {
      const changedFiles = await this.getChangedFiles();
      if (changedFiles.length > 0) {
        incrementalMode = true;
        const filteredChanges = changedFiles.filter((file) => {
          const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
          return fullPath.startsWith(this.workspacePath);
        });

        const affectedFiles = new Set<string>(filteredChanges);
        for (const file of filteredChanges) {
          try {
            const fullPath = isAbsolute(file) ? file : join(this.workspacePath, file);
            this.depGraph.getDependents(fullPath).forEach((dep) => {
              if (dep.startsWith(this.workspacePath)) {
                affectedFiles.add(relative(this.workspacePath, dep));
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

    // 4. 소스 파일 최신 수정 시간 기록 (병렬 처리)
    // 자가 치유(Self-Healing) 전의 시간을 기록하여 도구에 의한 수정을 무시함
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

    // 5. 자가 치유(Self-Healing) 및 정적 분석 수행 (v4.8.0 복구됨)
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

    const fileViolations = await this.performFileAnalysis(files, options);
    const structuralViolations = checkStructuralIntegrity(this.depGraph);
    violations.push(...fileViolations, ...structuralViolations);

    // 6. 기술 부채 스캔
    const techDebtCount = await countTechDebt(this.workspacePath, ignorePatterns);
    if (techDebtCount > rules.techDebtLimit) {
      violations.push({
        type: 'TECH_DEBT',
        value: techDebtCount,
        limit: rules.techDebtLimit,
        message: `기술 부채(TODO/FIXME)가 너무 많습니다 (제한: ${rules.techDebtLimit}).`,
      });
    }

    // 7. 테스트 커버리지 분석 (v4.8.0 정교화)
    let currentCoverage = 0;
    let coverageFreshness: 'fresh' | 'stale' | 'missing' = 'missing';
    let coverageLastUpdated = '';
    const fileCoverageMap = new Map<string, { total: number; hit: number }>();

    let coveragePath = '';
    if (options.coveragePath) {
      const manual = isAbsolute(options.coveragePath) ? options.coveragePath : join(this.workspacePath, options.coveragePath);
      if (existsSync(manual)) coveragePath = manual;
    }

    if (!coveragePath) {
      const fastCands = [
        rules.coveragePath,
        join(this.workspacePath, rules.coverageDirectory, 'lcov.info'),
        join(this.workspacePath, 'coverage', 'lcov.info'),
      ].filter(Boolean) as string[];
      for (const cand of fastCands) {
        const full = isAbsolute(cand) ? cand : join(this.workspacePath, cand);
        if (existsSync(full)) { coveragePath = full; break; }
      }
    }

    if (!coveragePath) {
      try {
        const found = await glob(['**/lcov.info', '**/coverage-summary.json'], {
          cwd: this.workspacePath,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**'],
          deep: COVERAGE.RECURSIVE_SEARCH_DEPTH
        });
        if (found.length > 0) coveragePath = found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      } catch (e) {}
    }

    if (coveragePath) {
      try {
        const coverageStat = statSync(coveragePath);
        coverageLastUpdated = coverageStat.mtime.toISOString();
        const content = readFileSync(coveragePath, 'utf-8');

        if (coveragePath.endsWith('.json')) {
          const data = JSON.parse(content);
          currentCoverage = data.total?.lines?.pct ?? 0;
        } else if (coveragePath.endsWith('lcov.info')) {
          const lines = content.split(/\r?\n/);
          let totalLines = 0, hitLines = 0, currentFile = '';
          
          let pathOffset = '';
          const firstSF = lines.find(l => l.trim().startsWith('SF:'))?.split(':').slice(1).join(':').trim();
          if (firstSF) {
            const realMatch = allProjectFiles.find(f => f.endsWith(firstSF));
            if (realMatch) pathOffset = realMatch.replace(new RegExp(`${firstSF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
          }

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('SF:')) {
              const raw = trimmed.split(':').slice(1).join(':').trim();
              const cand = normalize(isAbsolute(raw) ? raw : join(pathOffset || dirname(coveragePath), isAbsolute(raw) ? '' : '..', raw));
              currentFile = (allProjectFiles.length > 0) ? (allProjectFiles.includes(cand) ? cand : (allProjectFiles.find(f => f.endsWith(raw)) || '')) : cand;
            } else if (trimmed.startsWith('LF:')) {
              const val = parseInt(trimmed.split(':')[1].trim());
              if (!isNaN(val)) {
                totalLines += val;
                if (currentFile) {
                  if (!fileCoverageMap.has(currentFile)) fileCoverageMap.set(currentFile, { total: 0, hit: 0 });
                  fileCoverageMap.get(currentFile)!.total = val;
                }
              }
            } else if (trimmed.startsWith('LH:')) {
              const val = parseInt(trimmed.split(':')[1].trim());
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

        const isStale = coverageStat.mtimeMs < lastSrcUpdate - COVERAGE.STALE_BUFFER_MS;
        coverageFreshness = isStale ? 'stale' : 'fresh';

        if (isStale && rules.minCoverage > 0) {
          violations.push({
            type: 'COVERAGE',
            message: `테스트 리포트가 소스 코드보다 오래되었습니다 (만료됨). 최신 커버리지를 반영하려면 'npm test'를 실행하세요.`,
            rationale: `리포트: ${coveragePath.split('/').pop()} (${new Date(coverageStat.mtimeMs).toLocaleTimeString()}), 소스최신: ${new Date(lastSrcUpdate).toLocaleTimeString()} (유예: 15분)`,
          });
        }
      } catch (e) {}
    } else if (rules.minCoverage > 0) {
      // v5.3.1: 리포트가 아예 없는 경우에도 기준치가 있다면 위반으로 간주 (Strict Gate)
      violations.push({
        type: 'COVERAGE',
        message: `테스트 커버리지 리포트를 찾을 수 없습니다 (missing).`,
        rationale: `최소 기준(${rules.minCoverage}%)이 설정되어 있으나 측정 데이터가 없습니다. 'npm test' 등을 통해 리포트를 먼저 생성하십시오.`,
      });
    }

    if (currentCoverage < rules.minCoverage && coveragePath !== '') {
      const lowFiles = Array.from(fileCoverageMap.entries())
        .map(([file, data]) => ({ file: relative(this.workspacePath, file), pct: data.total > 0 ? (data.hit / data.total) * 100 : 0 }))
        .filter(f => !f.file.includes('node_modules') && !f.file.includes('tests/'))
        .sort((a, b) => a.pct - b.pct)
        .slice(0, COVERAGE.TOP_VULNERABLE_FILES_COUNT);
      
      const fileList = lowFiles.map(f => `${f.file.split('/').pop()}(${f.pct.toFixed(1)}%)`).join(', ');
      violations.push({
        type: 'COVERAGE',
        value: `${currentCoverage.toFixed(1)}%`,
        limit: `${rules.minCoverage}%`,
        message: `테스트 커버리지가 기준(${rules.minCoverage}%)에 미달합니다.`,
        rationale: `현재: ${currentCoverage.toFixed(1)}% / 기준: ${rules.minCoverage}% (취약: ${fileList || 'N/A'})`,
      });
    }

    // v5.4.0: 개별 파일 가드레일 (Individual File Guardrail)
    // 전체 평균이 통과하더라도, 개별 파일의 커버리지가 50% 미만(Gap)이거나 0%(누락)인 경우 엄격히 관리
    if (coveragePath !== '') {
      const problematicFiles = Array.from(fileCoverageMap.entries())
        .map(([file, data]) => ({ file: relative(this.workspacePath, file), pct: data.total > 0 ? (data.hit / data.total) * 100 : 0 }))
        .filter(f => !f.file.includes('node_modules') && !f.file.includes('tests/') && !f.file.includes('dist/'))
        .filter(f => f.pct < 50); // 개별 파일 하한선 50%

      problematicFiles.forEach(f => {
        violations.push({
          type: 'COVERAGE',
          file: f.file,
          value: `${f.pct.toFixed(1)}%`,
          limit: '50.0%',
          message: f.pct === 0 
            ? `[치명적] 테스트가 전혀 작성되지 않은 파일(0.0%)이 발견되었습니다.` 
            : `개별 파일의 커버리지가 너무 낮습니다 (하한선: 50%).`,
          rationale: `전체 평균에 가려진 품질 사각지대입니다. 해당 파일의 단위 테스트를 보강하십시오.`,
        });
      });
    }

    // 8. 지능형 자동 딥다이브 (Intelligent Auto-DeepDive v5.1)
    // 에이전트가 추가 호출 없이 즉시 수정 계획을 세울 수 있도록 위반 파일의 심볼 정보를 자동 동봉합니다.
    const deepDive: { [file: string]: any[] } = {};
    const violationFiles = new Set<string>(
      violations.map(v => v.file).filter(Boolean) as string[]
    );

    for (const vFile of Array.from(violationFiles)) {
      try {
        const fullPath = isAbsolute(vFile) ? vFile : join(this.workspacePath, vFile);
        if (existsSync(fullPath)) {
          const metrics = this.semantic.getSymbolMetrics(fullPath);
          // 복잡도가 높거나 라인이 긴 '주의' 심볼만 필터링하여 노이즈 최소화
          const problematicSymbols = metrics.filter(m => m.complexity > 10 || m.lineCount > 50);
          if (problematicSymbols.length > 0) {
            deepDive[vFile] = problematicSymbols;
          }
        }
      } catch (e) { /* 무시 */ }
    }

    // 9. 최종 리포트 및 메타데이터 구성
    const lastCoverage = await this.stateManager.getLastCoverage();
    let pass = violations.length === 0;

    const allFileCoverage = Array.from(fileCoverageMap.entries())
      .map(([file, data]) => ({ file: relative(this.workspacePath, file), pct: data.total > 0 ? (data.hit / data.total) * 100 : 0 }))
      .filter(f => !f.file.includes('node_modules') && !f.file.includes('tests/'))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, COVERAGE.INSIGHT_FILES_COUNT);

    const coverageInsight = allFileCoverage.length > 0
      ? `\n### 💡 Coverage Insights (Top 3 Vulnerable Files)\n${allFileCoverage.map(f => `- \`${f.file}\`: **${f.pct.toFixed(1)}%**`).join('\n')}\n`
      : '';

    if (lastCoverage !== null && currentCoverage < lastCoverage) {
      violations.push({ type: 'COVERAGE', value: `${currentCoverage.toFixed(1)}%`, limit: `${lastCoverage}%`, message: `이전 세션보다 커버리지가 하락했습니다.` });
      pass = false;
    }

    let baseSuggestion = pass ? '모든 품질 기준을 통과했습니다.' : '위반 사항을 조치하세요.';
    if (healingMessages.length > 0) {
      baseSuggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    }

    const report: QualityReport = {
      pass,
      violations,
      deepDive,
      suggestion: baseSuggestion + (coverageInsight ? `\n${coverageInsight}` : ''),
      metadata: {
        version: VERSION,
        timestamp: new Date().toISOString(),
        coverageFreshness,
        coverageLastUpdated,
        coveragePercentage: currentCoverage,
        analysisMode: incrementalMode ? 'incremental' : 'full',
        filesAnalyzed: files.length,
      },
    };

    AstCacheManager.getInstance().clear();
    clearProjectFilesCache();
    clearPathCache();
    await this.stateManager.saveCoverage(currentCoverage);
    return report;
  }
}
