import { readFileSync, existsSync } from 'fs';
import { join, normalize, isAbsolute } from 'path';
import glob from 'fast-glob';
import { Lang, parse, SgNode } from '@ast-grep/napi';

/**
 * 추출된 개별 심볼의 메타데이터를 담는 인터페이스입니다.
 */
export interface SymbolInfo {
  name: string; // 심볼의 식별자 이름
  filePath: string; // 심볼이 정의된 파일의 절대 경로
  kind: 'function' | 'class' | 'method' | 'variable'; // 심볼의 종류
  startLine: number; // 정의가 시작되는 라인 번호 (1-based)
}

/**
 * 프로젝트 전체의 소스 코드를 스캔하여 모든 주요 심볼의 위치 정보를 인덱싱하는 클래스입니다.
 * 고성능 심볼 검색 및 네비게이션 기능의 기반이 됩니다.
 */
export class SymbolIndexer {
  public symbolMap: Map<string, SymbolInfo[]> = new Map();

  constructor(private workspacePath: string = process.cwd()) {}

  async index() {
    this.symbolMap.clear();
    const pattern = '**/*.{ts,js,tsx,jsx}';

    const files = await glob([pattern], {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lang = (file.endsWith('.ts') || file.endsWith('.tsx')) ? Lang.TypeScript : Lang.JavaScript;
        const root = parse(lang, content).root();
        const normalizedPath = normalize(file);

        // 이전 방식(재귀 순회)으로 복구하되, 내부 로직은 ast-grep의 field/find 기능을 최대한 활용
        this.traverse(root, normalizedPath);
      } catch (e) {}
    }
  }

  private traverse(node: SgNode, filePath: string) {
    const kind = node.kind();
    const name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      if (name && name !== 'default') {
        this.addSymbol(name, filePath, 'class', node);
      }
    } else if (kind === 'function_declaration' || kind === 'function') {
      if (name && name !== 'default') {
        this.addSymbol(name, filePath, 'function', node);
      }
    } else if (kind === 'method_definition') {
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        this.addSymbol(name, filePath, 'method', node);

        let cls = node.parent();
        while (cls && cls.kind() !== 'class_declaration' && cls.kind() !== 'class') {
          cls = cls.parent();
        }
        if (cls) {
          const clsName = cls.field('name')?.text().trim();
          if (clsName) this.addSymbol(`${clsName}.${name}`, filePath, 'method', node);
        }
      }
    } else if (kind === 'variable_declarator') {
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        this.addSymbol(name, filePath, 'function', node);
      }
    }

    for (const child of node.children()) {
      this.traverse(child, filePath);
    }
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
