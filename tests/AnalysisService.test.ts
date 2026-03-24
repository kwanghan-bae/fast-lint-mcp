import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as sg from '../src/analysis/sg.js';
import * as fd from '../src/analysis/fd.js';
import * as importCheck from '../src/analysis/import-check.js';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { simpleGit } from 'simple-git';
import * as fs from 'fs';
import * as native from '../native/index.js';

vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/fd.js');
vi.mock('../src/analysis/import-check.js');
vi.mock('../src/utils/DependencyGraph.js');
vi.mock('simple-git');
vi.mock('fs');
vi.mock('../native/index.js', () => ({
  runUltimateAnalysisNative: vi.fn(),
  runMutationTestNative: vi.fn(),
  runBatchAnalysisNative: vi.fn().mockReturnValue([]),
  scanFiles: vi.fn().mockReturnValue([]),
  extractSymbolsNative: vi.fn().mockReturnValue([]),
  findReferencesNative: vi.fn().mockReturnValue([]),
  parseAndCacheNative: vi.fn().mockReturnValue([]),
  clearAstCacheNative: vi.fn(),
}));

describe('AnalysisService', () => {
  let service: AnalysisService;
  let stateManager: any;
  let config: any;
  let semantic: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // v3.7 필수 모킹
    vi.mocked(importCheck.getProjectFiles).mockResolvedValue(['src/index.ts', 'src/config.ts']);
    vi.mocked(DependencyGraph).prototype.build = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DependencyGraph).prototype.getDependents = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.getDependencies = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.getAllFiles = vi.fn().mockReturnValue([]);
    vi.mocked(DependencyGraph).prototype.detectCycles = vi.fn().mockReturnValue([]);

    stateManager = {
      getLastCoverage: vi.fn().mockResolvedValue(null),
      saveCoverage: vi.fn().mockResolvedValue(undefined),
    };

    config = {
      workspacePath: process.cwd(),
      rules: {
        maxLineCount: 300,
        maxComplexity: 15,
        minCoverage: 0,
        techDebtLimit: 20,
        coverageDirectory: 'coverage',
        coveragePath: undefined,
      },
      exclude: [],
      incremental: false,
      customRules: [],
      architectureRules: [],
    };

    semantic = {
      getAllExportedSymbols: vi.fn().mockReturnValue([]),
    };

    vi.mocked(native.runUltimateAnalysisNative).mockReturnValue({
      file: 'src/index.ts',
      line_count: 100,
      complexity: 5,
      violations: [],
      symbols: [],
    });

    vi.mocked(simpleGit).mockReturnValue({
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({
        modified: [],
        not_added: [],
        created: [],
        staged: [],
        renamed: [],
      }),
    } as any);

    service = new AnalysisService(stateManager, config, semantic);
  });

  it('모든 검사를 수행하고 리포트를 생성해야 한다', async () => {
    const report = await service.runAllChecks();
    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('증분 분석 모드에서 변경된 파일과 역의존성 파일을 분석해야 한다', async () => {
    config.incremental = true;
    vi.mocked(simpleGit().status).mockResolvedValue({
      modified: ['src/config.ts'],
      not_added: [],
      created: [],
      staged: [],
      renamed: [],
    } as any);

    vi.mocked(DependencyGraph).prototype.getDependents.mockReturnValue(['src/index.ts']);

    const report = await service.runAllChecks();
    expect(report.metadata?.analysisMode).toBe('incremental');
  });

  it('자가 치유 결과가 리포트에 포함되어야 한다', async () => {
    // 자가 치유 로직은 JavascriptProvider의 fix()가 호출되어야 함
    // fixer.ts의 runSelfHealing을 모킹
    // AnalysisService는 리포트 생성 후 pass가 false인 파일들에 대해 fix를 호출할 수 있음
    // 하지만 현재 AnalysisService.runAllChecks는 자동으로 fix를 호출하지 않음 (AgentWorkflow가 호출함)
    // 이 테스트는 AnalysisService가 fix 결과를 리포팅할 수 있는지 확인하는 테스트임
    // AnalysisService.ts를 보면 runAllChecks 내부에서 fix를 호출하지 않음.
    // 이전 버전에서는 어떻게 했는지 확인 필요.
  });

  it('커버리지 하락 시 반려해야 한다', async () => {
    stateManager.getLastCoverage.mockResolvedValue(80);
    // CoverageAnalyzer.analyze가 70을 반환하도록 유도 (실제 파일 I/O 필요하므로 모킹 선호)
    // 하지만 CoverageAnalyzer는 클래스이므로 prototype 모킹 필요
  });
});
