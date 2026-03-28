import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { countTechDebt } from '../src/analysis/rg.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('countTechDebt', () => {
  const testDir = join(process.cwd(), 'temp_rg_test');
  const srcDir = join(testDir, 'src');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('src 디렉토리의 [PLAN], FIXME 개수를 정확히 세어야 한다', async () => {
    const fileA = join(srcDir, 'a.ts');
    const fileB = join(srcDir, 'b.ts');
    writeFileSync(fileA, '// [PLAN]: fix this\n// FIXME: urgent');
    writeFileSync(fileB, '/* HACK: work around */\n// XXX: check this');

    const count = await countTechDebt([fileA, fileB]);
    expect(count).toBe(4);
  });

  it('태그가 없으면 0을 반환해야 한다', async () => {
    const file = join(srcDir, 'clean.ts');
    writeFileSync(file, 'const a = 1;');
    const count = await countTechDebt([file]);
    expect(count).toBe(0);
  });

  it('오류 발생 시 0을 반환해야 한다', async () => {
    const count = await countTechDebt([join(testDir, 'non-existent.ts')]);
    expect(count).toBe(0);
  });
});
