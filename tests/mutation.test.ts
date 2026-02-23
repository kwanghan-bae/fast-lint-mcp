import { describe, it, expect, vi, afterEach } from 'vitest';
import { runMutationTest } from '../src/analysis/mutation.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('runMutationTest', () => {
  const testFile = join(process.cwd(), 'temp_mutation_test.ts');

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
    vi.clearAllMocks();
  });

  it('변이 가능한 지점이 없으면 빈 배열을 반환해야 한다', async () => {
    writeFileSync(testFile, 'const x = 10;'); // ===, true 등이 없음
    const violations = await runMutationTest(testFile);
    expect(violations).toHaveLength(0);
  });

  it('변이 후 테스트가 실패하면(Killed) 위반 사항을 반환하지 않아야 한다', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Test failed');
    });

    writeFileSync(testFile, 'if (a === b) return true;');
    const violations = await runMutationTest(testFile);
    expect(violations).toHaveLength(0);
  });
});
