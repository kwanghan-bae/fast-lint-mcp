import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkHallucination, checkFakeLogic } from '../src/analysis/import-check.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, normalize } from 'path';

describe('checkHallucination', () => {
  const testDir = normalize(join(process.cwd(), 'temp_import_test'));
  const srcDir = join(testDir, 'src');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '1.0.0' } })
    );
    writeFileSync(join(srcDir, 'target.ts'), 'export const a = 1;');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('ESM (.js) 확장자 임포트가 실제 .ts 파일을 가리키면 환각으로 보지 않아야 한다', async () => {
    const testFile = join(srcDir, 'test.ts');
    writeFileSync(testFile, "import { a } from './target.js';");
    const violations = await checkHallucination(testFile, testDir);
    expect(violations.some((v) => v.id === 'HALLUCINATION_FILE')).toBe(false);
  });
});

describe('checkFakeLogic', () => {
  const testFile = join(process.cwd(), 'temp_fake_test.ts');

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
  });

  it('파라미터를 사용하지 않고 상수만 반환하는 함수를 탐지해야 한다', async () => {
    // 본문이 확실히 줄바꿈으로 분리된 코드
    const code = 'function add(a, b) {\n  const x = 1;\n  return 10;\n}';
    writeFileSync(testFile, code);
    const violations = await checkFakeLogic(testFile);
    expect(violations.some((v) => v.id === 'FAKE_LOGIC_CONST')).toBe(true);
  });
});
