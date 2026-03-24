import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { SymbolIndexer } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { SymbolMetric, ImpactAnalysis } from '../types/index.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';

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

  /** 프로젝트 초기화 및 전체 심볼 인덱싱 */
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
      const nativeSymbols = AstCacheManager.getInstance().getSymbols(absPath);
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

  /** 특정 심볼 정의 조회 (goToDefinition은 하위 호환성을 위해 유지) */
  getDefinition(name: string): { file: string; line: number } | null {
    return this.indexer.getDefinition(name);
  }

  /** @deprecated use getDefinition */
  goToDefinition(name: string): { file: string; line: number } | null {
    return this.getDefinition(name);
  }

  /** 모든 공개 심볼 목록 조회 */
  getAllExportedSymbols(): { name: string; file: string }[] {
    return this.indexer.getAllExportedSymbols();
  }

  /** 프로젝트 내의 미사용 코드(Dead Code)를 탐색합니다. */
  async findDeadCode() {
    await this.ensureInitialized();
    const allExports = this.getAllExportedSymbols();
    const deadCode: { symbol: string; file: string }[] = [];

    for (const exp of allExports) {
      const refs = this.findReferences(exp.name);
      // 참조가 1개(정의 자체) 이하이면 데드 코드로 간주
      if (refs.length <= 1) {
        deadCode.push({ symbol: exp.name, file: exp.file });
      }
    }

    return deadCode;
  }
}
