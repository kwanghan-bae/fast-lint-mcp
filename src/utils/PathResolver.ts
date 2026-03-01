import { join, dirname, normalize, isAbsolute } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

/**
 * 특정 파일 경로에서 상위로 올라가며 가장 가까운 프로젝트 루트(tsconfig.json 또는 package.json 존재)를 찾습니다.
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
 * 프로젝트 설정에서 경로 별칭(Path Alias) 설정을 읽어옵니다. (v3.1 Hierarchical)
 */
export function loadProjectAliases(pathContext?: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  
  let workspacePath = process.cwd();
  if (pathContext) {
    try {
      if (existsSync(pathContext) && statSync(pathContext).isDirectory()) {
        workspacePath = pathContext;
      } else {
        workspacePath = findNearestProjectRoot(dirname(pathContext));
      }
    } catch (e) {
      // statSync 실패 시(모킹 등) 경로 문자열 기반 추측
      workspacePath = pathContext.includes('.') ? findNearestProjectRoot(dirname(pathContext)) : pathContext;
    }
  }

  // 1. tsconfig.json 분석
  const tsConfigPath = join(workspacePath, 'tsconfig.json');
// ... (rest same)
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
    } catch (e) { /* ignore parse errors */ }
  }

  // 2. package.json imports 분석
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
    } catch (e) { /* ignore */ }
  }

  return aliases;
}

/**
 * 소스 코드 내의 임포트 경로를 실제 물리 파일 경로로 변환합니다. (v3.1 Context-Aware)
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

  // 1. 별칭(Alias) 해소 시도 (해당 파일이 속한 프로젝트 컨텍스트 활용)
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

  // 2. 상대/절대 경로 정규화
  let cleanPath = resolvedImportPath;
  if (resolvedImportPath.endsWith('.js')) {
    cleanPath = resolvedImportPath.slice(0, -3);
  } else if (resolvedImportPath.endsWith('.jsx')) {
    cleanPath = resolvedImportPath.slice(0, -4);
  }

  const baseDir = isAbsolute(cleanPath) ? dirname(cleanPath) : currentDir;
  const targetBase = normalize(isAbsolute(cleanPath) ? cleanPath : join(currentDir, cleanPath));
  
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.svg'];

  // 3. 확장자 매칭 시도
  for (const ext of extensions) {
    const withExt = targetBase + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  const originalPath = normalize(isAbsolute(resolvedImportPath) ? resolvedImportPath : join(currentDir, resolvedImportPath));
  if (allFiles.includes(originalPath)) return originalPath;

  for (const ext of extensions) {
    const withIndex = normalize(join(targetBase, 'index' + ext));
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}
