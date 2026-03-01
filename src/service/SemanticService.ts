import { readFileSync, existsSync } from 'fs';
import { SymbolIndexer } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { SymbolMetric, ImpactAnalysis } from '../types/index.js';
import { parse, Lang, SgNode } from '@ast-grep/napi';

/**
 * 심볼 레벨(함수, 클래스 등)의 시맨틱 분석과 의존성 추적을 담당하는 서비스입니다.
 * v3.7.2: 모든 테스트 케이스(TS/JS/TSX)를 통과하는 최종 엔진
 */
export class SemanticService {
  /** 심볼 인덱싱 도구 */
  private indexer: SymbolIndexer;
  /** 프로젝트 의존성 그래프 */
  private depGraph: DependencyGraph;
  /** 초기화 여부 플래그 */
  private initialized: boolean = false;

  constructor() {
    this.indexer = new SymbolIndexer();
    this.depGraph = new DependencyGraph();
  }

  /**
   * 인덱서와 의존성 그래프를 초기화합니다.
   */
  public async ensureInitialized() {
    if (!this.initialized) {
      await this.depGraph.build();
      await this.indexer.indexAll(process.cwd());
      this.initialized = true;
    }
  }

  /**
   * 특정 파일 내의 모든 심볼 메트릭을 추출합니다.
   */
  getSymbolMetrics(filePath: string): SymbolMetric[] {
    if (!existsSync(filePath)) return [];
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang = filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
      const root = parse(lang, content).root();
      return this.collectMetrics(root);
    } catch (e) { return []; }
  }

  /**
   * AST 노드를 순회하며 모든 품질 메트릭을 수집합니다.
   */
  private collectMetrics(root: SgNode): SymbolMetric[] {
    const metrics: SymbolMetric[] = [];
    
    // 1. 클래스 및 메서드 탐색
    root.findAll({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }] } }).forEach(cls => {
      const className = this.getIdentifier(cls) || 'anonymous';
      metrics.push(this.createMetric(cls, 'class_declaration', className));
      
      cls.findAll({ rule: { kind: 'method_definition' } }).forEach(method => {
        const methodName = this.getIdentifier(method) || 'anonymous';
        metrics.push(this.createMetric(method, 'method_definition', `${className}.${methodName}`));
      });
    });

    // 2. 함수 및 화살표 함수 탐색
    const funcKinds = ['function_declaration', 'function_expression', 'arrow_function'];
    root.findAll({ rule: { any: funcKinds.map(k => ({ kind: k })) } }).forEach(node => {
      const name = this.getIdentifier(node) || 'anonymous';
      // 이미 클래스 메서드로 처리된 것은 제외 (단순화)
      if (!metrics.some(m => m.name.endsWith(`.${name}`))) {
        metrics.push(this.createMetric(node, 'function', name));
      }
    });

    // 3. 변수 할당을 통한 화살표 함수 탐색
    root.findAll({ rule: { kind: 'lexical_declaration' } }).forEach(decl => {
      if (decl.text().includes('=>')) {
        const idNode = decl.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } });
        if (idNode && !metrics.some(m => m.name === idNode.text())) {
          metrics.push(this.createMetric(decl, 'arrow_function', idNode.text()));
        }
      }
    });

    return metrics;
  }

  /** 노드에서 식별자명을 추출합니다. */
  private getIdentifier(node: SgNode): string | null {
    const idNode = node.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }, { kind: 'property_identifier' }] } });
    return idNode?.text() || null;
  }

  /** 메트릭 객체를 생성합니다. */
  private createMetric(node: SgNode, kind: string, name: string): SymbolMetric {
    const range = node.range();
    return {
      name,
      kind: kind.replace('_declaration', '').replace('_definition', ''),
      lineCount: range.end.line - range.start.line + 1,
      complexity: this.calculateComplexity(node),
      startLine: range.start.line + 1,
      endLine: range.end.line + 1
    };
  }

  /** 순환 복잡도를 계산합니다. */
  private calculateComplexity(node: SgNode): number {
    const patterns = ['if ($A)', 'for ($A)', 'while ($A)', 'switch ($A)', 'try', 'catch ($A)', '? :'];
    return patterns.reduce((sum, p) => sum + node.findAll(p).length, 1);
  }

  /** 심볼 소스 코드를 가져옵니다. */
  getSymbolContent(filePath: string, symbolName: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang = filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
      const root = parse(lang, content).root();
      
      if (symbolName.includes('.')) {
        const [cls, method] = symbolName.split('.');
        const classNode = root.find({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }], has: { rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }], pattern: cls } } } });
        return classNode?.find({ rule: { any: [{ kind: 'method_definition' }, { kind: 'function' }], has: { rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }], pattern: method } } } })?.text() || null;
      }

      return root.find({ rule: { any: [
        { pattern: `function ${symbolName}` },
        { pattern: `class ${symbolName}` },
        { rule: { has: { rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }], pattern: symbolName } } } }
      ] } })?.text() || null;
    } catch (e) { return null; }
  }

  /** 영향 범위 분석 */
  async analyzeImpact(filePath: string, symbolName: string): Promise<ImpactAnalysis> {
    await this.ensureInitialized();
    const dependents = this.depGraph.getDependents(filePath);
    return {
      symbolName,
      affectedFiles: dependents,
      referencingFiles: dependents,
      affectedTests: dependents.filter(f => f.includes('.test.') || f.includes('.spec.'))
    };
  }

  /** 참조 위치 탐색 */
  findReferences(filePath: string, symbolName: string): { file: string; line: number }[] {
    return this.indexer.findReferences(symbolName);
  }

  /** 정의 위치 탐색 */
  goToDefinition(filePath: string, symbolName: string): { file: string; line: number } | null {
    return this.indexer.getDefinition(symbolName);
  }

  /** 의존성 조회 */
  getDependents(filePath: string): string[] {
    return this.depGraph.getDependents(filePath);
  }

  /** 미사용 심볼 탐지 */
  async findDeadCode(): Promise<{ file: string; symbol: string }[]> {
    await this.ensureInitialized();
    const symbols = this.indexer.getAllExportedSymbols();
    const dead: { file: string; symbol: string }[] = [];
    for (const s of symbols) {
      const refs = this.indexer.findReferences(s.name);
      if (refs.length <= 1) dead.push({ file: s.file, symbol: s.name });
    }
    return dead;
  }
}
