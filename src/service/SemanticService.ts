import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import { SymbolIndexer, SymbolInfo } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { normalize } from 'path';
import pMap from 'p-map';
import os from 'os';

const readFileAsync = promisify(readFile);

/**
 * 특정 심볼(함수, 클래스 등)의 분석 메트릭 정보를 담는 인터페이스입니다.
 */
export interface SymbolMetric {
  name: string; // 심볼 이름
  kind: string; // 종류 (class, function, method 등)
  lineCount: number; // 해당 심볼의 코드 라인 수
  complexity: number; // 심볼 내부의 순환 복잡도
}

/**
 * 프로젝트 전체의 시맨틱(의미론적) 분석을 담당하는 서비스 클래스입니다.
 * 고성능 Rust 기반 AST 엔진을 사용하여 심볼 인덱싱, 정밀 탐색, 미사용 코드 탐지 등을 수행합니다.
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

  /**
   * 특정 파일 내에 정의된 모든 주요 심볼들의 메트릭 정보를 비동기로 수집합니다.
   */
  async getSymbolMetricsAsync(filePath: string): Promise<SymbolMetric[]> {
    if (!existsSync(filePath)) return [];
    try {
      const content = await readFileAsync(filePath, 'utf-8');
      const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      const lang = isTs ? Lang.TypeScript : Lang.JavaScript;

      const root = parse(lang, content).root();
      const metrics: SymbolMetric[] = [];

      this.collectMetrics(root, metrics);
      return metrics;
    } catch (e) {
      return [];
    }
  }

  /**
   * 기존 동기 메서드 (하위 호환성 유지)
   */
  getSymbolMetrics(filePath: string): SymbolMetric[] {
    // 내부적으로 비동기 루프를 타지 않는 단순 collectMetrics는 동기적으로 유지 가능
    // 단, 파일 읽기는 SemanticService 외부에서 처리된 것을 가정하거나 동기 함수 사용
    const { readFileSync } = require('fs');
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, 'utf-8');
    const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const lang = isTs ? Lang.TypeScript : Lang.JavaScript;
    const root = parse(lang, content).root();
    const metrics: SymbolMetric[] = [];
    this.collectMetrics(root, metrics);
    return metrics;
  }

  private collectMetrics(node: SgNode, metrics: SymbolMetric[]) {
    const kind = node.kind();
    const name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      if (name && name !== 'default') {
        metrics.push(this.createMetric(name, 'class', node));
      }
    } else if (kind === 'function_declaration' || kind === 'function') {
      if (name && name !== 'default') {
        metrics.push(this.createMetric(name, 'function', node));
      }
    } else if (kind === 'method_definition') {
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        let cls = node.parent();
        while (cls && cls.kind() !== 'class_declaration' && cls.kind() !== 'class') {
          cls = cls.parent();
        }
        const clsName = cls?.field('name')?.text().trim();
        const fullName = clsName ? `${clsName}.${name}` : name;
        metrics.push(this.createMetric(fullName, 'method', node));
      }
    } else if (kind === 'variable_declarator') {
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        metrics.push(this.createMetric(name, 'function', node));
      }
    }

    for (const child of node.children()) {
      this.collectMetrics(child, metrics);
    }
  }

  private createMetric(name: string, kind: string, node: SgNode): SymbolMetric {
    return {
      name,
      kind,
      lineCount: node.text().split('\n').length,
      complexity: this.calculateComplexity(node),
    };
  }

  private calculateComplexity(node: SgNode): number {
    let complexity = 1;
    const kinds = ['if_statement', 'for_statement', 'while_statement', 'switch_statement', 'catch_clause', 'ternary_expression'];
    for (const k of kinds) {
      complexity += node.findAll({ rule: { kind: k } }).length;
    }
    complexity += node.findAll('&&').length;
    complexity += node.findAll('||').length;
    return complexity;
  }

  getSymbolContent(filePath: string, symbolName: string): string | null {
    const { readFileSync } = require('fs');
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      const lang = isTs ? Lang.TypeScript : Lang.JavaScript;
      const root = parse(lang, content).root();
      return this.findContentInNode(root, symbolName);
    } catch (e) {
      return null;
    }
  }

  private findContentInNode(node: SgNode, symbolName: string): string | null {
    const name = node.field('name')?.text().trim();

    if (symbolName.includes('.')) {
      const [clsName, methodName] = symbolName.split('.');
      if (name === clsName && (node.kind() === 'class_declaration' || node.kind() === 'class')) {
        for (const child of node.find({ rule: { kind: 'class_body' } })?.children() || []) {
          if (child.kind() === 'method_definition' && child.field('name')?.text().trim() === methodName) {
            return child.text();
          }
        }
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
   * 프로젝트 전체에서 실제로 사용되지 않는 Export 심볼을 병렬로 탐지합니다.
   */
  async findDeadCode(): Promise<{ file: string; symbol: string }[]> {
    const deadCodes: { file: string; symbol: string }[] = [];
    const allSymbolsMap = this.indexer.symbolMap;

    const depFileToNeededSymbols = new Map<string, Set<string>>();
    const symbolToInfo = new Map<string, SymbolInfo>();

    for (const [name, infos] of allSymbolsMap.entries()) {
      if (name.includes('.')) continue;
      for (const info of infos) {
        symbolToInfo.set(name, info);
        const dependents = this.depGraph.getDependents(info.filePath);
        for (const dep of dependents) {
          if (normalize(dep) === normalize(info.filePath)) continue;
          const set = depFileToNeededSymbols.get(dep) || new Set<string>();
          set.add(name);
          depFileToNeededSymbols.set(dep, set);
        }
      }
    }

    const symbolUsageMap = new Map<string, boolean>();
    const concurrency = Math.max(1, os.cpus().length - 1);

    await pMap(Array.from(depFileToNeededSymbols.entries()), async ([depFile, symbols]) => {
      try {
        const content = await readFileAsync(depFile, 'utf-8');
        const lang = (depFile.endsWith('.ts') || depFile.endsWith('.tsx')) ? Lang.TypeScript : Lang.JavaScript;
        const root = parse(lang, content).root();

        for (const symbol of symbols) {
          if (symbolUsageMap.get(symbol)) continue;
          if (!content.includes(symbol)) continue;
          if (root.find({ rule: { kind: 'identifier', regex: `^${symbol}$` } })) {
            symbolUsageMap.set(symbol, true);
          }
        }
      } catch (e) {}
    }, { concurrency });

    for (const [name, info] of symbolToInfo.entries()) {
      if (!symbolUsageMap.get(name)) {
        deadCodes.push({ file: info.filePath, symbol: name });
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
