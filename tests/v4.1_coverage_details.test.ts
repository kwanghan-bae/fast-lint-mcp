import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { StateManager } from '../src/state.js';
import { ConfigService } from '../src/config.js';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('v4.1 커버리지 상세 분석 검증', () => {
  const testDir = join(process.cwd(), 'temp_v41_verify');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('커버리지 미달 시 Rationale에 현재 수치와 취약 파일 목록이 포함되어야 한다', async () => {
    // 1. 가짜 lcov.info 생성 (들여쓰기 없는 표준 형식)
    const lcovContent = [
      'TN:',
      'SF:src/good.ts',
      'LF:10',
      'LH:10',
      'end_of_record',
      'TN:',
      'SF:src/bad.ts',
      'LF:10',
      'LH:2',
      'end_of_record'
    ].join('\n');
    // 전체 커버리지: (12 / 20) * 100 = 60%
    
    const covDir = join(testDir, 'coverage');
    mkdirSync(covDir);
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    
    // 실제 파일 생성 (매핑을 위해 필요)
    writeFileSync(join(srcDir, 'good.ts'), '// good');
    writeFileSync(join(srcDir, 'bad.ts'), '// bad');

    writeFileSync(join(covDir, 'lcov.info'), lcovContent);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const sMgr = new StateManager(testDir);
    const cfg = new ConfigService(testDir);
    cfg.rules.minCoverage = 80; // 기준 80%

    const analyzer = new AnalysisService(sMgr, cfg, new SemanticService());
    const report = await analyzer.runAllChecks();

    // 2. 검증
    const violation = report.violations.find(v => v.type === 'COVERAGE');
    expect(violation).toBeDefined();
    // 현재 60%가 rationale에 있어야 함
    expect(violation?.rationale).toContain('60.0%');
    // 기준 80%가 rationale에 있어야 함
    expect(violation?.rationale).toContain('80%');
    // 취약 파일인 bad.ts(20.0%)가 포함되어야 함
    expect(violation?.rationale).toContain('bad.ts(20.0%)');
  });
});
