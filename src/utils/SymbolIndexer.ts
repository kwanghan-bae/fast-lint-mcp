import { readFileSync, readFile } from 'fs';
import { promisify } from 'util';
import glob from 'fast-glob';
import { parse, Lang, SgNode } from '@ast-grep/napi';
import { normalize, join } from 'path';
import pMap from 'p-map';
import os from 'os';

/** 프로미스 기반 파일 읽기 헬퍼 */
const readFileAsync = promisify(readFile);

/**
 * 심볼(클래스, 함수, 메서드 등)의 정의 위치와 참조 정보를 인덱싱하여 고속 탐색을 지원하는 클래스입니다.
 * v3.7.2: 모든 선언 방식을 지원하는 최종 인덱싱 엔진
 */
export class SymbolIndexer {
  /** 심볼 정의 위치 맵 */
  private definitions = new Map<string, { file: string; line: number }>();
  /** 심볼 참조 위치 맵 */
  private references = new Map<string, { file: string; line: number }[]>();
  /** 공개된 심볼 목록 */
  private exportedSymbols: { name: string; file: string }[] = [];

  /**
   * 프로젝트 전체를 스캔하여 심볼 인덱스를 구축합니다.
   */
  async indexAll(workspacePath: string) {
    this.definitions.clear();
    this.references.clear();
    this.exportedSymbols = [];

    const files = await glob(['**/*.{ts,js,tsx,jsx}'], {
      cwd: workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/coverage/**']
    });

    const concurrency = Math.max(1, os.cpus().length - 1);
    await pMap(files, async (file) => {
      try {
        await this.indexFile(file);
      } catch (e) {}
    }, { concurrency });
  }

  /** 단일 파일을 분석하여 인덱스에 추가합니다. */
  private async indexFile(filePath: string) {
    const content = await readFileAsync(filePath, 'utf-8');
    const lang = filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
    const root = parse(lang, content).root();

    // 1. 모든 선언(Declaration) 탐색
    const declKinds = ['class_declaration', 'function_declaration', 'method_definition', 'variable_declarator', 'lexical_declaration'];
    root.findAll({ rule: { any: declKinds.map(k => ({ kind: k })) } }).forEach(node => {
      const idNode = node.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }, { kind: 'property_identifier' }] } });
      if (idNode) {
        const name = idNode.text();
        const line = node.range().start.line + 1;
        
        let fullName = name;
        // 메서드명 정규화 (ClassName.methodName)
        if (node.kind() === 'method_definition') {
          const cls = node.parent()?.parent();
          if (cls && (cls.kind() === 'class_declaration' || cls.kind() === 'class')) {
            const clsName = cls.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } })?.text();
            if (clsName) fullName = `${clsName}.${name}`;
          }
        }

        this.definitions.set(fullName, { file: filePath, line });
        if (node.text().includes('export ')) {
          this.exportedSymbols.push({ name: fullName, file: filePath });
        }
      }
    });

    // 2. 모든 식별자 참조 탐색
    root.findAll({ rule: { kind: 'identifier' } }).forEach(node => {
      const name = node.text();
      if (!this.references.has(name)) this.references.set(name, []);
      this.references.get(name)!.push({ file: filePath, line: node.range().start.line + 1 });
    });
  }

  /** 정의 위치 반환 */
  getDefinition(name: string) { return this.definitions.get(name) || null; }
  /** 참조 위치 목록 반환 */
  findReferences(name: string) { return this.references.get(name) || []; }
  /** 모든 수출 심볼 반환 */
  getAllExportedSymbols() { return this.exportedSymbols; }
}
