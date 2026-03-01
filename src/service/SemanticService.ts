import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { SymbolIndexer } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { SymbolMetric, ImpactAnalysis } from '../types/index.js';
import { parse, Lang, SgNode } from '@ast-grep/napi';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 심볼 레벨(함수, 클래스 등)의 시맨틱 분석과 의존성 추적을 담당하는 서비스입니다.
 * v3.7.5: 절대 경로 기반의 정밀 분석 및 테스트 호환성 확보
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
      await this.depGraph.build();
      await this.indexer.indexAll(absWorkspace);
      this.initialized = true;
    }
  }

  /** 특정 파일의 심볼 메트릭 추출 */
  getSymbolMetrics(filePath: string, force: boolean = false): SymbolMetric[] {
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) return [];
    try {
      const root = AstCacheManager.getInstance().getRootNode(absPath, force);
      if (!root) return [];
      return this.collectMetrics(root);
    } catch (e) {
      return [];
    }
  }

  private collectMetrics(root: SgNode): SymbolMetric[] {
    const metrics: SymbolMetric[] = [];

    // 1. 클래스 및 메서드 탐색
    root
      .findAll({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }] } })
      .forEach((cls) => {
        const className = this.getIdentifier(cls) || 'anonymous';
        metrics.push(this.createMetric(cls, 'class', className));

        cls
          .findAll({ rule: { any: [{ kind: 'method_definition' }, { kind: 'function' }] } })
          .forEach((method) => {
            const methodName = this.getIdentifier(method);
            if (methodName) {
              metrics.push(this.createMetric(method, 'method', `${className}.${methodName}`));
            }
          });
      });

    // 2. 함수 및 화살표 함수 탐색
    root.findAll({ rule: { kind: 'function_declaration' } }).forEach((node) => {
      const name = this.getIdentifier(node) || 'anonymous';
      metrics.push(this.createMetric(node, 'function', name));
    });

    root.findAll({ rule: { kind: 'variable_declarator' } }).forEach((decl) => {
      const value = decl.find({
        rule: { any: [{ kind: 'arrow_function' }, { kind: 'function_expression' }] },
      });
      if (value) {
        const name = this.getIdentifier(decl) || 'anonymous';
        if (!metrics.some((m) => m.name === name)) {
          metrics.push(this.createMetric(decl, 'function', name));
        }
      }
    });

    return metrics;
  }

  private getIdentifier(node: SgNode): string | null {
    const id = node.find({
      rule: {
        any: [{ kind: 'identifier' }, { kind: 'type_identifier' }, { kind: 'property_identifier' }],
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
    const patterns = [
      'if ($A) { $$$ }',
      'if ($A) $$$',
      'for ($A) { $$$ }',
      'for ($A) $$$',
      'while ($A) { $$$ }',
      'while ($A) $$$',
      'switch ($A) { $$$ }',
      'try { $$$ }',
      'catch ($A) { $$$ }',
      '$A ? $B : $C',
      '$A && $B',
      '$A || $B',
    ];
    let complexity = 1;
    for (const p of patterns) {
      complexity += node.findAll(p).length;
    }
    return complexity;
  }

  getSymbolContent(filePath: string, symbolName: string): string | null {
    const absPath = resolve(filePath);
    const root = AstCacheManager.getInstance().getRootNode(absPath, true);
    if (!root) return null;

    if (symbolName.includes('.')) {
      const [cls, mth] = symbolName.split('.');
      const classNode = root.find({
        rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }], pattern: cls },
      });
      return (
        classNode
          ?.find({
            rule: { any: [{ kind: 'method_definition' }, { kind: 'function' }], pattern: mth },
          })
          ?.text() || null
      );
    }

    return (
      root
        .find({
          rule: {
            any: [
              { pattern: `function ${symbolName}` },
              { pattern: `class ${symbolName}` },
              { pattern: `const ${symbolName} = $$$` },
            ],
          },
        })
        ?.text() || null
    );
  }

  async analyzeImpact(filePath: string, symbolName: string): Promise<ImpactAnalysis> {
    const absPath = resolve(filePath);
    await this.ensureInitialized();
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
