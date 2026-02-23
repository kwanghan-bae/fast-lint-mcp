import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import * as sg from '../src/analysis/sg.js';
import * as fd from '../src/analysis/fd.js';
import * as rg from '../src/analysis/rg.js';
import * as env from '../src/checkers/env.js';
import * as security from '../src/checkers/security.js';
import * as importCheck from '../src/analysis/import-check.js';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';

vi.mock('../src/db.js');
vi.mock('../src/config.js');
vi.mock('../src/analysis/sg.js');
vi.mock('../src/analysis/fd.js');
vi.mock('../src/analysis/rg.js');
vi.mock('../src/checkers/env.js');
vi.mock('../src/checkers/security.js');
vi.mock('../src/analysis/import-check.js');

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
        minCoverage: 0,
        techDebtLimit: 10,
      },
      exclude: [],
      incremental: false,
      customRules: [],
    };
    service = new AnalysisService(db as any, config as any);

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
    vi.mocked(fd.findOrphanFiles).mockResolvedValue([]);
    vi.mocked(rg.countTechDebt).mockResolvedValue(2);

    const report = await service.runAllChecks();

    if (!report.pass)
      console.log('DEBUG (violations):', JSON.stringify(report.violations, null, 2));

    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(db.saveSession).toHaveBeenCalled();
  });

  it('기준 위반 시 실패 리포트를 생성해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    mockJsProvider.check.mockResolvedValue([
      {
        type: 'SIZE',
        file: 'src/test.ts',
        message: 'SIZE violation',
      },
    ]);
    vi.mocked(fd.findOrphanFiles).mockResolvedValue(['src/orphan.ts']);
    vi.mocked(rg.countTechDebt).mockResolvedValue(2);

    const report = await service.runAllChecks();

    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.type === 'SIZE')).toBe(true);
    expect(report.violations.some((v) => v.type === 'ORPHAN')).toBe(true);
  });

  it('순환 참조를 탐지해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });

    // A -> B -> A 순환 참조
    const depMap = new Map();
    depMap.set('src/A.ts', ['src/B.ts']);
    depMap.set('src/B.ts', ['src/A.ts']);
    vi.mocked(fd.getDependencyMap).mockResolvedValue(depMap);

    const report = await service.runAllChecks();
    expect(report.violations.some((v) => v.message.includes('순환 참조 발견'))).toBe(true);
  });

  it('이전 세션보다 커버리지가 하락하면 거부해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    db.getLastSession.mockReturnValue({ total_coverage: 90 }); // 이전 90%

    // 실제 파일 시스템 모킹 (coverage-summary.json)
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().includes('coverage-summary.json')
    );
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ total: { lines: { pct: 85 } } })); // 현재 85%

    const report = await service.runAllChecks();
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.type === 'COVERAGE' && v.message.includes('하락'))).toBe(
      true
    );
  });

  it('기술 부채가 한도를 초과하면 위반으로 기록해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: true, missing: [] });
    vi.mocked(rg.countTechDebt).mockResolvedValue(100); // 부채 100개 (한도 10)

    const report = await service.runAllChecks();
    expect(report.violations.some((v) => v.type === 'TECH_DEBT')).toBe(true);
  });

  it('필수 도구가 없으면 즉시 실패 리포트를 반환해야 한다', async () => {
    vi.mocked(env.checkEnv).mockResolvedValue({ pass: false, missing: ['rg'] });
    const report = await service.runAllChecks();
    expect(report.pass).toBe(false);
    expect(report.violations[0].type).toBe('ENV');
  });
});
