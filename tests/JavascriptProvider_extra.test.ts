import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import * as sg from '../src/analysis/sg.js';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('../src/analysis/sg.js');

describe('JavascriptProvider Advice Coverage', () => {
  let provider: JavascriptProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new JavascriptProvider({
      rules: { maxLineCount: 100, maxComplexity: 5 },
      exclude: []
    } as any);
    AstCacheManager.getInstance().clear();
  });

  it('UI와 로직 패턴이 결합된 경우 결합 조언을 제공해야 한다', async () => {
    // UI 패턴(useState)과 로직 패턴(Math)이 동시에 발견되도록 모킹
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'Hybrid.ts',
      lineCount: 50,
      complexity: 10, // 기준(5) 초과 유도
      isDataFile: false,
      topComplexSymbols: [{ name: 'hybridFunc', complexity: 10, kind: 'function', line: 1 }],
      customViolations: []
    });

    const mockRoot = {
      findAll: vi.fn().mockImplementation((p) => {
        const pStr = typeof p === 'string' ? p : JSON.stringify(p);
        if (pStr.includes('use$A') || pStr.includes('Math')) return [{}];
        return [];
      }),
      text: () => 'useState Math.abs'
    };
    vi.spyOn(AstCacheManager.getInstance(), 'getRootNode').mockReturnValue(mockRoot as any);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('useState Math.abs');

    const violations = await provider.check('Hybrid.ts');
    const compViolation = violations.find(v => v.type === 'COMPLEXITY');
    expect(compViolation?.message).toContain('강하게 결합');
  });

  it('순수 로직 패턴만 있는 경우 캡슐화 조언을 제공해야 한다', async () => {
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'LogicOnly.ts',
      lineCount: 50,
      complexity: 10,
      isDataFile: false,
      topComplexSymbols: [{ name: 'calcFunc', complexity: 10, kind: 'function', line: 1 }],
      customViolations: []
    });

    const mockRoot = {
      findAll: vi.fn().mockImplementation((p) => {
        const pStr = typeof p === 'string' ? p : JSON.stringify(p);
        if (pStr.includes('Math') || pStr.includes('crypto')) return [{}];
        return [];
      }),
      text: () => 'Math.abs crypto.hash'
    };
    vi.spyOn(AstCacheManager.getInstance(), 'getRootNode').mockReturnValue(mockRoot as any);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('Math.abs crypto.hash');

    const violations = await provider.check('LogicOnly.ts');
    const compViolation = violations.find(v => v.type === 'COMPLEXITY');
    expect(compViolation?.message).toContain('고도의 연산 로직');
  });
});
