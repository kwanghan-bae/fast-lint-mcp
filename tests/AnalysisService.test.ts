import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as sg from '../src/analysis/sg.js';
import * as fd from '../src/analysis/fd.js';
import * as rg from '../src/analysis/rg.js';
import * as env from '../src/checkers/env.js';
import * as security from '../src/checkers/security.js';
import * as importCheck from '../src/analysis/import-check.js';
import { StateManager } from '../src/state.js';

vi.mock('../src/state.js');
vi.mock('../src/config.js');
vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/fd.js');
vi.mock('../src/analysis/rg.js');
vi.mock('../src/checkers/env.js');
vi.mock('../src/checkers/security.js');
vi.mock('../src/analysis/import-check.js');
vi.mock('../src/service/SemanticService.js');

const mockJsProvider = {
  name: 'JS',
  extensions: ['.ts', '.js'],
  check: vi.fn().mockResolvedValue([]),
  fix: vi.fn().mockResolvedValue({ messages: [] }),
};

vi.mock('../src/providers/JavascriptProvider.js', () => ({
  JavascriptProvider: vi.fn().mockImplementation(function (this: any) {
    return mockJsProvider;
  }),
}));

vi.mock('fast-glob', () => ({ default: vi.fn().mockResolvedValue(['src/test.ts']) }));
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('content'),
  existsSync: vi.fn().mockReturnValue(false),
  statSync: vi.fn().mockReturnValue({ mtimeMs: Date.now() }),
}));

describe('AnalysisService', () => {
  let stateManager: any;
  let config: any;
  let semantic: any;
  let service: AnalysisService;

  beforeEach(() => {
    stateManager = {
      getLastCoverage: vi.fn().mockReturnValue(null),
      saveCoverage: vi.fn(),
    };
    config = {
      rules: {
        maxLineCount: 500,
        maxComplexity: 15,
        minCoverage: 0,
        techDebtLimit: 20,
      },
      exclude: [],
      incremental: false,
      customRules: [],
    };
    semantic = {
      getDependents: vi.fn().mockReturnValue([]),
      ensureInitialized: vi.fn(),
    };
    service = new AnalysisService(stateManager as any, config as any, semantic as any);

    // Default mocks
    vi.mocked(fd.getDependencyMap).mockResolvedValue(new Map());
    vi.mocked(fd.findOrphanFiles).mockResolvedValue([]);
    vi.mocked(security.checkPackageAudit).mockResolvedValue([]);
    vi.mocked(importCheck.checkHallucination).mockResolvedValue([]);
    vi.mocked(importCheck.checkFakeLogic).mockResolvedValue([]);
    mockJsProvider.check.mockResolvedValue([]);
  });

  it('모든 검사를 수행하고 리포트를 생성해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    mockJsProvider.check.mockResolvedValue([]);
    vi.mocked(rg.countTechDebt).mockResolvedValue(2);

    const report = await service.runAllChecks();
    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(stateManager.saveCoverage).toHaveBeenCalled();
  });

  it('증분 분석 모드에서 변경된 파일과 역의존성 파일을 분석해야 한다', async () => {
    config.incremental = true;
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });

    // getChangedFiles 모킹
    (service as any).git = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({
        modified: ['src/changed.ts'],
        not_added: [],
        created: [],
        staged: [],
        renamed: [],
      }),
    };

    // 역의존성 모킹
    const mockDepGraph = (service as any).depGraph;
    mockDepGraph.build = vi.fn().mockResolvedValue(undefined);
    mockDepGraph.getDependents = vi.fn().mockReturnValue(['src/caller.ts']);

    const report = await service.runAllChecks();
    expect(report.pass).toBe(true);
    expect(mockDepGraph.build).toHaveBeenCalled();
  });

  it('자가 치유 결과가 리포트에 포함되어야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    mockJsProvider.fix.mockResolvedValue({ messages: ['Fixed something automatically'] });

    const report = await service.runAllChecks();
    expect(report.suggestion).toContain('[Self-Healing Result]');
    expect(report.suggestion).toContain('Fixed something automatically');
  });

  it('커버리지 하락 시 반려해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    stateManager.getLastCoverage.mockReturnValue(90);

    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().includes('coverage-summary.json')
    );
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ total: { lines: { pct: 85 } } }));

    const report = await service.runAllChecks();
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.type === 'COVERAGE')).toBe(true);
  });
});
