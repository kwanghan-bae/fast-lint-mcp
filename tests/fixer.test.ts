import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSelfHealing } from '../src/checkers/fixer.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('runSelfHealing', () => {
  const testDir = join(process.cwd(), 'temp_fixer_test');
  const srcDir = join(testDir, 'src');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('대상 파일이 없으면 빈 결과를 반환해야 한다', async () => {
    const result = await runSelfHealing([], testDir);
    expect(result.messages).toHaveLength(0);
  });

  it('비어있거나 문제가 없는 파일은 수정하지 않아야 한다', async () => {
    const filePath = join(srcDir, 'clean.ts');
    writeFileSync(filePath, 'const a = 1;');
    const result = await runSelfHealing([filePath], testDir);
    expect(result.messages).toHaveLength(0);
  });
});
