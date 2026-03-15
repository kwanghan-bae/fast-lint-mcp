import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractSymbolsNative, findReferencesNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Symbol & Reference Engine (Commit 5.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_symbol');

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

    const result = extractSymbolsNative(filePath);
    expect(result.length).toBe(4);
  });

  it('전체 파일에서 특정 심볼의 참조를 정확히 찾아야 한다', () => {
    const fileA = join(testDir, 'fileA.ts');
    const fileB = join(testDir, 'fileB.ts');
    
    writeFileSync(fileA, 'export function target() {}');
    writeFileSync(fileB, 'import { target } from "./fileA";\n target();\n console.log(target);');

    const refs = findReferencesNative('target', [fileA, fileB]);
    
    // fileB에서 3번 참조됨 (import 포함)
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.every(r => r.file === fileB)).toBe(true);
  });
});
