import glob from 'fast-glob';
import { readFile } from 'fs';
import { promisify } from 'util';
import { Lang, parse } from '@ast-grep/napi';
import { join, dirname, normalize } from 'path';
import { resolveModulePath } from '../utils/PathResolver.js';
import pMap from 'p-map';
import os from 'os';

const readFileAsync = promisify(readFile);

/**
 * 프로젝트 내의 모든 의존성 관계를 추출하여 맵(Map) 형태로 생성합니다.
 * p-map을 사용하여 비동기 병렬로 의존성 정보를 수집합니다.
 * @param workspacePath 프로젝트 루트 경로
 * @returns 파일 경로를 키로 하고, 해당 파일이 임포트하는 대상 목록을 값으로 하는 Map
 */
export async function getDependencyMap(
  workspacePath: string = process.cwd()
): Promise<Map<string, string[]>> {
  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map((f) => normalize(f));

  const depMap = new Map<string, string[]>();
  const concurrency = Math.max(1, os.cpus().length - 1);

  await pMap(allFiles, async (filePath) => {
    try {
      const fullPath = join(workspacePath, filePath);
      const content = await readFileAsync(fullPath, 'utf-8');
      const lang =
        filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;

      const ast = parse(lang, content);
      const root = ast.root();
      const deps: string[] = [];

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
              if (resolved) deps.push(normalize(resolved));
            }
          }
        } catch (e) {}
      }
      depMap.set(filePath, [...new Set(deps)]);
    } catch (e) {}
  }, { concurrency });

  return depMap;
}

/**
 * 프로젝트 내의 어떤 파일에서도 참조되지 않는 '고아 파일(Orphan Files)'을 찾아냅니다.
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
    if (depMap.has(entry)) referenced.add(entry);
  }

  const orphans: string[] = [];
  for (const file of depMap.keys()) {
    if (!referenced.has(file)) orphans.push(file);
  }
  return orphans;
}
