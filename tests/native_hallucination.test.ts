import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyHallucinationNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Hallucination Verifier (Commit 8.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_hallucination');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('존재하지 않는 심볼 호출을 정확히 식별해야 한다', () => {
    const filePath = join(testDir, 'code.ts');
    const code = 
      'function main() {\n' +
      '  validFunc();\n' +
      '  invalidFunc();\n' +
      '  Promise.resolve();\n' +
      '}\n';
    
    writeFileSync(filePath, code);

    const violations = verifyHallucinationNative(
      filePath,
      ['main', 'validFunc'], // localDefs (main 추가)
      [], // imports
      ['Promise'], // builtins
      [] // externalExports
    );

    // invalidFunc만 검출되어야 함. resolve는 prefix . 때문에 스킵됨.
    expect(violations.length).toBe(1);
    expect(violations[0].name).toBe('invalidFunc');
    expect(violations[0].line).toBe(3);
  });
});
