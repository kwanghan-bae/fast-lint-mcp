import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runBatchAnalysisNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Batch Analyzer (Commit 12.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_batch');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('한 번의 호출로 심볼 추출과 보안 스캔을 병렬로 수행해야 한다', () => {
    const file1 = join(testDir, 'source.ts');
    const code = 'export function myFunc() {\n' + '  const key = "AKIA1234567890ABCDEF";\n' + '}\n';

    writeFileSync(file1, code);

    const results = runBatchAnalysisNative([file1]);

    expect(results.length).toBe(1);
    expect(results[0].file).toBe(file1);

    // 심볼 검증
    expect(results[0].symbols.some((s) => s.name === 'myFunc')).toBe(true);

    // 보안 스캔 검증
    expect(results[0].secrets.some((v) => v.message.includes('AWS'))).toBe(true);
  });
});
