import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as fs from 'fs';
import { join } from 'path';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import glob from 'fast-glob';

vi.mock('fs');
vi.mock('fast-glob');
vi.mock('simple-git', () => ({
  simpleGit: () => ({
    checkIsRepo: () => Promise.resolve(false),
    status: () =>
      Promise.resolve({ modified: [], not_added: [], created: [], staged: [], renamed: [] }),
  }),
}));
vi.mock('../src/utils/DependencyGraph.js');

describe('AnalysisService Extra (Coverage & Error)', () => {
  let service: AnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DependencyGraph).prototype.build = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DependencyGraph).prototype.getDependents = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.getDependencies = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.getAllFiles = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.detectCycles = vi.fn().mockReturnValue([]);
    vi.mocked(glob).mockResolvedValue(['src/test.ts'] as any);

    const mockConfig = {
      rules: {
        minCoverage: 85,
        coverageDirectory: 'coverage',
        coveragePath: 'coverage/lcov.info',
        techDebtLimit: 10,
      },
      exclude: [],
      incremental: false,
      customRules: [],
      architectureRules: [],
    };
    const mockStateManager = {
      getLastCoverage: vi.fn().mockReturnValue(null),
      saveCoverage: vi.fn(),
    };
    const mockSemantic = {
      getAllExportedSymbols: vi.fn().mockReturnValue([]),
      getSymbolMetrics: vi.fn().mockReturnValue([]),
      ensureInitialized: vi.fn().mockResolvedValue(undefined),
    };
    service = new AnalysisService(mockStateManager as any, mockConfig as any, mockSemantic as any);
  });

  it('lcov.info 형식을 올바르게 파싱해야 한다', async () => {
    const lcovContent = 'LF:100\nLH:90\n'; // 90% coverage
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(lcovContent);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: Date.now(), mtime: new Date() } as any);

    // v3.9.0: 명시적인 경로 전달로 탐색 로직 우회
    const report = await service.runAllChecks({ coveragePath: 'coverage/lcov.info' });
    expect(report.violations.filter((v) => v.type === 'COVERAGE').length).toBe(0);
  });

  it('테스트 리포트가 소스보다 오래된 경우(Stale) 경고를 발생시켜야 한다', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ total: { lines: { pct: 90 } } }));

    const now = Date.now();
    // v4.8.0: 유예 기간 15분을 넘기기 위해 20분 전으로 설정
    vi.spyOn(fs, 'statSync').mockImplementation((path: any) => {
      if (path.toString().includes('coverage')) {
        return { mtimeMs: now - 1200000, mtime: new Date(now - 1200000) } as any;
      }
      return { mtimeMs: now, mtime: new Date() } as any;
    });

    const report = await service.runAllChecks({ coveragePath: 'coverage/coverage-summary.json' });
    expect(report.violations.some((v) => v.message.includes('만료'))).toBe(true);
  });
});
