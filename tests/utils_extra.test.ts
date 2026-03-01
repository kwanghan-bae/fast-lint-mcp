import { describe, it, expect, vi } from 'vitest';
import { formatCLITable, checkStructuralIntegrity } from '../src/utils/AnalysisUtils.js';
import { QualityReport } from '../src/types/index.js';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';

describe('AnalysisUtils Extra', () => {
  it('formatCLITable: 위반 사항이 있는 경우 테이블을 생성해야 한다', () => {
    const report: QualityReport = {
      pass: false,
      violations: [
        { type: 'SIZE', file: 'test.ts', message: 'Too large' }
      ],
      suggestion: 'Split it'
    };
    const output = formatCLITable(report);
    expect(output).toContain('FAIL');
    expect(output).toContain('SIZE');
    expect(output).toContain('test.ts');
    expect(output).toContain('Suggestion');
  });

  it('formatCLITable: 위반 사항이 없는 경우 축하 메시지를 출력해야 한다', () => {
    const report: QualityReport = {
      pass: true,
      violations: [],
      suggestion: 'All good'
    };
    const output = formatCLITable(report);
    expect(output).toContain('PASS');
    expect(output).toContain('완벽합니다');
  });

  it('checkStructuralIntegrity: dg가 없는 경우 빈 배열을 반환해야 한다', () => {
    expect(checkStructuralIntegrity(undefined)).toEqual([]);
  });

  it('checkStructuralIntegrity: 순환 참조를 감지하여 위반 사항을 반환해야 한다', () => {
    const mockDg = {
      detectCycles: vi.fn().mockReturnValue([['fileA.ts', 'fileB.ts', 'fileA.ts']])
    };
    const violations = checkStructuralIntegrity(mockDg as any);
    expect(violations.length).toBe(1);
    expect(violations[0].type).toBe('ARCHITECTURE');
    expect(violations[0].message).toContain('순환 참조');
    expect(violations[0].message).toContain('fileA.ts -> fileB.ts -> fileA.ts');
  });
});
