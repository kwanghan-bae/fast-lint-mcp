import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { getProjectFiles, clearProjectFilesCache } from '../src/analysis/import-check.js';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { StateManager } from '../src/state.js';
import { ConfigService } from '../src/config.js';
import { rmSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    checkIsRepo: () => Promise.resolve(false),
    status: () =>
      Promise.resolve({ modified: [], not_added: [], created: [], staged: [], renamed: [] }),
  }),
}));

describe('v3.2 Turbo Engine Validation', () => {
  const externalWorkspace = join(process.cwd(), 'temp_external_proj');

  beforeEach(() => {
    if (!existsSync(externalWorkspace)) mkdirSync(externalWorkspace, { recursive: true });
    clearProjectFilesCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(externalWorkspace)) rmSync(externalWorkspace, { recursive: true, force: true });
  });

  it('Turbo Build: DependencyGraph가 무거운 디렉토리를 무시해야 한다', async () => {
    const dg = new DependencyGraph(externalWorkspace);

    // 실제 파일 생성
    const srcDir = join(externalWorkspace, 'src');
    const nodeModulesDir = join(externalWorkspace, 'node_modules');
    if (!existsSync(srcDir)) mkdirSync(srcDir);
    if (!existsSync(nodeModulesDir)) mkdirSync(nodeModulesDir);

    writeFileSync(join(srcDir, 'main.ts'), 'export const a = 1;');
    writeFileSync(join(nodeModulesDir, 'ignored.ts'), 'export const b = 1;');

    await dg.build();

    const files = dg.getAllFiles();
    expect(files.some((f) => f.includes('src/main.ts'))).toBe(true);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('Project File Cache: 동일 워크스페이스에 대해 캐시를 사용해야 한다', async () => {
    const srcDir = join(externalWorkspace, 'src');
    if (!existsSync(srcDir)) mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'file1.ts'), 'content');

    const files1 = await getProjectFiles(externalWorkspace);
    const files2 = await getProjectFiles(externalWorkspace);

    // 내용이 같아야 함 (캐시 동작 확인)
    expect(files1).toEqual(files2);
    expect(files1).toBe(files2); // 레퍼런스 동일성 확인
  });

  it('Cross-Project Context: AnalysisService가 주입된 경로를 기준으로 동작해야 한다', async () => {
    const mockConfig = new ConfigService(externalWorkspace);
    const mockState = new StateManager(externalWorkspace);
    const service = new AnalysisService(mockState, mockConfig, {} as any);

    expect((service as any).workspacePath).toBe(externalWorkspace);
    expect(simpleGit).toHaveBeenCalledWith(externalWorkspace);
  });
});
