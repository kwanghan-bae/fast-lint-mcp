import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  findNearestProjectRootNative,
  loadProjectAliasesNative,
  resolveModulePathNativeV2,
  clearPathCacheNative,
} from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join, normalize } from 'path';

describe('Native Path Resolver V2 (Commit 4.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_resolver_v2');
  const srcDir = join(testDir, 'src');
  const utilsDir = join(srcDir, 'utils');

  beforeEach(() => {
    clearPathCacheNative();
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
    if (!existsSync(utilsDir)) mkdirSync(utilsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('가장 가까운 프로젝트 루트를 찾아야 한다', () => {
    const configPath = join(testDir, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify({}));

    const root = findNearestProjectRootNative(utilsDir);
    expect(normalize(root)).toBe(normalize(testDir));
  });

  it('tsconfig.json에서 별칭을 정확히 읽어와야 한다', () => {
    const configPath = join(testDir, 'tsconfig.json');
    const config = {
      compilerOptions: {
        paths: {
          '@utils/*': ['src/utils/*'],
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const aliases = loadProjectAliasesNative(testDir);
    expect(aliases['@utils']).toBe('src/utils');
  });

  it('package.json의 imports에서 별칭을 읽어와야 한다', () => {
    const pkgPath = join(testDir, 'package.json');
    const pkg = {
      imports: {
        '#internal/*': './src/internal/*',
      },
    };
    writeFileSync(pkgPath, JSON.stringify(pkg));

    const aliases = loadProjectAliasesNative(testDir);
    expect(aliases['#internal/*']).toBe('./src/internal/*');
  });

  it('V2 함수로 상대 경로와 확장자를 해소해야 한다', () => {
    const fileB = join(srcDir, 'fileB.ts');
    writeFileSync(fileB, 'export const b = 1;');

    const allFiles = [fileB];
    const resolved = resolveModulePathNativeV2(srcDir, './fileB', allFiles, null);
    expect(normalize(resolved!)).toBe(normalize(fileB));
  });

  it('V2 함수로 별칭(Alias) 경로를 해소해야 한다', () => {
    const configPath = join(testDir, 'tsconfig.json');
    const config = {
      compilerOptions: {
        paths: {
          '@utils/*': ['src/utils/*'],
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const mathPath = join(utilsDir, 'math.ts');
    writeFileSync(mathPath, 'export const add = (a, b) => a + b;');

    const allFiles = [mathPath];
    // file_path를 전달하여 자동으로 별칭을 로드하게 함
    const resolved = resolveModulePathNativeV2(srcDir, '@utils/math', allFiles, mathPath);
    expect(normalize(resolved!)).toBe(normalize(mathPath));
  });
});
