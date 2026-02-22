import { join, dirname, normalize } from 'path';

/**
 * 상대 경로를 실제 파일 시스템 상의 파일 경로로 해석합니다.
 * TypeScript ESM 환경의 .js 확장자 처리를 포함합니다.
 *
 * @param currentDir 현재 파일의 디렉토리 (src 기준)
 * @param importPath import문에 적힌 상대 경로
 * @param allFiles 프로젝트 내 모든 파일 목록 (정규화된 경로)
 */
export function resolveModulePath(
  currentDir: string,
  importPath: string,
  allFiles: string[]
): string | null {
  // TypeScript ESM 대응: .js/.jsx 확장자를 .ts/.tsx로 해석해야 함
  let cleanPath = importPath;
  if (importPath.endsWith('.js')) {
    cleanPath = importPath.slice(0, -3);
  } else if (importPath.endsWith('.jsx')) {
    cleanPath = importPath.slice(0, -4);
  }

  const targetBase = normalize(join(currentDir, cleanPath));
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  // 1. 확장자를 붙여서 시도 (TypeScript 관례)
  for (const ext of extensions) {
    const withExt = targetBase + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  // 2. 원본 경로(이미 확장자가 있거나 정적 자산인 경우)로 시도
  const originalPath = normalize(join(currentDir, importPath));
  if (allFiles.includes(originalPath)) return originalPath;

  // 3. 디렉토리 index 파일 시도
  for (const ext of extensions) {
    const withIndex = normalize(join(targetBase, 'index' + ext));
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}
