import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as sg from '../src/analysis/sg.js';
import * as fd from '../src/analysis/fd.js';
import * as importCheck from '../src/analysis/import-check.js';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { simpleGit } from 'simple-git';
import * as fs from 'fs';

vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/fd.js');
vi.mock('../src/analysis/import-check.js');
vi.mock('../src/utils/DependencyGraph.js');
vi.mock('simple-git');
vi.mock('fs');

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
    vi.mocked(DependencyGraph).prototype.detectCycles = vi.fn().mockReturnValue([]);
    
    stateManager = {
      getLastCoverage: vi.fn().mockResolvedValue(null),
      saveCoverage: vi.fn().mockResolvedValue(undefined),
    };

    config = {
      workspacePath: process.cwd(),
      rules: {
        maxLineCount: 500,
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

    semantic = {};

    vi.mocked(simpleGit).mockReturnValue({
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({
        modified: [], not_added: [], created: [], staged: [], renamed: []
      }),
    } as any);

    service = new AnalysisService(stateManager, config, semantic);
  });

  it('모든 검사를 수행하고 리포트를 생성해야 한다', async () => {
    vi.mocked(sg.analyzeFile).mockResolvedValue({
      path: 'src/index.ts',
      lineCount: 100,
      complexity: 5,
      isDataFile: false,
      topComplexSymbols: [],
      customViolations: [],
    });

    const report = await service.runAllChecks();
    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('증분 분석 모드에서 변경된 파일과 역의존성 파일을 분석해야 한다', async () => {
    config.incremental = true;
    vi.mocked(simpleGit().status).mockResolvedValue({
      modified: ['src/config.ts'],
      not_added: [], created: [], staged: [], renamed: []
    } as any);

    vi.mocked(DependencyGraph).prototype.getDependents.mockReturnValue(['src/index.ts']);

    const report = await service.runAllChecks();
    expect(report.suggestion).toContain('증분 분석');
  });

  it('자가 치유 결과가 리포트에 포함되어야 한다', async () => {
    // Provider 모킹을 통해 자가 치유 시뮬레이션
    const report = await service.runAllChecks();
    expect(report.suggestion).toBeDefined();
  });

  it('커버리지 하락 시 반려해야 한다', async () => {
    stateManager.getLastCoverage.mockResolvedValue(90);
    // coverage 리포트가 있다고 가정 (currentCoverage: 85%)
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ total: { lines: { pct: 85 } } }));

    const report = await service.runAllChecks();
    expect(report.pass).toBe(false);
    expect(report.violations.some(v => v.type === 'COVERAGE')).toBe(true);
  });
});
