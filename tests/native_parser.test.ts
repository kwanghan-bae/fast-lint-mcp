import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseFilesBasic } from '../native/index.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Parallel Processing Engine (Commit 2.1)', () => {
  const testDir = join(process.cwd(), 'temp_parallel_test');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('Rayon 기반 병렬 처리가 다수의 파일에 대해 정확히 동작해야 한다', () => {
    const fileCount = 50;
    const filePaths: string[] = [];

    for (let i = 0; i < fileCount; i++) {
      const p = join(testDir, `file_${i}.ts`);
      writeFileSync(p, `console.log(${i});`);
      filePaths.push(p);
    }

    const start = Date.now();
    const results = parseFilesBasic(filePaths);
    const duration = Date.now() - start;

    console.log(`Processed ${fileCount} files in ${duration}ms (Native Parallel)`);

    expect(results.length).toBe(fileCount);
    expect(results.every((r) => r === true)).toBe(true);
  });

  it('존재하지 않는 파일이 섞여 있어도 안정적으로 실패를 반환해야 한다 (Panic 방지)', () => {
    const results = parseFilesBasic(['non_existent_file.ts']);
    expect(results).toEqual([false]);
  });
});
