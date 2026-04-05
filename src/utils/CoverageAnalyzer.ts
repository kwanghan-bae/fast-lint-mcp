import { readFileSync, existsSync, statSync } from 'fs';
import glob from 'fast-glob';
import { join, normalize, isAbsolute, dirname, relative } from 'path';
import { Violation } from '../types/index.js';
import type { QualityCheckOptions, AnalysisRules } from '../types/index.js';
import { COVERAGE } from '../constants.js';
import { parseLcovNative, FileCoverageResult } from '../../native/index.js';
import { Logger } from './Logger.js';

/** CoverageAnalyzer: LCOV/커버리지 리포트 분석 */
export class CoverageAnalyzer {
  constructor(private workspacePath: string) {}

  async analyze(
    options: QualityCheckOptions,
    rules: AnalysisRules,
    lastSrcUpdate: number,
    allProjectFiles: string[],
    violations: Violation[]
  ) {
    const coveragePath = await this.findCoveragePath(options, rules);
    if (!coveragePath && rules.minCoverage > 0) {
      violations.push({
        type: 'COVERAGE',
        message: `테스트 커버리지 리포트를 찾을 수 없습니다 (missing).`,
        rationale: `최소 기준(${rules.minCoverage}%)이 설정되어 있으나 측정 데이터가 없습니다.`,
      });
      return {
        currentCoverage: 0,
        coverageFreshness: 'missing' as 'fresh' | 'stale' | 'missing',
        coverageLastUpdated: '',
        coverageInsight: '',
      };
    }
    if (!coveragePath)
      return {
        currentCoverage: 0,
        coverageFreshness: 'missing' as 'fresh' | 'stale' | 'missing',
        coverageLastUpdated: '',
        coverageInsight: '',
      };

    const { total, hit, fileCoverageMap, lastUpdated } = this.parseCoverageFile(
      coveragePath,
      allProjectFiles
    );
    const currentCoverage = total > 0 ? (hit / total) * 100 : 0;

    let coverageFreshness: 'fresh' | 'stale' | 'missing' = 'missing';
    try {
      if (existsSync(coveragePath)) {
        const coverageStat = statSync(coveragePath);
        // v3.8.5: forceRefresh 옵션이 있으면 강제로 fresh 취급
        // v3.9.0: 15분(900,000ms) 이내의 차이는 Grace Period로 인정하여 stale 경고 무시
        const timeDiff = lastSrcUpdate - coverageStat.mtimeMs;
        const GRACE_PERIOD_MS = 15 * 60 * 1000; 
        
        const isStale = !options.forceRefresh && timeDiff > GRACE_PERIOD_MS;
        coverageFreshness = isStale ? 'stale' : 'fresh';
        
        if (isStale && rules.minCoverage > 0) {
          violations.push({
            type: 'COVERAGE',
            message: `테스트 리포트가 만료되었습니다.`,
            rationale: `리포트: ${new Date(coverageStat.mtimeMs).toLocaleTimeString()}, 소스최신: ${new Date(lastSrcUpdate).toLocaleTimeString()} (차이: ${Math.round(timeDiff / 60000)}분)`,
          });
        }
      }
    } catch (e) {
      Logger.warn('CoverageAnalyzer', '커버리지 파일 stat 실패', (e as Error).message);
    }

    this.applyGuardrails(currentCoverage, fileCoverageMap, rules, violations);
    return {
      currentCoverage,
      coverageFreshness,
      coverageLastUpdated: lastUpdated,
      coverageInsight: this.generateInsight(fileCoverageMap),
      coveragePath,
    };
  }

  /**
   * 프로젝트 내에서 가장 적절한 커버리지 리포트 파일(lcov.info 등)의 경로를 탐색합니다.
   * 지정된 경로가 없으면 기본 위치들을 재귀적으로 검색합니다.
   */
  private async findCoveragePath(options: QualityCheckOptions, rules: AnalysisRules & { coveragePath?: string; coverageDirectory?: string }): Promise<string | undefined> {
    let path = options.coveragePath || rules.coveragePath;
    if (path) {
      const full = isAbsolute(path) ? path : join(this.workspacePath, path);
      if (existsSync(full)) return full;
    }
    const standardPaths = [
      ...(rules.coverageDirectory ? [join(this.workspacePath, rules.coverageDirectory, 'lcov.info')] : []),
      join(this.workspacePath, 'coverage', 'lcov.info'),
      join(this.workspacePath, 'coverage', 'coverage-summary.json'),
    ];
    for (const p of standardPaths) {
      if (existsSync(p)) return p;
    }
    try {
      const found = await glob(['**/lcov.info', '**/coverage-summary.json'], {
        cwd: this.workspacePath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**'],
        deep: 5,
      });
      return found.sort((a, b) => {
        try {
          return (
            (existsSync(b) ? statSync(b).mtimeMs : 0) - (existsSync(a) ? statSync(a).mtimeMs : 0)
          );
        } catch (e) {
          return 0;
        }
      })[0];
    } catch (e) {
      return undefined;
    }
  }

  /**
   * 커버리지 파일을 읽어 파일별 total/hit 라인 수를 파싱합니다.
   * JSON 및 LCOV 형식을 지원하며 Native 엔진을 통해 고속 파싱을 수행합니다.
   */
  private parseCoverageFile(path: string, allFiles: string[]) {
    if (!existsSync(path)) return { total: 0, hit: 0, fileCoverageMap: new Map(), lastUpdated: '' };

    let lastUpdated = '';
    try {
      lastUpdated = statSync(path).mtime.toISOString();
    } catch (e) {
      lastUpdated = new Date().toISOString();
    }

    if (path.endsWith('.json')) {
      try {
        const content = readFileSync(path, 'utf-8');
        const data = JSON.parse(content);
        return {
          total: 100,
          hit: data.total?.lines?.pct ?? 0,
          fileCoverageMap: new Map(),
          lastUpdated,
        };
      } catch (e) {
        return { total: 0, hit: 0, fileCoverageMap: new Map(), lastUpdated };
      }
    }

    // v0.0.1: Native Rust LCOV Parser 호출
    const result = parseLcovNative(path, allFiles);
    const fileCoverageMap = new Map<string, { total: number; hit: number }>();

    if (result) {
      result.files.forEach((f: FileCoverageResult) => {
        fileCoverageMap.set(f.file, { total: f.total, hit: f.hit });
      });
      return { total: result.total, hit: result.hit, fileCoverageMap, lastUpdated };
    }

    return { total: 0, hit: 0, fileCoverageMap: new Map(), lastUpdated };
  }

  /**
   * 커버리지 결과에 대해 프로젝트의 품질 정책(가드레일)을 적용합니다.
   * 전체 커버리지 및 개별 파일의 커버리지 하한선을 검증합니다.
   */
  private applyGuardrails(
    current: number,
    map: Map<string, { total: number; hit: number }>,
    rules: AnalysisRules,
    violations: Violation[]
  ) {
    // 1. 전체 프로젝트 커버리지 기준 검증
    this.checkTotalCoverage(current, map, rules, violations);

    // 2. 개별 파일별 커버리지 하한선 검증
    this.checkIndividualFileCoverage(map, violations);
  }

  /** 프로젝트 전체 커버리지가 기준치에 미달하는지 확인합니다. */
  private checkTotalCoverage(
    current: number,
    map: Map<string, { total: number; hit: number }>,
    rules: AnalysisRules,
    violations: Violation[]
  ) {
    if (current >= rules.minCoverage) return;

    const lowFiles = Array.from(map.entries())
      .map(([file, data]) => ({
        file: relative(this.workspacePath, file),
        pct: data.total > 0 ? (data.hit / data.total) * 100 : 0,
      }))
      .filter(
        (f) =>
          f.file &&
          f.file !== '.' &&
          !f.file.includes('node_modules') &&
          !f.file.includes('tests/')
      )
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);

    const fileList = lowFiles
      .map((f) => `${f.file.split('/').pop()}(${f.pct.toFixed(1)}%)`)
      .join(', ');

    violations.push({
      type: 'COVERAGE',
      value: `${current.toFixed(1)}%`,
      limit: `${rules.minCoverage}%`,
      message: `전체 커버리지가 기준(${rules.minCoverage}%)에 미달합니다. (현재: ${current.toFixed(1)}%)`,
      rationale: `현재: ${current.toFixed(1)}% / 기준: ${rules.minCoverage}% (취약: ${fileList || 'N/A'})`,
    });
  }

  /** 개별 파일의 커버리지가 최소 유지 기준(50%)에 미달하는지 확인합니다. */
  private checkIndividualFileCoverage(map: Map<string, { total: number; hit: number }>, violations: Violation[]) {
    for (const [file, data] of map.entries()) {
      const pct = data.total > 0 ? (data.hit / data.total) * 100 : 0;
      const relFile = relative(this.workspacePath, file);

      if (
        relFile &&
        relFile !== '.' &&
        relFile !== 'unknown' &&
        pct < 50 &&
        !relFile.includes('tests/') &&
        !relFile.includes('node_modules')
      ) {
        violations.push({
          type: 'COVERAGE',
          file: relFile,
          message: pct === 0 ? `[치명적] 테스트 누락 (0%)` : `개별 커버리지 하한선(50%) 미달`,
          rationale: `현재: ${pct.toFixed(1)}%. 해당 파일의 단위 테스트를 보강하십시오.`,
        });
      }
    }
  }

  /**
   * 커버리지 분석 결과를 바탕으로 사용자에게 제공할 인사이트 메시지를 생성합니다.
   * 주요 취약 파일(Top 3) 목록을 포함합니다.
   */
  private generateInsight(map: Map<string, { total: number; hit: number }>): string {
    const lowFiles = Array.from(map.entries())
      .map(([file, data]) => ({
        file: relative(this.workspacePath, file),
        pct: data.total > 0 ? (data.hit / data.total) * 100 : 0,
      }))
      .filter(
        (f) =>
          f.file && f.file !== '.' && !f.file.includes('node_modules') && !f.file.includes('tests/')
      )
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
    if (lowFiles.length === 0) return '';
    return `\n### 💡 Coverage Insights (Top 3 Vulnerable Files)\n${lowFiles.map((f) => `- \`${f.file}\`: **${f.pct.toFixed(1)}%**`).join('\n')}\n`;
  }
}
