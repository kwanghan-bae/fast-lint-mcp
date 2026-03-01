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
    status: () => Promise.resolve({ modified: [], not_added: [], created: [], staged: [], renamed: [] })
  })
}));
vi.mock('../src/utils/DependencyGraph.js');

describe('AnalysisService Extra (Coverage & Error)', () => {
  let service: AnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DependencyGraph).prototype.build = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DependencyGraph).prototype.getDependents = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.detectCycles = vi.fn().mockReturnValue([]);
    vi.mocked(glob).mockResolvedValue(['src/test.ts'] as any);
    
    const mockConfig = {
      rules: {
        minCoverage: 80,
        coverageDirectory: 'coverage',
        coveragePath: 'coverage/lcov.info',
        techDebtLimit: 10
      },
      exclude: [],
      incremental: false,
      customRules: [],
      architectureRules: []
    };
    const mockStateManager = {
      getLastCoverage: vi.fn().mockReturnValue(null),
      saveCoverage: vi.fn()
    };
    service = new AnalysisService(mockStateManager as any, mockConfig as any, {} as any);
  });

  it('lcov.info 형식을 올바르게 파싱해야 한다', async () => {
    const lcovContent = 'LF:100\nLH:90\n'; // 90% coverage
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(lcovContent);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: Date.now() } as any);

    const report = await service.runAllChecks();
    expect(report.violations.filter(v => v.type === 'COVERAGE').length).toBe(0);
  });

  it('테스트 리포트가 소스보다 오래된 경우(Stale) 경고를 발생시켜야 한다', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ total: { lines: { pct: 90 } } }));
    
    const now = Date.now();
    // 리포트는 1시간 전, 소스는 방금 수정됨
    vi.spyOn(fs, 'statSync').mockImplementation((path: any) => {
      if (path.toString().includes('coverage')) return { mtimeMs: now - 3600000 } as any;
      return { mtimeMs: now } as any;
    });

    const report = await service.runAllChecks();
    expect(report.violations.some(v => v.message.includes('만료'))).toBe(true);
  });
});
