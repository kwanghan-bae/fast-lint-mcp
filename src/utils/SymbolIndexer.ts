import { readFileSync, readFile } from 'fs';
import { promisify } from 'util';
import glob from 'fast-glob';
import { parse, Lang, SgNode } from '@ast-grep/napi';
import { normalize, join } from 'path';
import pMap from 'p-map';
import os from 'os';

/** 프로미스 기반 파일 읽기 */
const readFileAsync = promisify(readFile);

/**
 * 프로젝트 전체 심볼의 정의 및 참조 관계를 인덱싱합니다.
 * v3.7.5: TS/JS 통합 식별자 지원 강화
 */
export class SymbolIndexer {
  /** 심볼 정의 위치 정보를 보관하는 맵 */
  private definitions = new Map<string, { file: string; line: number }>();
  /** 심볼 참조 위치 정보를 보관하는 맵 */
  private references = new Map<string, { file: string; line: number }[]>();
  /** 외부로 공개(export)된 심볼 목록 */
  private exportedSymbols: { name: string; file: string }[] = [];
  /** 인덱싱 완료 여부 상태 */
  public isIndexed: boolean = false;

  /**
   * 프로젝트 전체를 스캔하여 심볼 인덱스를 구축합니다.
   * @param workspacePath 인덱싱 대상 워크스페이스 경로
   */
  async indexAll(workspacePath: string) {
    this.isIndexed = false;
    this.definitions.clear();
    this.references.clear();
    this.exportedSymbols = [];

    const files = await glob(['**/*.{ts,js,tsx,jsx}'], {
      cwd: workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/coverage/**'],
    });

    const cpu = Math.max(1, os.cpus().length - 1);
    await pMap(
      files,
      async (f) => {
        try {
          await this.indexFile(f);
        } catch (e) {}
      },
      { concurrency: cpu }
    );

    this.isIndexed = true;
  }

  /**
   * 개별 파일을 분석하여 심볼 정보를 추출하고 인덱스에 저장합니다.
   */
  private async indexFile(filePath: string) {
    const content = await readFileAsync(filePath, 'utf-8');
    const lang =
      filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
    const root = parse(lang, content).root();

    // 1. 정의 추출
    const kinds = [
      'class_declaration',
      'function_declaration',
      'method_definition',
      'lexical_declaration',
      'variable_declarator',
    ];
    root.findAll({ rule: { any: kinds.map((k) => ({ kind: k })) } }).forEach((node) => {
      const idNode = this.getIdentifierNode(node);
      if (idNode) {
        const name = idNode.text().trim();
        const line = node.range().start.line + 1;
        let fullName = name;

        if (node.kind() === 'method_definition') {
          const cls = node.parent()?.parent();
          if (cls) {
            const clsName = this.getIdentifierNode(cls)?.text().trim();
            if (clsName) fullName = `${clsName}.${name}`;
          }
        }

        this.definitions.set(fullName, { file: filePath, line });
        if (node.text().includes('export ')) {
          this.exportedSymbols.push({ name: fullName, file: filePath });
        }
      }
    });

    // 2. 참조 추출
    root.findAll({ rule: { kind: 'identifier' } }).forEach((id) => {
      const name = id.text().trim();
      if (!this.references.has(name)) this.references.set(name, []);
      this.references.get(name)!.push({ file: filePath, line: id.range().start.line + 1 });
    });
  }

  /**
   * 노드에서 식별자(이름)를 나타내는 노드를 탐색합니다.
   */
  private getIdentifierNode(node: SgNode): SgNode | null {
    return node.find({
      rule: {
        any: [{ kind: 'identifier' }, { kind: 'type_identifier' }, { kind: 'property_identifier' }],
      },
    });
  }

  /**
   * 지정된 심볼의 정의 위치 정보를 가져옵니다.
   */
  getDefinition(name: string) {
    return this.definitions.get(name) || null;
  }

  /**
   * 지정된 심볼을 참조하는 모든 위치 목록을 가져옵니다.
   */
  findReferences(name: string) {
    return this.references.get(name) || [];
  }

  /**
   * 프로젝트 내의 모든 공개 심볼 목록을 가져옵니다.
   */
  getAllExportedSymbols() {
    return this.exportedSymbols;
  }
}
