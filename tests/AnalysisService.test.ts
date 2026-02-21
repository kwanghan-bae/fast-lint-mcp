import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as sg from '../src/analysis/sg.js';
import * as fd from '../src/analysis/fd.js';
import * as rg from '../src/analysis/rg.js';
import * as env from '../src/checkers/env.js';

vi.mock('../src/db.js');
vi.mock('../src/config.js');
vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/fd.js');
vi.mock('../src/analysis/rg.js');
vi.mock('../src/checkers/env.js');
vi.mock('fast-glob', () => ({ default: vi.fn().mockResolvedValue(['src/test.ts']) }));
vi.mock('fs', () => ({ readFileSync: vi.fn().mockReturnValue('content'), existsSync: vi.fn().mockReturnValue(false) }));

describe('AnalysisService', () => {
  let db: any;
  let config: any;
  let service: AnalysisService;

  beforeEach(() => {
    db = {
      getFileMetric: vi.fn().mockReturnValue(null),
      updateFileMetric: vi.fn(),
      getLastSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
    };
    config = {
      rules: {
        maxLineCount: 300,
        maxComplexity: 15,
        minCoverage: 80,
        techDebtLimit: 10,
      },
      incremental: false,
      customRules: [],
    };
    service = new AnalysisService(db as any, config as any);
    
    // Default mocks
    vi.mocked(fd.getDependencyMap).mockResolvedValue(new Map());
  });

  it('모든 검사를 수행하고 리포트를 생성해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    vi.mocked(sg.analyzeFile).mockResolvedValue({ path: 'src/test.ts', lineCount: 100, complexity: 5, customViolations: [] });
    vi.mocked(fd.findOrphanFiles).mockResolvedValue([]);
    vi.mocked(rg.countTechDebt).mockResolvedValue(2);

    const report = await service.runAllChecks();

    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(db.saveSession).toHaveBeenCalled();
  });

  it('기준 위반 시 실패 리포트를 생성해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    vi.mocked(sg.analyzeFile).mockResolvedValue({ path: 'src/test.ts', lineCount: 400, complexity: 5, customViolations: [] }); // 300줄 초과
    vi.mocked(fd.findOrphanFiles).mockResolvedValue(['src/orphan.ts']);
    vi.mocked(rg.countTechDebt).mockResolvedValue(2);

    const report = await service.runAllChecks();

    expect(report.pass).toBe(false);
    expect(report.violations.some(v => v.type === 'SIZE')).toBe(true);
    expect(report.violations.some(v => v.type === 'ORPHAN')).toBe(true);
  });
});
