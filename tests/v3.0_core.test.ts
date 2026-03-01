import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';
import { checkTestValidity } from '../src/analysis/test-check.js';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('v3.0 Core Architecture Validation', () => {
  const testFile = join(process.cwd(), 'v3_test_logic.ts');
  const fakeTestFile = join(process.cwd(), 'v3_test_no_assertion.test.ts');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
    if (existsSync(testFile)) rmSync(testFile);
    if (existsSync(fakeTestFile)) rmSync(fakeTestFile);
  });

  it('Performance: AstCacheManager가 중복 파싱을 방지해야 한다', () => {
    const code = 'const a = 1;';
    writeFileSync(testFile, code);

    const cache = AstCacheManager.getInstance();
    
    // 첫 번째 호출: 파싱 수행
    const root1 = cache.getRootNode(testFile);
    // 두 번째 호출: 캐시된 노드 반환
    const root2 = cache.getRootNode(testFile);

    expect(root1).not.toBeNull();
    expect(root1).toBe(root2); // 동일한 인스턴스(객체 참조)여야 함
  });

  it('Quality: 단언문(expect)이 없는 테스트 파일을 탐지해야 한다', () => {
    const code = `
      describe('fake test', () => {
        it('should do nothing', () => {
          const a = 1 + 1;
          // No expect here!
        });
      });
    `;
    writeFileSync(fakeTestFile, code);

    const result = checkTestValidity(fakeTestFile);
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('단언문(expect, assert 등)이 발견되지 않았습니다');
  });

  it('Abstraction: BaseQualityProvider로부터 임계치를 올바르게 상속받아야 한다', () => {
    const provider = new JavascriptProvider({
      rules: { maxLineCount: 100, maxComplexity: 10 }
    } as any);

    // 데이터 파일이 아닐 때
    const normalLimits = (provider as any).getEffectiveLimits(false);
    expect(normalLimits.maxLines).toBe(100);

    // 데이터 파일일 때 (v3.0 추상화 로직)
    const dataLimits = (provider as any).getEffectiveLimits(true);
    expect(dataLimits.maxLines).toBe(Infinity);
    expect(dataLimits.maxComplexity).toBe(Infinity);
  });
});
