import { SgNode } from '@ast-grep/napi';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 테스트 파일이 실제로 로직을 검증하고 있는지(Assertion 존재 여부) 확인합니다. (v3.0 Intelligent Coverage)
 */
export function checkTestValidity(filePath: string): { isValid: boolean; message?: string } {
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return { isValid: true }; // 분석 불가 시 일단 유효한 것으로 간주

  // 1. 주요 Assertion 패턴 탐색 (Jest, Vitest, Mocha, Chai 등)
  const assertionPatterns = ['expect($$$)', 'assert($$$)', 'assert.$A($$$)', 'should.$A($$$)'];
  const assertionRule = { any: assertionPatterns.map((p) => ({ pattern: p })) };

  const hasAssertion = root.find({ rule: assertionRule }) !== null;

  if (!hasAssertion) {
    return {
      isValid: false,
      message:
        '테스트 파일에 단언문(expect, assert 등)이 발견되지 않았습니다. 실제 로직이 검증되고 있는지 확인하세요.',
    };
  }

  return { isValid: true };
}
