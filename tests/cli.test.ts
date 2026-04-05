import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const CLI = join(ROOT, 'src/cli.ts');

// runCLI 함수는 내부 로직을 처리합니다.
function runCLI(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI} ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 15000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI flags', () => {
  it('--help outputs usage information', () => {
    const { stdout, exitCode } = runCLI('--help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('fast-lint-mcp');
    expect(stdout).toContain('--help');
    expect(stdout).toContain('--version');
  });

  it('-h outputs usage information', () => {
    const { stdout, exitCode } = runCLI('-h');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('fast-lint-mcp');
  });

  it('--version outputs a version number', () => {
    const { stdout, exitCode } = runCLI('--version');
    expect(exitCode).toBe(0);
    // VERSION is formatted as v<semver>, e.g. v0.0.1
    expect(stdout.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('-v outputs a version number', () => {
    const { stdout, exitCode } = runCLI('-v');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
