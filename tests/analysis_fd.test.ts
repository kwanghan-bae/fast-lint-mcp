import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findOrphanFiles, getDependencyMap } from '../src/analysis/fd.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('findOrphanFiles', () => {
  const testDir = join(process.cwd(), 'temp_fd_test');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('참조되지 않은 파일을 올바르게 식별해야 한다', async () => {
    const file1 = join(testDir, 'index.ts');
    const file2 = join(testDir, 'used.ts');
    const orphan = join(testDir, 'orphan.ts');

    writeFileSync(file1, "import './used'");
    writeFileSync(file2, "export const a = 1");
    writeFileSync(orphan, "export const b = 2");

    const allFiles = [file1, file2, orphan];
    const depMap = await getDependencyMap(testDir, allFiles);
    
    // index.ts를 진입점으로 설정
    const orphans = await findOrphanFiles(depMap, [file1]);

    expect(orphans).toContain(orphan);
    expect(orphans).not.toContain(file1);
    expect(orphans).not.toContain(file2);
  });
});
