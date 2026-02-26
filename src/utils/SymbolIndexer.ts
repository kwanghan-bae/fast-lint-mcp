import { readFileSync, existsSync } from 'fs';
import { join, normalize, isAbsolute } from 'path';
import glob from 'fast-glob';
import pMap from 'p-map';
import os from 'os';
import { Lang, parse, SgNode } from '@ast-grep/napi';

export interface SymbolInfo {
  name: string;
  filePath: string;
  kind: 'function' | 'class' | 'method' | 'variable';
  startLine: number;
}

export class SymbolIndexer {
  public symbolMap: Map<string, SymbolInfo[]> = new Map();

  constructor(private workspacePath: string = process.cwd()) {}

  async index() {
    this.symbolMap.clear();
    const pattern = isAbsolute(this.workspacePath)
      ? join(this.workspacePath, 'src/**/*.{ts,js,tsx,jsx}')
      : 'src/**/*.{ts,js,tsx,jsx}';
    const files = await glob([pattern], {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lang =
          file.endsWith('.tsx') || file.endsWith('.jsx')
            ? Lang.TypeScript
            : file.endsWith('.ts')
              ? Lang.TypeScript
              : Lang.JavaScript;
        const root = parse(lang, content).root();
        this.traverse(root, normalize(file));
      } catch (e) {
        // Skip files that fail to parse
      }
    }
  }

  private traverse(node: SgNode, filePath: string) {
    const kind = node.kind();
    let name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      if (!name || name === 'default') {
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      }
      if (name) this.addSymbol(name, filePath, 'class', node);
    } else if (kind === 'function_declaration' || kind === 'function') {
      if (!name || name === 'default') {
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      }
      if (name) this.addSymbol(name, filePath, 'function', node);
    } else if (kind === 'method_definition') {
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        this.addSymbol(name, filePath, 'method', node);
        // 클래스명 결합 시도
        const cls = node.parent()?.parent();
        const clsName =
          cls?.field('name')?.text().trim() ||
          cls
            ?.find({ rule: { kind: 'identifier' } })
            ?.text()
            .trim();
        if (clsName) this.addSymbol(`${clsName}.${name}`, filePath, 'method', node);
      }
    } else if (kind === 'variable_declarator') {
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        this.addSymbol(name, filePath, 'function', node);
      }
    }

    // 재귀 호출 (자식들 탐색)
    node.children().forEach((child) => this.traverse(child, filePath));
  }

  getSymbolsByName(name: string): SymbolInfo[] {
    return this.symbolMap.get(name) || [];
  }

  private addSymbol(
    name: string,
    filePath: string,
    kind: 'function' | 'class' | 'method' | 'variable',
    node: SgNode
  ) {
    const info: SymbolInfo = {
      name,
      filePath,
      kind,
      startLine: node.range().start.line + 1,
    };
    const list = this.symbolMap.get(name) || [];
    if (!list.some((s) => s.filePath === info.filePath && s.startLine === info.startLine)) {
      list.push(info);
      this.symbolMap.set(name, list);
    }
  }
}
