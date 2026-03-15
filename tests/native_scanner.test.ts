import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanFiles } from '../native/index.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Native File Scanner (Commit 1.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_scan');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('Rust 스캐너가 파일을 정확히 수집해야 한다', () => {
    writeFileSync(join(testDir, 'file1.ts'), 'content');
    mkdirSync(join(testDir, 'sub'), { recursive: true });
    writeFileSync(join(testDir, 'sub', 'file2.js'), 'content');

    const files = scanFiles(testDir, []);
    expect(files.length).toBe(2);
    expect(files.some(f => f.endsWith('file1.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('file2.js'))).toBe(true);
  });

  it('.gitignore 규칙을 준수해야 한다 (Rust ignore crate 기능)', () => {
    // .gitignore 파일 생성
    writeFileSync(join(testDir, '.gitignore'), 'ignored.ts\nnode_modules/');
    
    writeFileSync(join(testDir, 'normal.ts'), 'content');
    writeFileSync(join(testDir, 'ignored.ts'), 'content');
    mkdirSync(join(testDir, 'node_modules'), { recursive: true });
    writeFileSync(join(testDir, 'node_modules', 'mod.ts'), 'content');

    const files = scanFiles(testDir, []);
    
    // ignored.ts와 node_modules/mod.ts는 제외되어야 함
    expect(files.some(f => f.endsWith('normal.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('ignored.ts'))).toBe(false);
    expect(files.some(f => f.endsWith('mod.ts'))).toBe(false);
  });

  it('사용자 지정 무시 패턴을 준수해야 한다', () => {
    writeFileSync(join(testDir, 'a.ts'), 'content');
    writeFileSync(join(testDir, 'b.ts'), 'content');

    const files = scanFiles(testDir, ['b.ts']);
    expect(files.some(f => f.endsWith('a.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('b.ts'))).toBe(false);
  });
});
