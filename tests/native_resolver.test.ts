import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseTsconfigPaths, resolveModulePathNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join, normalize } from 'path';

describe('Native TSConfig & Path Resolver (Commit 4.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_resolver');
  const srcDir = join(testDir, 'src');
  const utilsDir = join(srcDir, 'utils');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
    if (!existsSync(utilsDir)) mkdirSync(utilsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('tsconfig.json의 paths와 baseUrl을 정확히 파싱해야 한다', () => {
    const configPath = join(testDir, 'tsconfig.json');
    const config = {
      compilerOptions: {
        baseUrl: './src',
        paths: {
          '@/*': ['*'],
          '@utils/*': ['utils/*']
        }
      }
    };
    
    writeFileSync(configPath, JSON.stringify(config));

    const result = parseTsconfigPaths(configPath);
    expect(result).toBeDefined();
    expect(result?.baseUrl).toBe('./src');
    expect(result?.paths['@/*']).toEqual(['*']);
  });

  it('상대 경로와 확장자 생략을 올바르게 해소해야 한다', () => {
    const fileA = join(srcDir, 'fileA.ts');
    const fileB = join(srcDir, 'fileB.ts');
    writeFileSync(fileB, 'export const b = 1;');

    const resolved = resolveModulePathNative(srcDir, './fileB', testDir, null, null);
    expect(normalize(resolved!)).toBe(normalize(fileB));
  });

  it('index.ts 디렉토리 임포트를 올바르게 해소해야 한다', () => {
    const indexPath = join(utilsDir, 'index.ts');
    writeFileSync(indexPath, 'export const utils = 1;');

    const resolved = resolveModulePathNative(srcDir, './utils', testDir, null, null);
    expect(normalize(resolved!)).toBe(normalize(indexPath));
  });

  it('Alias(paths) 임포트를 올바르게 해소해야 한다', () => {
    const mathPath = join(utilsDir, 'math.ts');
    writeFileSync(mathPath, 'export const add = (a, b) => a + b;');

    const paths = { '@utils/*': ['utils/*'] };
    const baseUrl = './src';

    const resolved = resolveModulePathNative(srcDir, '@utils/math', testDir, baseUrl, paths);
    expect(normalize(resolved!)).toBe(normalize(mathPath));
  });
});
