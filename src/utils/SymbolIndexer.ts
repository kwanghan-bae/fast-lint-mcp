import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import { join, normalize, isAbsolute } from 'path';
import glob from 'fast-glob';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import pMap from 'p-map';
import os from 'os';

const readFileAsync = promisify(readFile);

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
 * p-map과 비동기 I/O를 활용하여 수천 개의 심볼을 병렬로 초고속 인덱싱합니다.
 */
export class SymbolIndexer {
  // 전역 심볼명을 키로 하고, 해당 심볼의 위치 정보 목록을 값으로 가지는 맵
  public symbolMap: Map<string, SymbolInfo[]> = new Map();

  /**
   * SymbolIndexer 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 비동기 병렬로 읽어 심볼 인덱스를 구축합니다.
   */
  async index() {
    this.symbolMap.clear();
    const pattern = '**/*.{ts,js,tsx,jsx}';

    // 분석 대상 파일 목록 획득
    const files = await glob([pattern], {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    const concurrency = Math.max(1, os.cpus().length - 1);

    await pMap(
      files,
      async (file) => {
        try {
          const content = await readFileAsync(file, 'utf-8');
          const lang = (file.endsWith('.ts') || file.endsWith('.tsx')) ? Lang.TypeScript : Lang.JavaScript;
          const root = parse(lang, content).root();
          const normalizedPath = normalize(file);

          // 개별 파일의 AST를 순회하며 심볼 추출
          this.traverse(root, normalizedPath);
        } catch (e) {
          // 개별 파일 처리 실패 시 해당 파일만 건너뜀
        }
      },
      { concurrency }
    );
  }

  /**
   * AST 노드 트리를 재귀적으로 순회하며 클래스, 함수, 메소드 등을 찾아 인덱스에 추가합니다.
   */
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

        // 클래스명.메소드명 형태의 복합 키 생성
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

  /**
   * 특정 이름을 가진 심볼들의 위치 정보를 검색합니다.
   */
  getSymbolsByName(name: string): SymbolInfo[] {
    return this.symbolMap.get(name) || [];
  }

  /**
   * 발견된 심볼 정보를 맵에 추가합니다 (동시성 안전).
   */
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
