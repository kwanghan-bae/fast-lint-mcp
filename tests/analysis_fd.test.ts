import { describe, it, expect, vi } from 'vitest';
import { findOrphanFiles } from '../src/analysis/fd.js';
import glob from 'fast-glob';
import { readFileSync } from 'fs';
import { parse } from '@ast-grep/napi';

vi.mock('fast-glob');
vi.mock('fs');
vi.mock('@ast-grep/napi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ast-grep/napi')>();
  return {
    ...original,
    parse: vi.fn(),
  };
});

describe('Orphan File Analysis (fast-glob + sg Native)', () => {
  it('참조되지 않은 파일을 올바르게 식별해야 한다', async () => {
    // glob 모킹
    vi.mocked(glob).mockResolvedValue(['src/index.ts', 'src/used.ts', 'src/orphan.ts'] as any);
    
    // readFileSync 모킹
    vi.mocked(readFileSync).mockReturnValue('mocked content');

    // parse & findAll 모킹
    vi.mocked(parse).mockImplementation((lang, content) => {
      // index.ts일 때만 used를 참조하는 상황 시뮬레이션
      const mockRoot = {
        findAll: vi.fn().mockImplementation((pattern) => {
          if (pattern.includes('import') && content === 'index_content') {
            return [{ getMatch: () => ({ text: () => './used' }) }];
          }
          return [];
        }),
      };
      return { root: () => mockRoot } as any;
    });

    // 각 파일에 대해 다른 내용을 제공하기 위한 readFileSync 모킹 재정의
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (path.includes('index.ts')) return 'index_content';
      return 'empty_content';
    });

    const orphans = await findOrphanFiles();
    
    expect(orphans).toContain('src/orphan.ts');
    expect(orphans).not.toContain('src/index.ts');
    expect(orphans).not.toContain('src/used.ts');
  });
});
