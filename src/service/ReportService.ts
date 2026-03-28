import { existsSync } from 'fs';
import { join, isAbsolute } from 'path';
import { 
  QualityReport, 
  Violation, 
  SymbolMetric 
} from '../types/index.js';
import { SemanticService } from './SemanticService.js';
import { VERSION } from '../constants.js';
import { StateManager } from '../state.js';

/**
 * 품질 분석 결과를 가공하여 최종 리포트를 생성하는 전담 서비스입니다.
 * v3.0: AnalysisService로부터 리포트 조립 및 딥다이브 로직을 분리하여 유지보수성을 높였습니다.
 */
export class ReportService {
  constructor(
    private semantic: SemanticService,
    private stateManager: StateManager,
    private workspacePath: string
  ) {}

  /**
   * 분석 결과와 메타데이터를 결합하여 최종 QualityReport 객체를 구성합니다.
   */
  async assemble(
    violations: Violation[],
    cov: any,
    healingMessages: string[],
    files: string[],
    isIncremental: boolean
  ): Promise<QualityReport> {
    const uniqueViolations = this.deduplicateViolations(violations);
    const deepDive = this.performDeepDive(uniqueViolations);

    const lastCoverage = await this.stateManager.getLastCoverage();
    
    if (lastCoverage !== null && cov.currentCoverage < lastCoverage) {
      uniqueViolations.push({
        type: 'COVERAGE',
        message: `커버리지가 하락했습니다 (${lastCoverage.toFixed(1)}% -> ${cov.currentCoverage.toFixed(1)}%)`,
      });
    }

    const pass = uniqueViolations.length === 0;
    let suggestion = pass ? '모든 품질 기준을 통과했습니다.' : '위반 사항을 조치하세요.';
    if (healingMessages.length > 0) suggestion += `\n\n[Self-Healing Result]\n${healingMessages.join('\n')}`;
    if (cov.coverageInsight) suggestion += `\n${cov.coverageInsight}`;

    await this.stateManager.saveCoverage(cov.currentCoverage);

    return {
      pass,
      violations: uniqueViolations,
      deepDive,
      suggestion,
      metadata: {
        version: VERSION,
        timestamp: new Date().toISOString(),
        coverageFreshness: cov.coverageFreshness,
        coverageLastUpdated: cov.coverageLastUpdated,
        coveragePercentage: cov.currentCoverage,
        analysisMode: isIncremental ? 'incremental' : 'full',
        filesAnalyzed: files.length,
      },
    };
  }

  /** 위반 사항 중복 제거 */
  private deduplicateViolations(violations: Violation[]): Violation[] {
    return Array.from(
      new Map(violations.map((v) => [`${v.type}:${v.file}:${v.line}:${v.message}`, v])).values()
    );
  }

  /** 위반 파일들에 대한 심층 분석 수행 */
  private performDeepDive(violations: Violation[]): { [filePath: string]: SymbolMetric[] } {
    const problematicFiles = [...new Set(violations.map((v) => v.file).filter(Boolean))];
    const deepDive: { [filePath: string]: SymbolMetric[] } = {};

    for (const file of problematicFiles) {
      if (Object.keys(deepDive).length >= 5) break;
      const fullPath = isAbsolute(file!) ? file! : join(this.workspacePath, file!);
      if (!existsSync(fullPath)) continue;

      const metrics = this.semantic.getSymbolMetrics(fullPath);
      const complexSymbols = metrics
        .filter((m) => m.complexity > 5)
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 3);

      if (complexSymbols.length > 0) {
        deepDive[file!] = complexSymbols;
      }
    }
    return deepDive;
  }
}
