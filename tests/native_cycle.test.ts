import { describe, it, expect } from 'vitest';
import { detectCyclesNative } from '../native/index.js';

describe('Native Cycle Detection (Commit 7.1)', () => {
  it('A -> B -> A 순환 참조를 정확히 탐지해야 한다', () => {
    const importMap = {
      'fileA.ts': ['fileB.ts'],
      'fileB.ts': ['fileA.ts'],
    };
    const cycles = detectCyclesNative(importMap);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('fileA.ts');
    expect(cycles[0]).toContain('fileB.ts');
  });

  it('A -> B -> C -> A 다중 노드 순환 참조를 정확히 탐지해야 한다', () => {
    const importMap = {
      'fileA.ts': ['fileB.ts'],
      'fileB.ts': ['fileC.ts'],
      'fileC.ts': ['fileA.ts'],
    };
    const cycles = detectCyclesNative(importMap);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('fileA.ts');
    expect(cycles[0]).toContain('fileB.ts');
    expect(cycles[0]).toContain('fileC.ts');
  });

  it('순환이 없는 경우 빈 배열을 반환해야 한다', () => {
    const importMap = {
      'fileA.ts': ['fileB.ts'],
      'fileB.ts': ['fileC.ts'],
      'fileC.ts': [],
    };
    const cycles = detectCyclesNative(importMap);
    expect(cycles).toEqual([]);
  });

  it('자기 자신을 참조하는 경우(Self-loop)를 탐지해야 한다', () => {
    const importMap = {
      'fileA.ts': ['fileA.ts'],
    };
    const cycles = detectCyclesNative(importMap);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['fileA.ts']);
  });
});
