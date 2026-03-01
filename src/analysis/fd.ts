import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute } from 'path';
import glob from 'fast-glob';
import { promisify } from 'util';
import { readFile } from 'fs';
import { resolveModulePath } from '../utils/PathResolver.js';

/** 프로미스 기반 파일 읽기 헬퍼 */
const readFileAsync = promisify(readFile);

/**
 * 프로젝트 내의 미사용 파일(Orphan Files)을 탐지하기 위한 의존성 맵을 생성합니다.
 * @param workspacePath 프로젝트 루트 경로
 * @param allFiles 프로젝트 내 전체 파일 목록
 */
export async function getDependencyMap(workspacePath: string, allFiles: string[]): Promise<Map<string, string[]>> {
  const dependencyMap = new Map<string, string[]>();
  
  for (const filePath of allFiles) {
    const imports = await extractImportsFromFile(filePath, allFiles);
    dependencyMap.set(filePath, imports);
  }
  return dependencyMap;
}

/**
 * 특정 파일로부터 임포트 구문을 분석하여 의존 경로 목록을 추출합니다.
 */
async function extractImportsFromFile(filePath: string, allFiles: string[]): Promise<string[]> {
  try {
    const content = await readFileAsync(filePath, 'utf-8');
    const lang = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
    const root = parse(lang, content).root();
    const imports: string[] = [];
    const dir = dirname(filePath);

    // 주요 임포트 패턴 정의
    const importRule = {
      any: [
        { pattern: "import $A from '$B'" },
        { pattern: 'import $A from "$B"' },
        { pattern: "import { $$$ } from '$B'" },
        { pattern: 'import { $$$ } from "$B"' },
        { pattern: "import '$B'" },
        { pattern: 'import "$B"' }
      ]
    };

    root.findAll({ rule: importRule }).forEach(m => {
      const source = m.getMatch('B')?.text();
      if (source) {
        const resolved = resolveModulePath(dir, source, allFiles);
        if (resolved) imports.push(resolved);
      }
    });
    return [...new Set(imports)];
  } catch (e) {
    return [];
  }
}

/**
 * 의존성 맵을 바탕으로 프로젝트 내에서 아무 곳에서도 참조되지 않는 고립된 파일들을 찾습니다.
 * @param dependencyMap 파일별 의존 관계 맵
 * @param entryPoints 진입점 파일 목록 (예: index.ts)
 */
export async function findOrphanFiles(dependencyMap: Map<string, string[]>, entryPoints: string[] = []): Promise<string[]> {
  const visited = new Set<string>();
  const stack = [...(entryPoints || []).map(e => normalize(e))];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = dependencyMap.get(current) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) stack.push(dep);
    }
  }

  const allFiles = Array.from(dependencyMap.keys());
  return allFiles.filter(f => !visited.has(f));
}
