import { readFileSync, existsSync, statSync } from 'fs';
import glob from 'fast-glob';
import { join, normalize, isAbsolute, dirname, relative } from 'path';
import { Violation } from '../types/index.js';
import { COVERAGE } from '../constants.js';
import { parseLcovNative } from '../../native/index.js';

export class CoverageAnalyzer {
  constructor(private workspacePath: string) {}

  async analyze(
    options: any,
    rules: any,
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
        coverageFreshness: 'missing' as any,
        coverageLastUpdated: '',
        coverageInsight: '',
      };
    }
    if (!coveragePath)
      return {
        currentCoverage: 0,
        coverageFreshness: 'missing' as any,
        coverageLastUpdated: '',
        coverageInsight: '',
      };

    const { total, hit, fileCoverageMap, lastUpdated } = this.parseCoverageFile(
      coveragePath,
      allProjectFiles
    );
    const currentCoverage = total > 0 ? (hit / total) * 100 : 0;

    let coverageFreshness: any = 'missing';
    try {
      if (existsSync(coveragePath)) {
        const coverageStat = statSync(coveragePath);
        const isStale = coverageStat.mtimeMs < lastSrcUpdate - COVERAGE.STALE_BUFFER_MS;
        coverageFreshness = isStale ? 'stale' : 'fresh';
        if (isStale && rules.minCoverage > 0) {
          violations.push({
            type: 'COVERAGE',
            message: `테스트 리포트가 만료되었습니다.`,
            rationale: `리포트: ${new Date(coverageStat.mtimeMs).toLocaleTimeString()}, 소스최신: ${new Date(lastSrcUpdate).toLocaleTimeString()}`,
          });
        }
      }
    } catch (e) {}

    this.applyGuardrails(currentCoverage, fileCoverageMap, rules, violations);
    return {
      currentCoverage,
      coverageFreshness,
      coverageLastUpdated: lastUpdated,
      coverageInsight: this.generateInsight(fileCoverageMap),
      coveragePath,
    };
  }

  private async findCoveragePath(options: any, rules: any): Promise<string | undefined> {
    let path = options.coveragePath || rules.coveragePath;
    if (path) {
      const full = isAbsolute(path) ? path : join(this.workspacePath, path);
      if (existsSync(full)) return full;
    }
    const standardPaths = [
      join(this.workspacePath, rules.coverageDirectory, 'lcov.info'),
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
      result.files.forEach((f: any) => {
        fileCoverageMap.set(f.file, { total: f.total, hit: f.hit });
      });
      return { total: result.total, hit: result.hit, fileCoverageMap, lastUpdated };
    }

    return { total: 0, hit: 0, fileCoverageMap: new Map(), lastUpdated };
  }

  private applyGuardrails(
    current: number,
    map: Map<string, any>,
    rules: any,
    violations: Violation[]
  ) {
    if (current < rules.minCoverage) {
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

  private generateInsight(map: Map<string, any>): string {
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
