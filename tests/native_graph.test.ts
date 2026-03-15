import { describe, it, expect } from 'vitest';
import { getDependentsNative } from '../native/index.js';

describe('Native Dependency Graph (Commit 3.2)', () => {
  it('타겟 파일을 참조하는 역의존성 리스트를 정확히 반환해야 한다', () => {
    // 의존성 구조:
    // A -> B
    // C -> B
    // B -> D
    const importMap = {
      'fileA.ts': ['fileB.ts'],
      'fileB.ts': ['fileD.ts'],
      'fileC.ts': ['fileB.ts'],
      'fileD.ts': [],
    };

    // fileB.ts를 참조하는 파일은 fileA.ts와 fileC.ts여야 함
    const dependents = getDependentsNative('fileB.ts', importMap);

    expect(dependents.length).toBe(2);
    expect(dependents).toContain('fileA.ts');
    expect(dependents).toContain('fileC.ts');
  });

  it('참조하는 파일이 없으면 빈 배열을 반환해야 한다', () => {
    const importMap = {
      'fileA.ts': ['fileB.ts'],
      'fileB.ts': [],
    };

    const dependents = getDependentsNative('fileA.ts', importMap);
    expect(dependents).toEqual([]);
  });
});
