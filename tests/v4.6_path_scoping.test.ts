import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProjectFiles, clearProjectFilesCache } from '../src/analysis/import-check.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('v4.6 Strict Path Scoping 검증', () => {
  const testDir = join(process.cwd(), 'temp_scoping_test');

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    clearProjectFilesCache();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('targetPath에 따라 분석 대상 파일 개수가 정확히 제한되어야 한다', async () => {
    // 1. 모노레포 구조 생성
    const backendDir = join(testDir, 'backend');
    const frontendDir = join(testDir, 'frontend');
    mkdirSync(backendDir);
    mkdirSync(frontendDir);

    // backend에 파일 2개, frontend에 파일 1개 생성
    writeFileSync(join(backendDir, 'service.ts'), '// backend');
    writeFileSync(join(backendDir, 'controller.ts'), '// backend');
    writeFileSync(join(frontendDir, 'App.tsx'), '// frontend');

    // 2. backend 분석 시도
    const backendFiles = await getProjectFiles(backendDir, []);
    expect(backendFiles.length).toBe(2);
    expect(backendFiles.some((f) => f.includes('service.ts'))).toBe(true);
    expect(backendFiles.some((f) => f.includes('App.tsx'))).toBe(false);

    // 3. frontend 분석 시도 (캐시 오염 여부 확인)
    const frontendFiles = await getProjectFiles(frontendDir, []);
    expect(frontendFiles.length).toBe(1);
    expect(frontendFiles[0]).toContain('App.tsx');
    expect(frontendFiles.some((f) => f.includes('service.ts'))).toBe(false);
  });
});
