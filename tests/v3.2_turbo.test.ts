import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { getProjectFiles, clearProjectFilesCache } from '../src/analysis/import-check.js';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { StateManager } from '../src/state.js';
import { ConfigService } from '../src/config.js';
import { rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import glob from 'fast-glob';
import { simpleGit } from 'simple-git';

vi.mock('fast-glob', async (importOriginal) => {
  const original = await importOriginal<typeof import('fast-glob')>();
  return { ...original, default: vi.fn() };
});

vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    checkIsRepo: () => Promise.resolve(false),
    status: () => Promise.resolve({ modified: [], not_added: [], created: [], staged: [], renamed: [] })
  })
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
    vi.mocked(glob).mockResolvedValue(['src/main.ts'] as any);

    await dg.build();

    const lastGlobCall = vi.mocked(glob).mock.calls[0];
    expect(lastGlobCall[1]?.ignore).toContain('**/node_modules/**');
    expect(lastGlobCall[1]?.ignore).toContain('**/dist/**');
  });

  it('Project File Cache: 동일 워크스페이스에 대해 캐시를 사용해야 한다', async () => {
    vi.mocked(glob).mockResolvedValue(['file1.ts'] as any);

    const files1 = await getProjectFiles(externalWorkspace);
    const files2 = await getProjectFiles(externalWorkspace);

    expect(vi.mocked(glob)).toHaveBeenCalledTimes(1);
    expect(files1).toBe(files2);
  });

  it('Cross-Project Context: AnalysisService가 주입된 경로를 기준으로 동작해야 한다', async () => {
    const mockConfig = new ConfigService(externalWorkspace);
    const mockState = new StateManager(externalWorkspace);
    const service = new AnalysisService(mockState, mockConfig, {} as any);

    expect((service as any).workspacePath).toBe(externalWorkspace);
    expect(simpleGit).toHaveBeenCalledWith(externalWorkspace);
  });
});
