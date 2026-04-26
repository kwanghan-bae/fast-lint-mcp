import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProjectFiles, clearProjectFilesCache } from '../src/analysis/import-check.js';
import * as native from '../native/index.js';

vi.mock('../native/index.js', () => ({
  scanFiles: vi.fn(),
  checkFakeLogicNative: vi.fn(),
  checkArchitectureNative: vi.fn(),
  extractSymbolsNative: vi.fn(),
}));

describe('import-check cache management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProjectFilesCache();
  });

  it('should cache project files and reuse them', async () => {
    const mockFiles = ['file1.ts', 'file2.ts'];
    vi.mocked(native.scanFiles).mockReturnValue(mockFiles);

    const workspacePath = '/test/workspace';

    // First call - should call scanFiles
    const files1 = await getProjectFiles(workspacePath);
    expect(files1).toEqual(mockFiles);
    expect(native.scanFiles).toHaveBeenCalledTimes(1);

    // Second call - should return cached files without calling scanFiles again
    const files2 = await getProjectFiles(workspacePath);
    expect(files2).toEqual(mockFiles);
    expect(native.scanFiles).toHaveBeenCalledTimes(1);
  });

  it('should clear cache and trigger re-scan', async () => {
    const mockFiles = ['file1.ts'];
    vi.mocked(native.scanFiles).mockReturnValue(mockFiles);

    const workspacePath = '/test/workspace';

    // Prime the cache
    await getProjectFiles(workspacePath);
    expect(native.scanFiles).toHaveBeenCalledTimes(1);

    // Clear the cache
    clearProjectFilesCache();

    // Call again - should call scanFiles again
    await getProjectFiles(workspacePath);
    expect(native.scanFiles).toHaveBeenCalledTimes(2);
  });

  it('should use different cache keys for different workspace paths', async () => {
    vi.mocked(native.scanFiles).mockReturnValue([]);

    const path1 = '/path/1';
    const path2 = '/path/2';

    await getProjectFiles(path1);
    expect(native.scanFiles).toHaveBeenCalledTimes(1);
    expect(native.scanFiles).toHaveBeenCalledWith(path1, expect.any(Array));

    await getProjectFiles(path2);
    expect(native.scanFiles).toHaveBeenCalledTimes(2);
    expect(native.scanFiles).toHaveBeenCalledWith(path2, expect.any(Array));
  });
});
