import { parseAndCacheNative, clearAstCacheNative } from '../../native/index.js';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { readFileSync, existsSync, statSync } from 'fs';
import { normalize, isAbsolute, resolve } from 'path';

/**
 * 프로젝트 내 파일들의 AST 심볼 및 SgNode 정보를 캐싱합니다.
 * v6.3.0: 심볼은 Rust Native 메모리에, SgNode는 임시로 V8에 캐싱합니다.
 */
export class AstCacheManager {
  private static instance: AstCacheManager;
  public enabled: boolean = true;
  private nodeCache: Map<string, { mtime: number; root: SgNode }> = new Map();

  private constructor() {}

  public static getInstance(): AstCacheManager {
    if (!AstCacheManager.instance) {
      AstCacheManager.instance = new AstCacheManager();
    }
    return AstCacheManager.instance;
  }

  /**
   * [getSymbols] 메서드는 파일에서 심볼 정보를 추출하고 캐싱합니다.
   * Rust Native 레벨의 캐시를 우선적으로 사용합니다.
   */
  public getSymbols(filePath: string) {
    const absPath = isAbsolute(filePath) ? normalize(filePath) : resolve(process.cwd(), filePath);
    if (!existsSync(absPath)) return [];
    return parseAndCacheNative(absPath);
  }

  /**
   * [getRootNode] 메서드는 파일의 AST 루트 노드를 반환합니다.
   * mtime을 기반으로 V8 레벨에서 SgNode를 캐싱합니다.
   */
  public getRootNode(filePath: string, force: boolean = false): SgNode | null {
    const absPath = isAbsolute(filePath) ? normalize(filePath) : resolve(process.cwd(), filePath);
    if (!existsSync(absPath)) return null;

    let mtime = 0;
    try {
      mtime = statSync(absPath).mtimeMs;
    } catch (e) {
      return null;
    }

    if (this.enabled && !force && this.nodeCache.has(absPath)) {
      const entry = this.nodeCache.get(absPath)!;
      if (entry.mtime === mtime) return entry.root;
      this.nodeCache.delete(absPath);
    }

    try {
      const content = readFileSync(absPath, 'utf-8');
      if (!content.trim()) return null;

      let lang = Lang.JavaScript;
      const lower = absPath.toLowerCase();
      if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
        lang = Lang.TypeScript;
      }

      const root = parse(lang, content).root();
      if (this.enabled) {
        this.nodeCache.set(absPath, { mtime, root });
      }
      return root;
    } catch (error) {
      return null;
    }
  }

  /**
   * [clear] 메서드는 JS와 Rust 레벨의 모든 AST 캐시를 초기화합니다.
   */
  public clear(): void {
    try {
      clearAstCacheNative();
    } catch (e) {
      // 바인딩되지 않은 경우 무시
    }
    this.nodeCache.clear();
  }
}
