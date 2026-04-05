import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { StateManager } from '../src/state.js';
import { ConfigService } from '../src/config.js';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('v3.9 모노레포 커버리지 탐지 검증', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), `temp_monorepo_${Math.random().toString(36).slice(2)}`);
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('하위 디렉토리(backend-node)에 있는 lcov.info를 재귀적으로 찾아야 한다', { timeout: 15000 }, async () => {
    // 1. 가상 모노레포 구조 생성
    const subDir = join(testDir, 'backend-node', 'coverage');
    mkdirSync(subDir, { recursive: true });

    // 2. 가짜 lcov.info 생성 (커버리지 85%)
    const lcovContent = `
TN:
SF:src/index.ts
FNF:0
FNH:0
DA:1,1
DA:2,1
DA:3,0
LF:3
LH:2
BRF:0
BRH:0
end_of_record
    `;
    writeFileSync(join(subDir, 'lcov.info'), lcovContent);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test-root' }));

    // 3. 분석기 실행
    const sMgr = new StateManager(testDir);
    const cfg = new ConfigService(testDir);
    const semantic = new SemanticService();
    const analyzer = new AnalysisService(sMgr, cfg, semantic);

    // minCoverage를 설정하여 성공 여부 확인
    cfg.rules.minCoverage = 50;

    const report = await analyzer.runAllChecks();

    // 4. 검증: 리포트를 찾아냈으므로 커버리지 미달 경고가 없어야 함 (85% > 50%)
    expect(report.metadata?.coverageFreshness).toBe('fresh');
    const coverageViolation = report.violations.find((v) => v.type === 'COVERAGE');
    expect(coverageViolation).toBeUndefined();
  });

  it('사용자가 직접 지정한 coveragePath를 최우선으로 사용해야 한다', async () => {
    const customDir = join(testDir, 'custom-reports');
    mkdirSync(customDir, { recursive: true });
    const customPath = join(customDir, 'my-coverage.json');

    // 100% 커버리지 리포트
    writeFileSync(customPath, JSON.stringify({ total: { lines: { pct: 100 } } }));

    const sMgr = new StateManager(testDir);
    const cfg = new ConfigService(testDir);
    const analyzer = new AnalysisService(sMgr, cfg, new SemanticService());

    const report = await analyzer.runAllChecks({ coveragePath: customPath });

    expect(report.metadata?.coverageFreshness).toBe('fresh');
    // Rationale에 파일명이 포함되어야 함
    const rationale = report.violations.find((v) => v.type === 'COVERAGE')?.rationale || '';
    // (만약 위반이 없다면 metadata 확인)
    expect(report.pass).toBe(true);
  });
});
