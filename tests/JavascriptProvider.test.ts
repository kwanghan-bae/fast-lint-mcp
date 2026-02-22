import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import { ConfigService } from '../src/config.js';
import * as sg from '../src/analysis/sg.js';
import * as importCheck from '../src/analysis/import-check.js';
import * as security from '../src/checkers/security.js';
import * as mutation from '../src/analysis/mutation.js';
import * as reviewer from '../src/analysis/reviewer.js';

vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/import-check.js');
vi.mock('../src/checkers/security.js');
vi.mock('../src/analysis/mutation.js');
vi.mock('../src/analysis/reviewer.js');

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
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'test.ts',
      lineCount: 50,
      complexity: 5,
      customViolations: [],
    });
    vi.mocked(importCheck.checkHallucination).mockResolvedValue([]);
    vi.mocked(importCheck.checkFakeLogic).mockResolvedValue([]);
    vi.mocked(security.checkSecrets).mockResolvedValue([]);
    vi.mocked(reviewer.runSemanticReview).mockResolvedValue([]);
    vi.mocked(mutation.runMutationTest).mockResolvedValue([]);
  });

  it('파일 사이즈가 임계값을 초과하면 SIZE 위반을 반환해야 한다', async () => {
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'test.ts',
      lineCount: 150,
      complexity: 5,
      customViolations: [],
    });
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'SIZE')).toBe(true);
  });

  it('복잡도가 임계값을 초과하면 COMPLEXITY 위반을 반환해야 한다', async () => {
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'test.ts',
      lineCount: 50,
      complexity: 15,
      customViolations: [],
    });
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'COMPLEXITY')).toBe(true);
  });

  it('환각이 탐지되면 HALLUCINATION 위반을 포함해야 한다', async () => {
    vi.mocked(importCheck.checkHallucination).mockResolvedValue([
      { id: 'HALLUCINATION_FILE', message: 'error' },
    ]);
    const violations = await provider.check('test.ts');
    expect(violations.some((v) => v.type === 'HALLUCINATION')).toBe(true);
  });
});
