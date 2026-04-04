import { describe, it, expect } from 'vitest';
import { AgentWorkflow, validateTestCommand } from '../src/agent/workflow.js';

describe('validateTestCommand — 입력 검증', () => {
  it('빈 문자열은 npm test로 기본값 처리된다', () => {
    expect(validateTestCommand('')).toBe('npm test');
    expect(validateTestCommand('   ')).toBe('npm test');
  });

  it('허용된 명령어 접두사는 통과한다', () => {
    expect(validateTestCommand('npm test')).toBe('npm test');
    expect(validateTestCommand('npx vitest run')).toBe('npx vitest run');
    expect(validateTestCommand('yarn test')).toBe('yarn test');
    expect(validateTestCommand('pnpm test')).toBe('pnpm test');
    expect(validateTestCommand('jest --coverage')).toBe('jest --coverage');
    expect(validateTestCommand('vitest run')).toBe('vitest run');
    expect(validateTestCommand('mocha')).toBe('mocha');
    expect(validateTestCommand('node --version')).toBe('node --version');
  });

  it('세미콜론(;)이 포함된 명령어는 거부된다', () => {
    expect(() => validateTestCommand('npm test; rm -rf /')).toThrow('허용되지 않은');
  });

  it('파이프(|)가 포함된 명령어는 거부된다', () => {
    expect(() => validateTestCommand('npm test | cat /etc/passwd')).toThrow('허용되지 않은');
  });

  it('백틱(`)이 포함된 명령어는 거부된다', () => {
    expect(() => validateTestCommand('npm test `whoami`')).toThrow('허용되지 않은');
  });

  it('$() 형식의 명령 치환은 거부된다', () => {
    expect(() => validateTestCommand('npm test $(cat /etc/passwd)')).toThrow('허용되지 않은');
  });

  it('앰퍼샌드(&)가 포함된 명령어는 거부된다', () => {
    expect(() => validateTestCommand('npm test & rm -rf /')).toThrow('허용되지 않은');
  });

  it('허용되지 않은 명령어 접두사는 거부된다', () => {
    expect(() => validateTestCommand('rm -rf /')).toThrow('허용되지 않은');
    expect(() => validateTestCommand('bash -c "whoami"')).toThrow('허용되지 않은');
    expect(() => validateTestCommand('sh -c "id"')).toThrow('허용되지 않은');
    expect(() => validateTestCommand('curl http://evil.com')).toThrow('허용되지 않은');
  });
});

describe('AgentWorkflow.verify — 보안 검증', () => {
  const workflow = new AgentWorkflow(process.cwd());

  it('npm test는 허용된다 (실행 성공 여부와 무관하게 검증 통과)', () => {
    // node --version은 허용된 명령어이며 즉시 성공한다
    const result = workflow.verify('node --version');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('세미콜론이 포함된 명령어는 허용되지 않은 오류를 반환한다', () => {
    const result = workflow.verify('npm test; evil-command');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('파이프가 포함된 명령어는 허용되지 않은 오류를 반환한다', () => {
    const result = workflow.verify('npm test | cat /etc/passwd');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('백틱이 포함된 명령어는 허용되지 않은 오류를 반환한다', () => {
    const result = workflow.verify('npm test `whoami`');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('$() 명령 치환은 허용되지 않은 오류를 반환한다', () => {
    const result = workflow.verify('npm test $(id)');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('허용되지 않은 접두사 명령어는 오류를 반환한다', () => {
    const result = workflow.verify('bash -c "rm -rf /"');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });
});

describe('AgentWorkflow.selfHeal — 보안 검증', () => {
  it('세미콜론이 포함된 testCommand는 즉시 실패를 반환한다', async () => {
    const workflow = new AgentWorkflow(process.cwd());
    const result = await workflow.selfHeal(
      'dummy.ts',
      async () => 'const x = 1;',
      'npm test; evil-command',
      3
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
    expect(result.iterations).toBe(0);
  });

  it('허용되지 않은 접두사 명령어는 즉시 실패를 반환한다', async () => {
    const workflow = new AgentWorkflow(process.cwd());
    const result = await workflow.selfHeal(
      'dummy.ts',
      async () => 'const x = 1;',
      'bash -c "id"',
      3
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
    expect(result.iterations).toBe(0);
  });
});
