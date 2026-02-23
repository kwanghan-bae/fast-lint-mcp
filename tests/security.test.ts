import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkSecrets, checkPackageAudit } from '../src/checkers/security.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('Security Checker', () => {
  const testFile = join(process.cwd(), 'temp_security_test.ts');

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
    vi.clearAllMocks();
  });

  it('민감 정보를 탐지해야 한다', async () => {
    const code =
      'const awsKey = "AKIA1234567890123456";\nconst apiToken = "api_key=abcdef1234567890_secret";';
    writeFileSync(testFile, code);
    const violations = await checkSecrets(testFile);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations[0].message).toContain('AWS');
  });

  it('JWT 토큰을 탐지해야 한다', async () => {
    const code =
      'const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ";';
    writeFileSync(testFile, code);
    const violations = await checkSecrets(testFile);
    expect(violations.some((v) => v.message.includes('JWT'))).toBe(true);
  });

  it('패키지 취약점이 없으면 빈 배열을 반환해야 한다', async () => {
    vi.mocked(execSync).mockReturnValue(
      JSON.stringify({
        metadata: { vulnerabilities: { high: 0, critical: 0 } },
      })
    );
    const violations = await checkPackageAudit();
    expect(violations).toHaveLength(0);
  });

  it('패키지 취약점이 발견되면 위반 사항을 반환해야 한다 (에러 객체 케이스)', async () => {
    const error = new Error('Vulnerabilities found');
    (error as any).stdout = JSON.stringify({
      metadata: { vulnerabilities: { high: 2, critical: 1 } },
    });
    vi.mocked(execSync).mockImplementation(() => {
      throw error;
    });

    const violations = await checkPackageAudit();
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('3건');
  });
});
