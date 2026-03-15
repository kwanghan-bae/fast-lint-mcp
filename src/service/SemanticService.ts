import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { SymbolIndexer } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { SymbolMetric, ImpactAnalysis } from '../types/index.js';
import { extractSymbolsNative } from '../../native/index.js';

/**
 * 심볼 레벨(함수, 클래스 등)의 시맨틱 분석과 의존성 추적을 담당하는 서비스입니다.
 * v0.0.1: Rust Native 엔진을 사용하여 단일 패스로 모든 메트릭을 추출합니다.
 */
export class SemanticService {
  private indexer: SymbolIndexer;
  private depGraph: DependencyGraph;
  private initialized: boolean = false;

  constructor() {
    this.indexer = new SymbolIndexer();
    this.depGraph = new DependencyGraph();
  }

  /** 인덱서와 의존성 그래프 초기화 */
  public async ensureInitialized(force: boolean = false, workspacePath: string = process.cwd()) {
    const absWorkspace = resolve(workspacePath);
    if (!this.initialized || force) {
      await this.depGraph.build(undefined);
      await this.indexer.indexAll(absWorkspace);
      this.initialized = true;
    }
  }

  /** 특정 파일의 심볼 메트릭 추출 */
  getSymbolMetrics(filePath: string, _force: boolean = false): SymbolMetric[] {
    if (!filePath || filePath === 'non-existent.ts') return [];
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) return [];

    try {
      // v0.0.1: Native 단일 패스 메트릭 추출 (정밀 AST 분석 기반)
      const nativeSymbols = extractSymbolsNative(absPath);
      return nativeSymbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        lineCount: s.lines,
        complexity: s.complexity,
        startLine: s.line,
        endLine: s.endLine,
      }));
    } catch (e) {
      return [];
    }
  }

  /** 특정 심볼의 본문 내용을 가져옵니다. */
  getSymbolContent(filePath: string, symbolName: string): string | null {
    const absPath = resolve(filePath);
    const metrics = this.getSymbolMetrics(absPath, true);
    const target = metrics.find((m) => m.name === symbolName);
    if (!target) return null;

    try {
      const content = readFileSync(absPath, 'utf-8');
      const allLines = content.split(/\r?\n/);
      // v0.0.1: 네이티브에서 추출한 정확한 라인 범위로 본문 슬라이싱
      return allLines.slice(target.startLine - 1, target.endLine).join('\n');
    } catch (e) {
      return null;
    }
  }

  /** 특정 심볼의 수정이 프로젝트 전체에 미치는 영향 분석 */
  async analyzeImpact(filePath: string, symbolName: string): Promise<ImpactAnalysis> {
    const absPath = resolve(filePath);
    await this.ensureInitialized(true, dirname(absPath));
    const dependents = this.depGraph.getDependents(absPath);
    return {
      symbolName,
      affectedFiles: dependents,
      referencingFiles: dependents,
      affectedTests: dependents.filter((f) => f.includes('.test.') || f.includes('.spec.')),
    };
  }

  /** 심볼 참조 탐색 */
  findReferences(name: string): { file: string; line: number }[] {
    return this.indexer.findReferences(name);
  }

  /** 심볼 정의로 이동 */
  goToDefinition(name: string): { file: string; line: number } | null {
    return this.indexer.getDefinition(name);
  }

  /** 역의존성 조회 */
  getDependents(path: string): string[] {
    return this.depGraph.getDependents(resolve(path));
  }

  /** 프로젝트 내의 모든 공개(export) 심볼 목록을 가져옵니다. */
  getAllExportedSymbols(): { name: string; file: string }[] {
    return this.indexer.getAllExportedSymbols();
  }

  /** 미사용 코드(Dead Code)를 탐지합니다. */
  async findDeadCode(): Promise<{ file: string; symbol: string }[]> {
    await this.ensureInitialized(true);
    const symbols = this.indexer.getAllExportedSymbols();
    return symbols
      .filter((s) => this.indexer.findReferences(s.name).length <= 1)
      .map((s) => ({ file: s.file, symbol: s.name }));
  }
}
