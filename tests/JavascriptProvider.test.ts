import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import * as native from '../native/index.js';

vi.mock('../native/index.js', () => ({
  runUltimateAnalysisNative: vi.fn(),
  runMutationTestNative: vi.fn(),
}));

describe('JavascriptProvider', () => {
  let provider: JavascriptProvider;
  let config: any;

  beforeEach(() => {
    config = {
      rules: {
        maxLineCount: 100,
        maxComplexity: 10,
      },
      customRules: [],
    };
    provider = new JavascriptProvider(config as any);

    // 기본 모킹
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'test.ts',
      line_count: 50,
      complexity: 5,
      violations: [],
      symbols: [],
    });
  });

  it('파일 사이즈가 임계값을 초과하면 SIZE 위반을 반환해야 한다', async () => {
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'test.ts',
      line_count: 150,
      complexity: 20, // Not a data file (20/150 > 0.1)
      violations: [],
      symbols: [],
    });
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'SIZE')).toBe(true);
  });

  it('복잡도가 임계값을 초과하면 COMPLEXITY 위반을 반환해야 한다', async () => {
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'test.ts',
      line_count: 50,
      complexity: 15,
      violations: [],
      symbols: [],
    });
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'COMPLEXITY')).toBe(true);
  });

  it('환각이 탐지되면 HALLUCINATION 위반을 포함해야 한다', async () => {
    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'test.ts',
      line_count: 50,
      complexity: 5,
      violations: [
        { type: 'HALLUCINATION', message: 'error', line: 1, rationale: 'test' }
      ],
      symbols: [],
    });
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'HALLUCINATION')).toBe(true);
  });
});
