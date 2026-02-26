import glob from 'fast-glob';
import { readFileSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { join, dirname, normalize } from 'path';
import { resolveModulePath } from '../utils/PathResolver.js';

/**
 * 프로젝트 내의 모든 의존성 맵을 생성합니다.
 */
export async function getDependencyMap(
  workspacePath: string = process.cwd()
): Promise<Map<string, string[]>> {
  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map((f) => normalize(f));

  const depMap = new Map<string, string[]>();

  for (const filePath of allFiles) {
    const fullPath = join(workspacePath, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    const lang =
      filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;

    const ast = parse(lang, content);
    const root = ast.root();
    const deps: string[] = [];

    // 고도화된 ast-grep 패턴 (Wildcard 활용)
    const patterns = [
      "import $CLAUSE from '$SOURCE'",
      "import { $$$ } from '$SOURCE'",
      "import * as $NS from '$SOURCE'",
      "import '$SOURCE'",
      "export $$$ARGS from '$SOURCE'",
      "export { $$$ } from '$SOURCE'",
      'import($SOURCE)',
      'require($SOURCE)',
    ];

    for (const pattern of patterns) {
      try {
        const matches = root.findAll(pattern);
        for (const match of matches) {
          let importPath = match.getMatch('SOURCE')?.text();

          if (importPath) {
            importPath = importPath.replace(/^['"]|['"]$/g, '').trim();
          }

          if (importPath && importPath.startsWith('.')) {
            const resolved = resolveModulePath(dirname(filePath), importPath, allFiles);
            if (resolved) {
              deps.push(normalize(resolved));
            }
          }
        }
      } catch (e) {
        // Skip invalid patterns
      }
    }

    depMap.set(filePath, [...new Set(deps)]);
  }

  return depMap;
}

/**
 * 어떤 파일에서도 참조되지 않는 고아 파일을 찾습니다.
 */
export async function findOrphanFiles(workspacePath: string = process.cwd()): Promise<string[]> {
  const depMap = await getDependencyMap(workspacePath);
  const referenced = new Set<string>();

  for (const deps of depMap.values()) {
    for (const dep of deps) {
      referenced.add(dep);
    }
  }

  const entryPoints = [
    normalize('src/index.ts'),
    normalize('src/index.js'),
    normalize('src/main.ts'),
    normalize('src/main.js'),
  ];

  for (const entry of entryPoints) {
    if (depMap.has(entry)) {
      referenced.add(entry);
    }
  }

  const orphans: string[] = [];
  for (const file of depMap.keys()) {
    if (!referenced.has(file)) {
      orphans.push(file);
    }
  }

  return orphans;
}
