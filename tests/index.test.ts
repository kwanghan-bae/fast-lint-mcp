import { describe, it, expect } from 'vitest';
import { formatReport } from '../src/index.js';
import chalk from 'chalk';

describe('formatReport', () => {
  it('통과된 리포트를 올바르게 포맷팅해야 한다', () => {
    const report = {
      pass: true,
      violations: [],
      suggestion: '모든 품질 기준을 통과했습니다.',
    };

    const output = formatReport(report);
    expect(output).toContain('✅');
    expect(output).toContain('PASS');
    expect(output).not.toContain('❌');
    expect(output).toContain('> 🎉 **발견된 위반 사항이 없습니다. 완벽한 코드 품질을 유지하고 있습니다!**');
    expect(output).toContain('모든 품질 기준을 통과했습니다.');
  });

  it('실패한 리포트를 테이블 형식으로 포맷팅해야 한다', () => {
    const report = {
      pass: false,
      violations: [
        { type: 'SIZE', file: 'src/test.ts', message: '너무 깁니다.' },
        { type: 'SECURITY', file: '-', message: '보안 취약점' },
      ],
      suggestion: '수정하세요.',
    };

    const output = formatReport(report);
    expect(output).toContain('❌');
    expect(output).toContain('FAIL');
    expect(output).not.toContain('✅');
    expect(output).toContain('SIZE');
    expect(output).toContain('src/test.ts');
    expect(output).toContain('너무 깁니다.');
    expect(output).toContain('보안 취약점');
    expect(output).toContain('수정하세요.');
  });
});
