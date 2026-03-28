import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import * as native from '../native/index.js';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

vi.mock('../native/index.js', () => ({
  runUltimateAnalysisNative: vi.fn(),
  runMutationTestNative: vi.fn(),
}));

vi.mock('../src/utils/AstCacheManager.js', () => {
  const mockGetRootNode = vi.fn();
  const mockClear = vi.fn();
  return {
    AstCacheManager: {
      getInstance: () => ({
        getRootNode: mockGetRootNode,
        clear: mockClear,
      }),
    },
  };
});

describe('JavascriptProvider Advice Coverage', () => {
  let provider: JavascriptProvider;
  let config: any;

  beforeEach(() => {
    config = {
      rules: { maxComplexity: 10 },
      customRules: [],
    };
    provider = new JavascriptProvider(config as any);
    vi.clearAllMocks();
  });

  it('UI와 로직 패턴이 결합된 경우 결합 조언을 제공해야 한다', async () => {
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'Hybrid.ts',
      line_count: 50,
      complexity: 20,
      violations: [],
      symbols: [],
    });

    const mockRoot = {
      findAll: vi.fn().mockImplementation((p) => {
        if (p === 'use$A($$$)') return [{}]; // UI
        if (p === 'fetch($$$)') return [{}]; // Logic
        return [];
      }),
    };
    vi.mocked(AstCacheManager.getInstance().getRootNode).mockReturnValue(mockRoot as any);

    const violations = await provider.check('Hybrid.ts');
    const compViolation = violations.find((v) => v.type === 'COMPLEXITY');
    expect(compViolation?.message).toContain('강하게 결합');
  });

  it('순수 로직 패턴만 있는 경우 캡슐화 조언을 제공해야 한다', async () => {
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'LogicOnly.ts',
      line_count: 50,
      complexity: 20,
      violations: [],
      symbols: [],
    });

    const mockRoot = {
      findAll: vi.fn().mockImplementation((p) => {
        if (p === 'Math.$A($$$)') return [{}]; // Logic
        return [];
      }),
    };
    vi.mocked(AstCacheManager.getInstance().getRootNode).mockReturnValue(mockRoot as any);

    const violations = await provider.check('LogicOnly.ts');
    const compViolation = violations.find((v) => v.type === 'COMPLEXITY');
    expect(compViolation?.message).toContain('고도의 연산 로직');
  });
});
