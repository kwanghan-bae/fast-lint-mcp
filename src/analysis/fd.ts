import { existsSync } from 'fs';
import { dirname, normalize } from 'path';
import { resolveModulePath } from '../utils/PathResolver.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 프로젝트 내의 미사용 파일(Orphan Files)을 탐지하기 위한 의존성 맵을 생성합니다.
 */
export async function getDependencyMap(
  workspacePath: string,
  allFiles: string[]
): Promise<Map<string, string[]>> {
  const dependencyMap = new Map<string, string[]>();
  if (!allFiles || allFiles.length === 0) return dependencyMap;

  // ⚡ Bolt: Using Promise.all for parallel extraction instead of sequential for...of
  const promises = allFiles.map(async (filePath) => {
    const imports = await extractImportsFromFile(filePath, allFiles);
    return { filePath, imports };
  });

  const results = await Promise.all(promises);
  for (const { filePath, imports } of results) {
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
    // ⚡ Bolt: Using AstCacheManager instead of manual readFile and parse to avoid O(N) I/O and parsing overhead
    const root = AstCacheManager.getInstance().getRootNode(filePath);
    if (!root) return [];

    const imports: string[] = [];
    const dir = dirname(filePath);

    // ⚡ Bolt: Using direct AST node kind matching instead of multiple string patterns for much faster execution
    const importRule = { kind: 'import_statement' };

    root.findAll({ rule: importRule }).forEach((m) => {
      const sourceNode = m.find({ rule: { kind: 'string' } });
      const sourceText = sourceNode?.text();

      if (sourceText) {
        // Strip quotes
        const source = sourceText.slice(1, -1);
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
