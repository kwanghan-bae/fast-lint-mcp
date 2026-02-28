import { Lang, parse, SgNode } from '@ast-grep/napi';
import { readFileSync, existsSync } from 'fs';

/**
 * 프로젝트 내 파일들의 AST(Abstract Syntax Tree)를 메모리에 캐싱하여
 * 동일 세션 내 중복 파싱을 방지하고 성능을 극대화하는 매니저 클래스입니다. (v3.0 Core)
 */
export class AstCacheManager {
  private static instance: AstCacheManager;
  // 파일 경로를 키로, 파싱된 루트 노드를 값으로 하는 맵
  private cache: Map<string, SgNode> = new Map();

  private constructor() {}

  public static getInstance(): AstCacheManager {
    if (!AstCacheManager.instance) {
      AstCacheManager.instance = new AstCacheManager();
    }
    return AstCacheManager.instance;
  }

  /**
   * 지정된 파일의 AST 루트 노드를 가져옵니다. 캐시에 없다면 새로 파싱합니다.
   */
  public getRootNode(filePath: string): SgNode | null {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
      const root = parse(lang, content).root();
      this.cache.set(filePath, root);
      return root;
    } catch (error) {
      console.error(`[AstCache] Failed to parse ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 캐시를 명시적으로 비웁니다. 분석 세션 종료 시 호출을 권장합니다.
   */
  public clear(): void {
    this.cache.clear();
  }
}
