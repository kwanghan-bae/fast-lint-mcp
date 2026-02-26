import { readFileSync, existsSync } from 'fs';
import { join, normalize, isAbsolute } from 'path';
import glob from 'fast-glob';
import pMap from 'p-map';
import os from 'os';
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
  // 전역 심볼명을 키로 하고, 해당 심볼의 위치 정보 목록을 값으로 가지는 맵
  public symbolMap: Map<string, SymbolInfo[]> = new Map();

  /**
   * SymbolIndexer 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 읽어 심볼 인덱스를 구축합니다.
   * 기존 인덱스는 초기화됩니다.
   */
  async index() {
    this.symbolMap.clear();
    const pattern = isAbsolute(this.workspacePath)
      ? join(this.workspacePath, '**/*.{ts,js,tsx,jsx}')
      : '**/*.{ts,js,tsx,jsx}';

    // 분석 대상 파일 목록 획득 (라이브러리 및 빌드 결과물 제외)
    const files = await glob([pattern], {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/tests/**'],
    });
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        // 파일 확장자에 따라 적절한 파싱 언어 설정
        const lang =
          file.endsWith('.tsx') || file.endsWith('.jsx')
            ? Lang.TypeScript
            : file.endsWith('.ts')
              ? Lang.TypeScript
              : Lang.JavaScript;

        // AST 루트 노드 획득 및 순회 시작
        const root = parse(lang, content).root();
        this.traverse(root, normalize(file));
      } catch (e) {
        // 특정 파일 파싱 실패 시 해당 파일은 무시
      }
    }
  }

  /**
   * AST 노드 트리를 재귀적으로 순회하며 클래스, 함수, 메소드 등을 찾아 인덱스에 추가합니다.
   * @param node 현재 탐색 중인 AST 노드
   * @param filePath 현재 파일 경로
   */
  private traverse(node: SgNode, filePath: string) {
    const kind = node.kind();
    // 노드의 이름(식별자) 필드 추출
    let name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      // 1. 클래스 정의 탐지
      if (!name || name === 'default') {
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      }
      if (name) this.addSymbol(name, filePath, 'class', node);
    } else if (kind === 'function_declaration' || kind === 'function') {
      // 2. 명시적 함수 정의 탐지
      if (!name || name === 'default') {
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      }
      if (name) this.addSymbol(name, filePath, 'function', node);
    } else if (kind === 'method_definition') {
      // 3. 클래스 내 메소드 정의 탐지
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        this.addSymbol(name, filePath, 'method', node);

        // 정밀 탐색을 위해 '클래스명.메소드명' 형태의 복합 키도 생성
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
      // 4. 변수에 할당된 화살표 함수나 익명 함수 탐지
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        this.addSymbol(name, filePath, 'function', node);
      }
    }

    // 모든 자식 노드들에 대해 재귀적으로 탐색 수행
    node.children().forEach((child) => this.traverse(child, filePath));
  }

  /**
   * 인덱스에서 특정 이름을 가진 심볼들의 위치 정보를 검색합니다.
   * @param name 검색할 심볼 이름
   * @returns 발견된 심볼 정보 목록
   */
  getSymbolsByName(name: string): SymbolInfo[] {
    return this.symbolMap.get(name) || [];
  }

  /**
   * 발견된 심볼 정보를 맵(symbolMap)에 안전하게 추가합니다.
   * 중복 등록을 방지합니다.
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
    // 동일 파일 내의 동일 라인에 이미 인덱싱된 경우 제외
    if (!list.some((s) => s.filePath === info.filePath && s.startLine === info.startLine)) {
      list.push(info);
      this.symbolMap.set(name, list);
    }
  }
}
