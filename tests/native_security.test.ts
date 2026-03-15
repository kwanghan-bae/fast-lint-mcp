import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanSecretsNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Secret Scanner (Commit 11.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_security');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('다양한 보안 위반 패턴을 정확히 검출해야 한다', () => {
    const file1 = join(testDir, 'aws.ts');
    const file2 = join(testDir, 'token.js');

    writeFileSync(file1, 'const key = "AKIA1234567890ABCDEF";');
    writeFileSync(
      file2,
      'const secret = "password: \\"super-secret-token-1234567\\"";\nconst jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";'
    );

    const violations = scanSecretsNative([file1, file2]);
    console.log('Detected violations:', violations);

    // Expect at least 3
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.message.includes('AWS'))).toBe(true);
    expect(violations.some((v) => v.message.includes('비밀번호'))).toBe(true);
    expect(violations.some((v) => v.message.includes('JWT'))).toBe(true);
  });
});
