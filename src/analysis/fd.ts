import { existsSync } from 'fs';
import { dirname, normalize } from 'path';
import { resolveModulePath } from '../utils/PathResolver.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 프로젝트 내의 미사용 파일(Orphan Files)을 탐지하기 위한 의존성 맵을 생성합니다.
 * ⚡ Bolt: Optimized by avoiding redundant parsing via AstCacheManager and simplified AST matching.
 */
export async function getDependencyMap(
  workspacePath: string,
  allFiles: string[]
): Promise<Map<string, string[]>> {
  const dependencyMap = new Map<string, string[]>();
  if (!allFiles || allFiles.length === 0) return dependencyMap;

  // ⚡ Bolt: Kept sequential for...of loop because AstCacheManager.getRootNode is synchronous
  // and wrapping it in Promises (e.g. pMap) introduces unnecessary microtask overhead.
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

    // ⚡ Bolt: Used AstCacheManager instead of manual readFile and parse
    const root = AstCacheManager.getInstance().getRootNode(filePath);
    if (!root) return [];

    const imports: string[] = [];
    const dir = dirname(filePath);

    // ⚡ Bolt: Direct AST kind matching instead of complex string patterns
    root.findAll({ rule: { kind: 'import_statement' } }).forEach((m) => {
      let source = m.field('source')?.text();
      if (source) {
        // Strip quotes
        source = source.slice(1, -1);
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
