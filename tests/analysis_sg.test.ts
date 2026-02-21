import { describe, it, expect, vi } from 'vitest';
import { analyzeFile } from '../src/analysis/sg.js';
import { readFileSync } from 'fs';
import { parse } from '@ast-grep/napi';

vi.mock('fs');
vi.mock('@ast-grep/napi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ast-grep/napi')>();
  return {
    ...original,
    parse: vi.fn(),
  };
});

describe('AST Analysis (sg Native)', () => {
  it('파일의 라인 수와 복잡도를 올바르게 계산해야 한다', async () => {
    // fs.readFileSync 모킹
    vi.mocked(readFileSync).mockReturnValue('line1\nline2\nline3\nline4\nline5');
    
    // @ast-grep/napi parse 모킹
    const mockRoot = {
      findAll: vi.fn().mockImplementation((pattern) => {
        if (pattern.includes('if')) return [{}, {}]; // 2개 매치
        return [];
      }),
    };
    vi.mocked(parse).mockReturnValue({ root: () => mockRoot } as any);

    const result = await analyzeFile('src/index.ts');
    
    expect(result.path).toBe('src/index.ts');
    expect(result.lineCount).toBe(5);
    expect(result.complexity).toBe(2);
  });
});
