import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { checkSecrets, checkPackageAudit } from '../src/checkers/security.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

vi.mock('child_process');

describe('Security Checker', () => {
  const testFile = join(process.cwd(), 'temp_security.ts');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
    vi.clearAllMocks();
  });

  it('민감 정보를 탐지해야 한다', async () => {
    // 변수명 필터(color, id 등)에 걸리지 않는 이름 사용
    const code =
      "const myKey = 'AKIA1234567890ABCDEF';\nconst rawSecret = 'auth: \"QXpXclM0dFBlTTVuRjhLMnYxSmI2R2g5TmszWFF5RDc\"';";
    writeFileSync(testFile, code);
    const violations = await checkSecrets(testFile);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.some(v => v.message.includes('AWS'))).toBe(true);
  });

  it('JWT 토큰을 탐지해야 한다', async () => {
    const code = 'const val = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";';
    writeFileSync(testFile, code);
    const violations = await checkSecrets(testFile);
    expect(violations.some((v) => v.message.includes('JWT'))).toBe(true);
  });

  it('패키지 취약점이 없으면 빈 배열을 반환해야 한다', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }));
    const violations = await checkPackageAudit();
    expect(violations).toHaveLength(0);
  });

  it('패키지 취약점이 발견되면 위반 사항을 반환해야 한다 (에러 객체 케이스)', async () => {
    const error = new Error('audit failed');
    (error as any).stdout = JSON.stringify({ 
      metadata: { vulnerabilities: { high: 2, critical: 1 } } 
    });
    vi.mocked(execSync).mockImplementation(() => {
      throw error;
    });

    const violations = await checkPackageAudit();
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('3건');
  });
});
