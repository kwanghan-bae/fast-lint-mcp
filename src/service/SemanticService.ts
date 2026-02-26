import { readFileSync, existsSync } from 'fs';
import { SymbolIndexer, SymbolInfo } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { Lang, parse, SgNode } from '@ast-grep/napi';

export interface SymbolMetric {
  name: string;
  kind: string;
  lineCount: number;
  complexity: number;
}

/**
 * 프로젝트 전체의 시맨틱 분석을 담당합니다. (Rust 엔진 기반)
 */
export class SemanticService {
  private indexer: SymbolIndexer;
  private depGraph: DependencyGraph;
  private initialized = false;

  constructor(private workspacePath: string = process.cwd()) {
    this.indexer = new SymbolIndexer(this.workspacePath);
    this.depGraph = new DependencyGraph(this.workspacePath);
  }

  async ensureInitialized() {
    if (this.initialized) return;
    await this.indexer.index();
    await this.depGraph.build();
    this.initialized = true;
  }

  getSymbolMetrics(filePath: string): SymbolMetric[] {
    if (!existsSync(filePath)) return [];
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang =
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? Lang.TypeScript
          : filePath.endsWith('.ts')
            ? Lang.TypeScript
            : Lang.JavaScript;
      const root = parse(lang, content).root();
      const metrics: SymbolMetric[] = [];

      this.collectMetrics(root, metrics);
      return metrics;
    } catch (e) {
      return [];
    }
  }

  private collectMetrics(node: SgNode, metrics: SymbolMetric[]) {
    const kind = node.kind();
    let name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      if (!name || name === 'default')
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      if (name)
        metrics.push({
          name,
          kind: 'class',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
    } else if (kind === 'function_declaration' || kind === 'function') {
      if (!name || name === 'default')
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      if (name)
        metrics.push({
          name,
          kind: 'function',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
    } else if (kind === 'method_definition') {
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        const cls = node.parent()?.parent();
        const clsName =
          cls?.field('name')?.text().trim() ||
          cls
            ?.find({ rule: { kind: 'identifier' } })
            ?.text()
            .trim();
        const fullName = clsName ? `${clsName}.${name}` : name;
        metrics.push({
          name: fullName,
          kind: 'method',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
      }
    } else if (kind === 'variable_declarator') {
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        metrics.push({
          name,
          kind: 'function',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
      }
    }

    node.children().forEach((child) => this.collectMetrics(child, metrics));
  }

  private calculateComplexity(node: SgNode): number {
    let complexity = 1;
    const kinds = [
      'if_statement',
      'for_statement',
      'while_statement',
      'switch_statement',
      'catch_clause',
      'ternary_expression',
    ];
    for (const k of kinds) {
      complexity += node.findAll({ rule: { kind: k } }).length;
    }
    complexity += node.findAll('&&').length;
    complexity += node.findAll('||').length;
    return complexity;
  }

  getSymbolContent(filePath: string, symbolName: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang =
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? Lang.TypeScript
          : filePath.endsWith('.ts')
            ? Lang.TypeScript
            : Lang.JavaScript;
      const root = parse(lang, content).root();
      return this.findContentInNode(root, symbolName);
    } catch (e) {
      return null;
    }
  }

  private findContentInNode(node: SgNode, symbolName: string): string | null {
    const name =
      node.field('name')?.text().trim() ||
      node
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim();

    if (symbolName.includes('.')) {
      const [cls, method] = symbolName.split('.');
      if (name === cls && (node.kind() === 'class_declaration' || node.kind() === 'class')) {
        const mNode = node.find({
          rule: { kind: 'method_definition', has: { field: 'name', regex: `^${method}$` } },
        });
        if (mNode) return mNode.text();
      }
    }

    if (name === symbolName) return node.text();

    for (const child of node.children()) {
      const found = this.findContentInNode(child, symbolName);
      if (found) return found;
    }
    return null;
  }

  /**
   * [REAL IMPLEMENTATION]
   * 프로젝트 전체의 의존성 그래프와 심볼 지도를 대조하여 미사용 코드를 정밀 탐지합니다.
   */
  findDeadCode(): { file: string; symbol: string }[] {
    const deadCodes: { file: string; symbol: string }[] = [];
    const allSymbolsMap = (this.indexer as any).symbolMap as Map<string, SymbolInfo[]>;

    for (const [name, infos] of allSymbolsMap.entries()) {
      for (const info of infos) {
        // 1. 해당 파일이 어디서 임포트되는지 확인
        const dependents = this.depGraph.getDependents(info.filePath);

        // 2. 만약 임포트하는 곳이 없다면 dead code 후보 (진입점 제외)
        if (dependents.length === 0) {
          if (!info.filePath.includes('index.') && !info.filePath.includes('main.')) {
            deadCodes.push({ file: info.filePath, symbol: name });
          }
          continue;
        }

        // 3. 임포트하는 파일들 중 실제로 이 심볼명을 사용하는 곳이 있는지 전수 조사
        let isUsed = false;
        for (const depFile of dependents) {
          try {
            const content = readFileSync(depFile, 'utf-8');
            // 1차 고속 필터링 (텍스트가 아예 없으면 스킵)
            if (!content.includes(name)) continue;

            // 2차 정밀 필터링 (AST 기반 Identifier 존재 확인)
            const lang =
              depFile.endsWith('.tsx') || depFile.endsWith('.jsx')
                ? Lang.TypeScript
                : depFile.endsWith('.ts')
                  ? Lang.TypeScript
                  : Lang.JavaScript;
            const depRoot = parse(lang, content).root();

            // 해당 이름의 식별자(Identifier)가 존재하는지 확인
            const identifierMatch = depRoot.find({
              rule: { kind: 'identifier', regex: `^${name}$` },
            });
            if (identifierMatch) {
              isUsed = true;
              break;
            }
          } catch (e) {}
        }

        if (!isUsed) {
          deadCodes.push({ file: info.filePath, symbol: name });
        }
      }
    }
    return deadCodes;
  }

  analyzeImpact(filePath: string, symbolName: string) {
    const referencingFiles = this.depGraph.getDependents(filePath);
    return {
      symbol: symbolName,
      referencingFiles,
      affectedTests: referencingFiles.filter((f) => f.includes('.test.') || f.includes('.spec.')),
    };
  }

  findReferences(filePath: string, symbolName: string) {
    const dependents = this.depGraph.getDependents(filePath);
    return dependents.map((file) => ({ file, line: 0, text: `Referenced in ${file}` }));
  }

  goToDefinition(filePath: string, symbolName: string) {
    const symbols = this.indexer.getSymbolsByName(symbolName);
    return symbols.length > 0 ? { file: symbols[0].filePath, line: symbols[0].startLine } : null;
  }

  getDependents(filePath: string): string[] {
    return this.depGraph.getDependents(filePath);
  }
}
