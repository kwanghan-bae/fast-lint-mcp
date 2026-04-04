import { normalize } from 'path';
import pMap from 'p-map';
import os from 'os';
import { findReferencesNative, scanFiles } from '../../native/index.js';
import { SYSTEM } from '../constants.js';
import { AstCacheManager } from './AstCacheManager.js';

/**
 * 프로젝트 전체 심볼의 정의 및 참조 관계를 인덱싱합니다.
 * v0.0.1: Rust Native 엔진을 사용하여 초고속 인덱싱 및 참조 탐색을 수행합니다.
 */
export class SymbolIndexer {
  /** 심볼 정의 위치 정보를 보관하는 맵 */
  private definitions = new Map<string, { file: string; line: number }>();
  /** 외부로 공개(export)된 심볼 목록 */
  private exportedSymbols: { name: string; file: string }[] = [];
  /** 인덱싱에 사용된 파일 목록 */
  private indexedFiles: string[] = [];
  /** 인덱싱 완료 여부 상태 */
  public isIndexed: boolean = false;

  /**
   * 프로젝트 전체를 스캔하여 심볼 인덱스를 구축합니다.
   * @param workspacePath 인덱싱 대상 워크스페이스 경로
   * @param providedFiles 이미 확보된 파일 리스트
   */
  async indexAll(workspacePath: string, providedFiles?: string[]) {
    this.isIndexed = false;
    this.definitions.clear();
    this.exportedSymbols = [];

    // 파일 목록 확보
    if (providedFiles && providedFiles.length > 0) {
      this.indexedFiles = providedFiles.map((f) => normalize(f));
    } else {
      this.indexedFiles = scanFiles(workspacePath, SYSTEM.DEFAULT_IGNORE_PATTERNS).map((f) =>
        normalize(f)
      );
    }

    const cpu = Math.max(1, os.cpus().length - 1);
    const cache = AstCacheManager.getInstance();
    await pMap(
      this.indexedFiles,
      async (f) => {
        try {
          const symbols = cache.getSymbols(f);
          for (const s of symbols) {
            this.definitions.set(s.name, { file: f, line: s.line });
            if (s.isExported) {
              this.exportedSymbols.push({ name: s.name, file: f });
            }
          }
        } catch (e) {
          console.warn(`[SymbolIndexer] 파일 인덱싱 실패 (${f}):`, (e as Error).message);
        }
      },
      { concurrency: cpu }
    );

    this.isIndexed = true;
  }

  /**
   * 특정 심볼이 사용된 모든 위치를 찾습니다.
   * v0.0.1: Native Parallel Regex Search를 사용하여 빛의 속도로 참조를 찾습니다.
   */
  findReferences(symbolName: string): { file: string; line: number }[] {
    try {
      const results = findReferencesNative(symbolName, this.indexedFiles);
      return results.map((r) => ({ file: r.file, line: r.line }));
    } catch (e) {
      return [];
    }
  }

  /**
   * 특정 심볼의 정의 위치를 반환합니다.
   */
  getDefinition(symbolName: string): { file: string; line: number } | null {
    return this.definitions.get(symbolName) || null;
  }

  /**
   * 정의된 모든 심볼 목록을 반환합니다.
   */
  getDefinitions() {
    return this.definitions;
  }

  /**
   * 외부로 내보낸(Export) 심볼 목록을 반환합니다.
   */
  getAllExportedSymbols() {
    return this.exportedSymbols;
  }
}
