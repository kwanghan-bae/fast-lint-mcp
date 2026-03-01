import { readFileSync, existsSync, readFile } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute } from 'path';
import { promisify } from 'util';
import { resolveModulePath } from '../utils/PathResolver.js';

/** 프로미스 기반 파일 읽기 헬퍼 */
const readFileAsync = promisify(readFile);

/**
 * 프로젝트 내의 미사용 파일(Orphan Files)을 탐지하기 위한 의존성 맵을 생성합니다.
 */
export async function getDependencyMap(
  workspacePath: string,
  allFiles: string[]
): Promise<Map<string, string[]>> {
  const dependencyMap = new Map<string, string[]>();
  if (!allFiles || allFiles.length === 0) return dependencyMap;

  for (const filePath of allFiles) {
    const imports = await extractImportsFromFile(filePath, allFiles);
    dependencyMap.set(filePath, imports);
  }
  return dependencyMap;
}

/**
 * 파일 내 임포트 구문을 분석하여 실제 물리 경로 목록을 추출합니다.
 */
async function extractImportsFromFile(filePath: string, allFiles: string[]): Promise<string[]> {
  try {
    if (!existsSync(filePath)) return [];
    const content = await readFileAsync(filePath, 'utf-8');
    const lang =
      filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
    const root = parse(lang, content).root();
    const imports: string[] = [];
    const dir = dirname(filePath);

    const importRule = {
      any: [
        { pattern: "import $A from '$B'" },
        { pattern: 'import $A from "$B"' },
        { pattern: "import { $$$ } from '$B'" },
        { pattern: 'import { $$$ } from "$B"' },
        { pattern: "import '$B'" },
        { pattern: 'import "$B"' },
      ],
    };

    root.findAll({ rule: importRule }).forEach((m) => {
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
 * 진입점 파일들을 기준으로 연결되지 않은 고립된 파일들을 찾습니다.
 */
export async function findOrphanFiles(
  dependencyMap: Map<string, string[]> = new Map(),
  entryPoints: string[] = []
): Promise<string[]> {
  // v3.7.5: dependencyMap 부재 시 안전하게 조기 리턴
  if (!dependencyMap || dependencyMap.size === 0) return [];

  const visited = new Set<string>();
  const validEntryPoints = (entryPoints || []).map((e) => normalize(e));
  const stack = [...validEntryPoints];

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
  return allFiles.filter((f) => !visited.has(f));
}
