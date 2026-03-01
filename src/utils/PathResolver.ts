import { join, dirname, normalize, isAbsolute } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

// 세션 내 모든 탐색 결과를 보관하는 메모리 캐시 (v3.3.2 Real-Time)
const aliasCache = new Map<string, Record<string, string>>();
const rootCache = new Map<string, string>();
let fileSetCache: Set<string> | null = null;

/**
 * 프로젝트 내의 모든 파일을 Set으로 관리하여 O(1) 조회를 지원합니다.
 */
function getFileSet(allFiles: string[]): Set<string> {
  if (!fileSetCache || fileSetCache.size !== allFiles.length) {
    fileSetCache = new Set(allFiles);
  }
  return fileSetCache;
}

/**
 * 특정 파일 경로에서 상위로 올라가며 가장 가까운 프로젝트 루트를 찾습니다.
 * 메모이제이션을 통해 불필요한 디렉토리 탐색을 99% 제거합니다.
 */
export function findNearestProjectRoot(currentDir: string): string {
  if (rootCache.has(currentDir)) return rootCache.get(currentDir)!;

  let dir = currentDir;
  const pathStack: string[] = [];

  while (dir !== dirname(dir)) {
    pathStack.push(dir);
    if (existsSync(join(dir, 'tsconfig.json')) || existsSync(join(dir, 'package.json'))) {
      for (const p of pathStack) rootCache.set(p, dir);
      return dir;
    }
    dir = dirname(dir);
  }

  const res = process.cwd();
  for (const p of pathStack) rootCache.set(p, res);
  return res;
}

/**
 * 프로젝트 설정에서 경로 별칭(Path Alias) 설정을 읽어옵니다.
 */
export function loadProjectAliases(pathContext?: string): Record<string, string> {
  let workspacePath = process.cwd();
  if (pathContext) {
    try {
      // isDirectory 체크 시 발생하는 statSync 병목 방어
      workspacePath = pathContext.includes('.') ? findNearestProjectRoot(dirname(pathContext)) : pathContext;
    } catch (e) {
      workspacePath = findNearestProjectRoot(pathContext);
    }
  }

  if (aliasCache.has(workspacePath)) {
    return aliasCache.get(workspacePath)!;
  }

  const aliases: Record<string, string> = {};
  const tsConfigPath = join(workspacePath, 'tsconfig.json');
  if (existsSync(tsConfigPath)) {
    try {
      const content = readFileSync(tsConfigPath, 'utf-8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(content);
      const paths = config.compilerOptions?.paths || {};
      for (const [key, values] of Object.entries(paths)) {
        const cleanKey = key.replace(/\/\*$/, '').replace(/\/$/, '');
        const target = (values as string[])[0].replace(/\/\*$/, '').replace(/\/$/, '');
        aliases[cleanKey] = target;
      }
    } catch (e) {}
  }

  const pkgPath = join(workspacePath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const imports = pkg.imports || {};
      for (const [key, value] of Object.entries(imports)) {
        if (typeof value === 'string' && key.startsWith('#')) {
          aliases[key] = value;
        }
      }
    } catch (e) {}
  }

  aliasCache.set(workspacePath, aliases);
  return aliases;
}

/**
 * 소스 코드 내의 임포트 경로를 실제 물리 파일 경로로 변환합니다.
 */
export function resolveModulePath(
  currentDir: string,
  importPath: string,
  allFiles: string[],
  _ignoredWorkspacePath?: string,
  filePath?: string
): string | null {
  let resolvedImportPath = importPath;
  const projectRoot = filePath ? findNearestProjectRoot(dirname(filePath)) : currentDir;
  const fileSet = getFileSet(allFiles);

  const aliases = loadProjectAliases(filePath);
  for (const [alias, target] of Object.entries(aliases)) {
    if (importPath === alias || importPath.startsWith(alias + '/')) {
      resolvedImportPath = importPath === alias 
        ? target 
        : target + importPath.slice(alias.length);
      
      if (!isAbsolute(resolvedImportPath)) {
        resolvedImportPath = join(projectRoot, resolvedImportPath);
      }
      break;
    }
  }

  let cleanPath = resolvedImportPath;
  if (resolvedImportPath.endsWith('.js')) {
    cleanPath = resolvedImportPath.slice(0, -3);
  } else if (resolvedImportPath.endsWith('.jsx')) {
    cleanPath = resolvedImportPath.slice(0, -4);
  }

  const targetBase = normalize(isAbsolute(cleanPath) ? cleanPath : join(currentDir, cleanPath));
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

  for (const ext of extensions) {
    const withExt = targetBase + ext;
    if (fileSet.has(withExt)) return withExt;
  }

  const originalPath = normalize(isAbsolute(resolvedImportPath) ? resolvedImportPath : join(currentDir, resolvedImportPath));
  if (fileSet.has(originalPath)) return originalPath;

  for (const ext of extensions) {
    const withIndex = normalize(join(targetBase, 'index' + ext));
    if (fileSet.has(withIndex)) return withIndex;
  }

  return null;
}

/**
 * 모든 경로 캐시를 초기화합니다.
 */
export function clearPathCache(): void {
  aliasCache.clear();
  rootCache.clear();
  fileSetCache = null;
}
