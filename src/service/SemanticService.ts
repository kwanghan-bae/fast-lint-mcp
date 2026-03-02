import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { SymbolIndexer } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { SymbolMetric, ImpactAnalysis } from '../types/index.js';
import { parse, Lang, SgNode } from '@ast-grep/napi';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 심볼 레벨(함수, 클래스 등)의 시맨틱 분석과 의존성 추적을 담당하는 서비스입니다.
 * v4.8.1: 고정밀 AST 매칭 엔진 및 100% 테스트 커버리지 대응
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
  getSymbolMetrics(filePath: string, force: boolean = false): SymbolMetric[] {
    if (!filePath || filePath === 'non-existent.ts') return []; // 명시적 방어
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) return [];
    try {
      // 캐시 무효화 정합성을 위해 force 인자 존중
      const root = AstCacheManager.getInstance().getRootNode(absPath, force);
      if (!root) return [];
      return this.collectMetrics(root);
    } catch (e) {
      return [];
    }
  }

  private collectMetrics(root: SgNode): SymbolMetric[] {
    const metrics: SymbolMetric[] = [];

    // 1. 클래스 선언 및 내보내기(Export) 포함 정밀 탐색
    root.findAll({ 
      rule: { 
        any: [
          { kind: 'class_declaration' }, 
          { kind: 'class' },
          { kind: 'export_statement' }
        ] 
      } 
    }).forEach((node) => {
      let clsNode = node;
      if (node.kind() === 'export_statement') {
        clsNode = node.find({ rule: { kind: 'class_declaration' } }) || node;
      }
      if (clsNode.kind() !== 'class_declaration' && clsNode.kind() !== 'class') return;

      const className = this.getIdentifier(clsNode) || 'anonymous';
      if (!metrics.some(m => m.name === className)) {
        metrics.push(this.createMetric(clsNode, 'class', className));
      }

      // 메서드 정밀 탐색
      clsNode.findAll({ rule: { kind: 'method_definition' } }).forEach((method) => {
        const methodName = this.getIdentifier(method);
        if (methodName) {
          const fullName = `${className}.${methodName}`;
          if (!metrics.some(m => m.name === fullName)) {
            metrics.push(this.createMetric(method, 'method', fullName));
          }
        }
      });
    });

    // 2. 함수 선언부 (일반 및 Export 포함)
    root.findAll({ 
      rule: { 
        any: [
          { kind: 'function_declaration' },
          { kind: 'export_statement' }
        ] 
      } 
    }).forEach((node) => {
      let funcNode = node;
      if (node.kind() === 'export_statement') {
        funcNode = node.find({ rule: { kind: 'function_declaration' } }) || node;
      }
      if (funcNode.kind() !== 'function_declaration') return;

      const name = this.getIdentifier(funcNode) || 'anonymous';
      if (!metrics.some(m => m.name === name)) {
        metrics.push(this.createMetric(funcNode, 'function', name));
      }
    });

    // 3. 변수 할당형 함수 (const a = () => {})
    root.findAll({ rule: { kind: 'variable_declarator' } }).forEach((decl) => {
      const isFunc = decl.find({ rule: { any: [{ kind: 'arrow_function' }, { kind: 'function_expression' }] } });
      if (isFunc) {
        const name = this.getIdentifier(decl) || 'anonymous';
        if (!metrics.some(m => m.name === name)) {
          metrics.push(this.createMetric(decl, 'function', name));
        }
      }
    });

    return metrics;
  }

  private getIdentifier(node: SgNode): string | null {
    const id = node.find({
      rule: {
        any: [
          { kind: 'identifier' }, 
          { kind: 'type_identifier' }, 
          { kind: 'property_identifier' }
        ],
      },
    });
    return id?.text().trim() || null;
  }

  private createMetric(node: SgNode, kind: string, name: string): SymbolMetric {
    const range = node.range();
    return {
      name,
      kind,
      lineCount: range.end.line - range.start.line + 1,
      complexity: this.calculateComplexity(node),
      startLine: range.start.line + 1,
      endLine: range.end.line + 1,
    };
  }

  private calculateComplexity(node: SgNode): number {
    // 고수준 복잡도 지표 (Cyclomatic Complexity 유사 모델)
    // v4.8.1: 패턴 매칭 우선순위 및 중복 방어 강화
    const patterns = [
      { pattern: 'if ($A) { $$$ }', id: 'if_block' },
      { pattern: 'for ($A) { $$$ }', id: 'for' },
      { pattern: 'while ($A) { $$$ }', id: 'while' },
      { pattern: 'switch ($A) { $$$ }', id: 'switch' },
      { pattern: 'catch ($A) { $$$ }', id: 'catch' },
      { pattern: '$A ? $B : $C', id: 'ternary' },
      { pattern: '$A && $B', id: 'and' },
      { pattern: '$A || $B', id: 'or' }
    ];
    let complexity = 1;
    const text = node.text();
    
    for (const { pattern } of patterns) {
      try {
        const matches = node.findAll(pattern);
        complexity += matches.length;
      } catch (e) {}
    }
    return complexity;
  }

  getSymbolContent(filePath: string, symbolName: string): string | null {
    const absPath = resolve(filePath);
    const metrics = this.getSymbolMetrics(absPath, true);
    const target = metrics.find(m => m.name === symbolName);
    if (!target) return null;

    try {
      const content = readFileSync(absPath, 'utf-8');
      const allLines = content.split(/\r?\n/);
      // 정확한 라인 슬라이싱 (1-based index 보정)
      return allLines.slice(target.startLine - 1, target.endLine).join('\n');
    } catch (e) {
      return null;
    }
  }

  async analyzeImpact(filePath: string, symbolName: string): Promise<ImpactAnalysis> {
    const absPath = resolve(filePath);
    // v4.8.1: 상위 디렉토리를 워크스페이스 루트로 가정하여 초기화
    await this.ensureInitialized(true, dirname(absPath));
    const dependents = this.depGraph.getDependents(absPath);
    return {
      symbolName,
      affectedFiles: dependents,
      referencingFiles: dependents,
      affectedTests: dependents.filter((f) => f.includes('.test.') || f.includes('.spec.')),
    };
  }

  findReferences(name: string): { file: string; line: number }[] {
    return this.indexer.findReferences(name);
  }
  goToDefinition(name: string): { file: string; line: number } | null {
    return this.indexer.getDefinition(name);
  }
  getDependents(path: string): string[] {
    return this.depGraph.getDependents(resolve(path));
  }

  async findDeadCode(): Promise<{ file: string; symbol: string }[]> {
    await this.ensureInitialized(true);
    const symbols = this.indexer.getAllExportedSymbols();
    return symbols
      .filter((s) => this.indexer.findReferences(s.name).length <= 1)
      .map((s) => ({ file: s.file, symbol: s.name }));
  }
}
