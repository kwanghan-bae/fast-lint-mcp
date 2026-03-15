import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { countTechDebtNative } from '../native/index.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Native Tech Debt Scanner (Commit 2.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_rg');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('여러 파일에 흩어진 TODO, FIXME를 정확히 합산해야 한다', () => {
    const file1 = join(testDir, 'a.ts');
    const file2 = join(testDir, 'b.js');

    writeFileSync(file1, '// TODO: task 1\n// FIXME: task 2');
    writeFileSync(file2, '/* HACK: task 3 */\n// XXX: task 4');

    const total = countTechDebtNative([file1, file2]);
    expect(total).toBe(4);
  });

  it('대소문자를 구분하지 않아야 한다 (정규식 ?i 옵션)', () => {
    const file = join(testDir, 'case.ts');
    writeFileSync(file, '// todo: lower\n// ToDo: mixed\n// TODO: upper');

    const total = countTechDebtNative([file]);
    expect(total).toBe(3);
  });

  it('검출할 키워드가 없으면 0을 반환해야 한다', () => {
    const file = join(testDir, 'clean.ts');
    writeFileSync(file, 'const x = 1;');

    const total = countTechDebtNative([file]);
    expect(total).toBe(0);
  });
});
