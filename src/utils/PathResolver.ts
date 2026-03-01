import { join, dirname, normalize, isAbsolute } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

// 세션 내 설정을 보관하는 메모리 캐시 (v3.3 Hyper-Speed)
const aliasCache = new Map<string, Record<string, string>>();
let fileSetCache: Set<string> | null = null;

/**
 * 프로젝트 내의 모든 파일을 Set으로 관리하여 초고속 조회를 지원합니다.
 */
function getFileSet(allFiles: string[]): Set<string> {
  if (!fileSetCache || fileSetCache.size !== allFiles.length) {
    fileSetCache = new Set(allFiles);
  }
  return fileSetCache;
}

/**
 * 특정 파일 경로에서 상위로 올라가며 가장 가까운 프로젝트 루트를 찾습니다.
 */
export function findNearestProjectRoot(currentDir: string): string {
  let dir = currentDir;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'tsconfig.json')) || existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

/**
 * 프로젝트 설정에서 경로 별칭(Path Alias) 설정을 읽어옵니다. (v3.3 Memory Optimized)
 */
export function loadProjectAliases(pathContext?: string): Record<string, string> {
  let workspacePath = process.cwd();
  if (pathContext) {
    try {
      if (existsSync(pathContext) && statSync(pathContext).isDirectory()) {
        workspacePath = pathContext;
      } else {
        workspacePath = findNearestProjectRoot(dirname(pathContext));
      }
    } catch (e) {
      workspacePath = pathContext.includes('.') ? findNearestProjectRoot(dirname(pathContext)) : pathContext;
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
 * 소스 코드 내의 임포트 경로를 실제 물리 파일 경로로 변환합니다. (v3.3 I/O Zero)
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
 * 세션 종료 시 모든 캐시를 비웁니다.
 */
export function clearPathCache(): void {
  aliasCache.clear();
  fileSetCache = null;
}
