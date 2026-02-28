import { describe, it, expect, vi } from 'vitest';
import { findOrphanFiles } from '../src/analysis/fd.js';
import glob from 'fast-glob';
import { readFile } from 'fs';
import { parse } from '@ast-grep/napi';

vi.mock('fast-glob');
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFile: vi.fn(),
    readFileSync: vi.fn(),
  };
});

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

    // readFileAsync(promisify(readFile)) 대응을 위한 모킹
    vi.mocked(readFile).mockImplementation((path: any, encoding: any, cb: any) => {
      if (typeof encoding === 'function') {
        cb = encoding;
        encoding = undefined;
      }
      
      if (path.includes('index.ts')) {
        cb(null, 'index_content');
      } else {
        cb(null, 'empty_content');
      }
    });

    // parse & findAll 모킹
    vi.mocked(parse).mockImplementation((lang, content) => {
      const mockRoot = {
        findAll: vi.fn().mockImplementation((pattern) => {
          if (pattern.includes('import') && content === 'index_content') {
            return [
              {
                getMatch: (id: string) => {
                  if (id === 'SOURCE') return { text: () => './used' };
                  return null;
                },
              },
            ];
          }
          return [];
        }),
      };
      return { root: () => mockRoot } as any;
    });

    const orphans = await findOrphanFiles();

    expect(orphans).toContain('src/orphan.ts');
    expect(orphans).not.toContain('src/index.ts');
    expect(orphans).not.toContain('src/used.ts');
  });
});
