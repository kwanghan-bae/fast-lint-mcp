import { describe, it, expect, vi } from 'vitest';
import { checkEnv } from '../src/checkers/env.js';
import { execa } from 'execa';

vi.mock('execa');

describe('Environment Checker', () => {
  it('모든 도구가 설치되어 있으면 성공을 반환해야 한다', async () => {
    vi.mocked(execa).mockResolvedValue({ stdout: '/usr/local/bin/fd' } as any);
    
    const result = await checkEnv();
    expect(result.pass).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('누락된 도구가 있으면 에러 메시지와 함께 실패를 반환해야 한다', async () => {
    // fd와 rg는 성공, sg(ast-grep)는 실패하는 상황 시뮬레이션
    vi.mocked(execa).mockImplementation(async (cmd: any, args?: any[]) => {
      const bin = args?.[0];
      if (bin === 'sg') throw new Error('not found');
      return { stdout: `/usr/local/bin/${bin}` } as any;
    });

    const result = await checkEnv();
    expect(result.pass).toBe(false);
    expect(result.missing).toContain('ast-grep (sg)');
    expect(result.suggestion).toContain('brew install ast-grep');
  });
});
