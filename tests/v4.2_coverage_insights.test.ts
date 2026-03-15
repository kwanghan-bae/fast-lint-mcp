import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { StateManager } from '../src/state.js';
import { ConfigService } from '../src/config.js';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('v4.2 커버리지 인사이트 및 상시 노출 검증', () => {
  const testDir = join(process.cwd(), 'temp_v42_verify');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('PASS 케이스에서도 커버리지 수치가 메타데이터에 포함되고 Top 3 취약 파일이 노출되어야 한다', async () => {
    // 1. 가짜 lcov.info 생성 (전체 커버리지는 90%로 PASS 기준 충족)
    const lcovContent = [
      'SF:src/perfect.ts',
      'LF:10',
      'LH:10',
      'end_of_record',
      'SF:src/weak1.ts',
      'LF:10',
      'LH:5',
      'end_of_record',
      'SF:src/weak2.ts',
      'LF:10',
      'LH:6',
      'end_of_record',
      'SF:src/weak3.ts',
      'LF:10',
      'LH:7',
      'end_of_record',
    ].join('\n');

    const covDir = join(testDir, 'coverage');
    mkdirSync(covDir);
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);

    // 파일 생성
    writeFileSync(join(srcDir, 'perfect.ts'), '//');
    writeFileSync(join(srcDir, 'weak1.ts'), '//');
    writeFileSync(join(srcDir, 'weak2.ts'), '//');
    writeFileSync(join(srcDir, 'weak3.ts'), '//');

    writeFileSync(join(covDir, 'lcov.info'), lcovContent);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const sMgr = new StateManager(testDir);
    const cfg = new ConfigService(testDir);
    cfg.rules.minCoverage = 50; // 기준 50% (충족)

    const analyzer = new AnalysisService(sMgr, cfg, new SemanticService());
    const report = await analyzer.runAllChecks();

    // 2. 검증
    expect(report.pass).toBe(true);
    // 메타데이터에 수치가 있어야 함
    expect(report.metadata?.coveragePercentage).toBeDefined();
    expect(report.metadata?.coveragePercentage).toBeGreaterThan(50);

    // Suggestion에 Top 3 인사이트가 포함되어야 함
    expect(report.suggestion).toContain('Coverage Insights');
    expect(report.suggestion).toContain('weak1.ts');
    expect(report.suggestion).toContain('weak2.ts');
    expect(report.suggestion).toContain('weak3.ts');
    // perfect.ts는 Top 3가 아니므로(커버리지 높음) 포함되지 않아야 함 (선택적 검증)
  });
});
