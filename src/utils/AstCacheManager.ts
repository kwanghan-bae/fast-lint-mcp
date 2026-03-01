import { Lang, parse, SgNode } from '@ast-grep/napi';
import { readFileSync, existsSync, statSync } from 'fs';
import { normalize, isAbsolute, resolve } from 'path';

/**
 * 프로젝트 내 파일들의 AST(Abstract Syntax Tree)를 메모리에 캐싱합니다.
 * v3.7.6: 파일 수정 시간(mtime) 기반의 지능형 캐시 무효화 도입 (실시간성 확보)
 */
export class AstCacheManager {
  /** 싱글톤 인스턴스 보관 변수 */
  private static instance: AstCacheManager;
  /** 캐시 사용 여부 설정 (테스트 시 비활성화 가능) */
  public enabled: boolean = true;
  /** 파일 경로별 { mtime, root } 캐시 맵 */
  private cache: Map<string, { mtime: number; root: SgNode }> = new Map();

  /**
   * 내부 생성자로 외부 인스턴스화를 방지합니다.
   */
  private constructor() {}

  /**
   * AstCacheManager의 전역 인스턴스를 가져옵니다.
   */
  public static getInstance(): AstCacheManager {
    if (!AstCacheManager.instance) {
      AstCacheManager.instance = new AstCacheManager();
    }
    return AstCacheManager.instance;
  }

  /**
   * AST 루트 노드를 가져옵니다. 경로를 절대 경로로 강제 정규화하여 엔진 오류를 방지합니다.
   * v3.7.6: mtime을 체크하여 파일이 변경된 경우 강제로 새로 파싱합니다.
   * @param filePath 분석할 파일의 경로
   * @param force 캐시를 무시하고 새로 파싱할지 여부
   */
  public getRootNode(filePath: string, force: boolean = false): SgNode | null {
    const absPath = isAbsolute(filePath) ? normalize(filePath) : resolve(process.cwd(), filePath);

    if (!existsSync(absPath)) return null;

    // 실시간성 확보를 위한 mtime 획득
    const mtime = statSync(absPath).mtimeMs;

    if (this.enabled && !force && this.cache.has(absPath)) {
      const entry = this.cache.get(absPath)!;
      // 파일이 수정되지 않았다면 기존 캐시 반환
      if (entry.mtime === mtime) {
        return entry.root;
      }
    }

    try {
      const content = readFileSync(absPath, 'utf-8');
      if (!content.trim()) return null; // 빈 파일 방어

      let lang = Lang.JavaScript;
      const lower = absPath.toLowerCase();
      if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
        lang = Lang.TypeScript;
      } else if (lower.endsWith('.kt') || lower.endsWith('.kts')) {
        // v3.7.6: Kotlin 지원 여부 확인 후 폴백
        lang = (Lang as any).Kotlin || Lang.JavaScript;
      }

      const root = parse(lang, content).root();
      if (this.enabled) {
        this.cache.set(absPath, { mtime, root });
      }
      return root;
    } catch (error) {
      return null;
    }
  }

  /**
   * 저장된 모든 AST 캐시를 비웁니다.
   */
  public clear(): void {
    this.cache.clear();
  }
}
