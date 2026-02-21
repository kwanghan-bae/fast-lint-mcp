import { describe, it, expect, vi } from 'vitest';
import { checkSecrets } from '../src/checkers/security.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('Security Checker', () => {
  it('AWS Access Key를 탐지해야 함', async () => {
    const filePath = join(process.cwd(), 'tests/temp_secret.ts');
    writeFileSync(filePath, 'const apiKey = "AKIA1234567890ABCDEF";');
    
    const violations = await checkSecrets(filePath);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('AWS Access Key');
    
    unlinkSync(filePath);
  });

  it('하드코딩된 비밀번호를 탐지해야 함', async () => {
    const filePath = join(process.cwd(), 'tests/temp_secret.ts');
    writeFileSync(filePath, 'const db_password = "very-secret-password-123";');
    
    const violations = await checkSecrets(filePath);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('하드코딩된 비밀번호');
    
    unlinkSync(filePath);
  });
});
