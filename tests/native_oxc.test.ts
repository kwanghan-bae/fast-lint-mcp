import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// import { extractSymbolsOxc } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Oxc AST Parser', () => {
  const testDir = join(process.cwd(), 'temp_native_oxc');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('export 구문과 내부 정의 심볼을 정확히 추출해야 한다', () => {
    const filePath = join(testDir, 'symbols.ts');
    const code =
      'export function myFunc() {}\n' +
      'export class MyClass {}\n' +
      'export const myConst = 1;\n' +
      'function internal() {}\n';

    writeFileSync(filePath, code);

    // [PLAN]: bind extract_symbols_oxc to napi
    // const result = extractSymbolsOxc(code, filePath);
    // expect(result.length).toBe(4);
  });
});
