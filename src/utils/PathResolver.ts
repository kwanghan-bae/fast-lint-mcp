import { join, dirname, normalize, isAbsolute } from 'path';
import { readFileSync, existsSync } from 'fs';

/**
 * 프로젝트 설정(tsconfig.json)에서 경로 별칭(Path Alias) 설정을 읽어옵니다.
 */
export function loadProjectAliases(workspacePath: string = process.cwd()): Record<string, string> {
  const aliases: Record<string, string> = {};

  // 1. tsconfig.json 분석
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
 * 소스 코드 내의 임포트 경로를 실제 물리 파일 경로로 변환합니다. (v2.2 Alias Support)
 */
export function resolveModulePath(
  currentDir: string,
  importPath: string,
  allFiles: string[],
  workspacePath: string = process.cwd()
): string | null {
  let resolvedImportPath = importPath;

  // 1. 별칭(Alias) 해소 시도
  const aliases = loadProjectAliases(workspacePath);
  for (const [alias, target] of Object.entries(aliases)) {
    if (importPath === alias || importPath.startsWith(alias + '/')) {
      resolvedImportPath = importPath === alias 
        ? target 
        : target + importPath.slice(alias.length);
      
      if (!isAbsolute(resolvedImportPath)) {
        resolvedImportPath = join(workspacePath, resolvedImportPath);
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
