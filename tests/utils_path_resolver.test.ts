import { describe, it, expect } from 'vitest';
import { resolveModulePath } from '../src/utils/PathResolver.js';
import { normalize } from 'path';

describe('resolveModulePath', () => {
  const allFiles = [
    normalize('src/index.ts'),
    normalize('src/utils/PathResolver.ts'),
    normalize('src/analysis/sg.ts'),
    normalize('src/components/Button.tsx'),
    normalize('src/styles/main.css'),
    normalize('src/api/index.js'),
  ];

  it('.js 확장자를 .ts로 해석해야 한다 (TypeScript ESM)', () => {
    const currentDir = normalize('src');
    const importPath = './utils/PathResolver.js';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBe(normalize('src/utils/PathResolver.ts'));
  });

  it('.jsx 확장자를 .tsx로 해석해야 한다', () => {
    const currentDir = normalize('src');
    const importPath = './components/Button.jsx';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBe(normalize('src/components/Button.tsx'));
  });

  it('확장자가 없는 경우 여러 확장자를 시도해야 한다', () => {
    const currentDir = normalize('src');
    const importPath = './analysis/sg';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBe(normalize('src/analysis/sg.ts'));
  });

  it('디렉토리 index 파일을 찾아야 한다', () => {
    const currentDir = normalize('src');
    const importPath = './api';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBe(normalize('src/api/index.js'));
  });

  it('원본 경로가 존재하면 그대로 반환해야 한다 (정적 자산 등)', () => {
    const currentDir = normalize('src');
    const importPath = './styles/main.css';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBe(normalize('src/styles/main.css'));
  });

  it('찾을 수 없는 경로는 null을 반환해야 한다', () => {
    const currentDir = normalize('src');
    const importPath = './non-existent';
    const resolved = resolveModulePath(currentDir, importPath, allFiles);
    expect(resolved).toBeNull();
  });
});
