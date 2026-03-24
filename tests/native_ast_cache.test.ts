import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { parseAndCacheNative, clearAstCacheNative } from '../native/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// [__filename] 전역 변수는 현재 테스트 파일의 경로를 나타냅니다.
const __filename = fileURLToPath(import.meta.url);
// [__dirname] 전역 변수는 현재 테스트 파일이 포함된 디렉토리 경로를 나타냅니다.
const __dirname = path.dirname(__filename);

// [Native AST Cache] 구간은 Rust Native AST 캐시의 기본 동작과 무효화 로직을 검증합니다.
describe('Native AST Cache', () => {
  const testFile = path.join(__dirname, 'temp_cache_test.ts');

  beforeEach(() => {
    clearAstCacheNative();
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('should parse and cache symbols', () => {
    const content = 'export function hello() { return "world"; }';
    fs.writeFileSync(testFile, content);

    const start1 = Date.now();
    const symbols1 = parseAndCacheNative(testFile);
    const duration1 = Date.now() - start1;

    expect(symbols1.length).toBeGreaterThan(0);
    expect(symbols1[0].name).toBe('hello');

    const start2 = Date.now();
    const symbols2 = parseAndCacheNative(testFile);
    const duration2 = Date.now() - start2;

    expect(symbols2).toEqual(symbols1);
    // 캐시 히트로 인해 두 번째 실행이 더 빨라야 함 (또는 최소한 매우 빨라야 함)
    console.log(`First parse: ${duration1}ms, Second parse (cached): ${duration2}ms`);
  });

  it('should invalidate cache when file is modified', async () => {
    const content1 = 'export function first() {}';
    fs.writeFileSync(testFile, content1);

    const symbols1 = parseAndCacheNative(testFile);
    expect(symbols1[0].name).toBe('first');

    // mtime 변경을 위해 약간 대기 후 파일 수정
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const content2 = 'export function second() {}';
    fs.writeFileSync(testFile, content2);

    const symbols2 = parseAndCacheNative(testFile);
    expect(symbols2[0].name).toBe('second');
    expect(symbols2).not.toEqual(symbols1);
  });

  it('should clear cache manually', () => {
    const content = 'export const x = 1;';
    fs.writeFileSync(testFile, content);

    parseAndCacheNative(testFile);
    clearAstCacheNative();

    // 캐시가 비워졌으므로 다시 파싱이 발생해야 함
    const symbols = parseAndCacheNative(testFile);
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('x');
  });
});
