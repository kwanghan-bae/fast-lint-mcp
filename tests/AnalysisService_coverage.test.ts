import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as fs from 'fs';
import { join } from 'path';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import glob from 'fast-glob';

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
  const testDir = join(process.cwd(), 'temp_coverage_service_test');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
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
        coveragePath: join(testDir, 'lcov.info'),
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

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('lcov.info 형식을 올바르게 파싱해야 한다', async () => {
    const lcovContent = 'LF:100\nLH:90\nend_of_record\n'; // 90% coverage
    const lcovPath = join(testDir, 'lcov.info');
    fs.writeFileSync(lcovPath, lcovContent);

    const report = await service.runAllChecks({ coveragePath: lcovPath });
    // 90% > 85% 이므로 위반 사항이 없어야 함
    expect(report.violations.filter((v) => v.type === 'COVERAGE').length).toBe(0);
  });

  it('테스트 리포트가 소스보다 오래된 경우(Stale) 경고를 발생시켜야 한다', async () => {
    const summaryPath = join(testDir, 'coverage-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({ total: { lines: { pct: 90 } } }));

    // utimesSync를 사용하여 실제 파일 시간 조작 (ESM spyOn 이슈 우회)
    const now = Date.now();
    const staleTime = (now - 2000000) / 1000; // 2000초 전
    fs.utimesSync(summaryPath, staleTime, staleTime);

    const report = await service.runAllChecks({ coveragePath: summaryPath });
    expect(report.violations.some((v) => v.message.includes('만료'))).toBe(true);
  });
});
