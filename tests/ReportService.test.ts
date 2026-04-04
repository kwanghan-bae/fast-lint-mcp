import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../native/index.js', () => ({}));

const makeCov = (currentCoverage = 80, extra: Record<string, unknown> = {}) => ({
  currentCoverage,
  coverageFreshness: 'fresh' as const,
  coverageLastUpdated: '2026-04-05T00:00:00.000Z',
  coverageInsight: null as string | null,
  ...extra,
});

describe('ReportService', () => {
  let ReportService: any;
  let stateManager: { getLastCoverage: ReturnType<typeof vi.fn>; saveCoverage: ReturnType<typeof vi.fn> };
  let semantic: { getSymbolMetrics: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    stateManager = {
      getLastCoverage: vi.fn().mockResolvedValue(null),
      saveCoverage: vi.fn().mockResolvedValue(undefined),
    };
    semantic = {
      getSymbolMetrics: vi.fn().mockReturnValue([]),
    };
    const mod = await import('../src/service/ReportService.js');
    ReportService = mod.ReportService;
  });

  // assemble(violations, cov, healingMessages, files, isIncremental)

  it('위반 없을 때 pass: true를 반환해야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(90), [], ['a.ts'], false);
    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('위반 있을 때 pass: false를 반환해야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const v = { type: 'SIZE', file: 'big.ts', message: 'Too big' };
    const report = await svc.assemble([v], makeCov(90), [], ['big.ts'], false);
    expect(report.pass).toBe(false);
  });

  it('중복 위반을 제거해야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const dup = { type: 'SIZE', file: 'a.ts', line: 1, message: '크기 초과' };
    const report = await svc.assemble([dup, { ...dup }, { ...dup }], makeCov(90), [], ['a.ts'], false);
    expect(report.violations.filter((v: any) => v.type === 'SIZE')).toHaveLength(1);
  });

  it('서로 다른 파일의 위반은 각각 유지되어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const violations = [
      { type: 'SIZE', file: 'a.ts', line: 1, message: '크기 초과' },
      { type: 'SIZE', file: 'b.ts', line: 1, message: '크기 초과' },
    ];
    const report = await svc.assemble(violations, makeCov(90), [], ['a.ts', 'b.ts'], false);
    expect(report.violations.filter((v: any) => v.type === 'SIZE')).toHaveLength(2);
  });

  it('커버리지 하락 시 COVERAGE 위반을 추가해야 한다', async () => {
    stateManager.getLastCoverage.mockResolvedValue(95);
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(80), [], ['a.ts'], false);
    expect(report.pass).toBe(false);
    const covV = report.violations.find((v: any) => v.type === 'COVERAGE');
    expect(covV).toBeDefined();
    expect(covV.message).toContain('하락');
  });

  it('커버리지 유지/상승 시 COVERAGE 위반이 없어야 한다', async () => {
    stateManager.getLastCoverage.mockResolvedValue(80);
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(90), [], ['a.ts'], false);
    expect(report.pass).toBe(true);
  });

  it('이전 커버리지가 없으면 회귀로 판단하지 않아야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(50), [], ['a.ts'], false);
    expect(report.pass).toBe(true);
  });

  it('metadata에 올바른 필드가 포함되어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(85), [], ['a.ts', 'b.ts'], false);
    expect(report.metadata.analysisMode).toBe('full');
    expect(report.metadata.filesAnalyzed).toBe(2);
    expect(report.metadata.coverageFreshness).toBe('fresh');
    expect(report.metadata.coveragePercentage).toBe(85);
    expect(typeof report.metadata.version).toBe('string');
  });

  it('incremental 모드에서 analysisMode가 incremental이어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(80), [], ['a.ts'], true);
    expect(report.metadata.analysisMode).toBe('incremental');
  });

  it('healingMessages가 suggestion에 포함되어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const report = await svc.assemble([], makeCov(80), ['Fixed: comment added'], ['a.ts'], false);
    expect(report.suggestion).toContain('Self-Healing');
    expect(report.suggestion).toContain('Fixed: comment added');
  });

  it('stale 커버리지일 때 에이전트 팁이 포함되어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    const cov = makeCov(80, { coverageFreshness: 'stale' });
    const report = await svc.assemble([], cov, [], ['a.ts'], false);
    expect(report.suggestion).toContain('에이전트 팁');
  });

  it('saveCoverage가 호출되어야 한다', async () => {
    const svc = new ReportService(semantic, stateManager, '/test');
    await svc.assemble([], makeCov(75), [], ['a.ts'], false);
    expect(stateManager.saveCoverage).toHaveBeenCalledWith(75);
  });
});
