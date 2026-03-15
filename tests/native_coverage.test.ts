import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseLcovNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native LCOV Parser (Commit 10.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_coverage');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('LCOV 데이터를 정확히 파싱해야 한다', () => {
    const lcovPath = join(testDir, 'lcov.info');
    const lcovContent =
      'SF:src/file1.ts\n' +
      'LF:10\n' +
      'LH:8\n' +
      'end_of_record\n' +
      'SF:src/file2.ts\n' +
      'LF:20\n' +
      'LH:10\n' +
      'end_of_record\n';

    writeFileSync(lcovPath, lcovContent);

    const result = parseLcovNative(lcovPath, ['/abs/src/file1.ts', '/abs/src/file2.ts']);

    expect(result).toBeDefined();
    expect(result?.total).toBe(30);
    expect(result?.hit).toBe(18);
    expect(result?.files.length).toBe(2);

    const f1 = result?.files.find((f) => f.file.endsWith('file1.ts'));
    expect(f1?.total).toBe(10);
    expect(f1?.hit).toBe(8);
  });

  it('존재하지 않는 파일인 경우 null을 반환해야 한다', () => {
    const result = parseLcovNative('non_existent.info', []);
    expect(result).toBeNull();
  });
});
