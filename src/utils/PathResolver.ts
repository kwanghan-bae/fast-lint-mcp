import { join, dirname, normalize } from 'path';

/**
 * 소스 코드 내의 상대 임포트 경로(예: './MyModule.js')를 프로젝트 내 실제 물리 파일 경로로 변환합니다.
 * TypeScript ESM 환경에서는 소스에서 .js를 쓰더라도 실제로는 .ts 파일을 가리키는 관례가 있으므로 이를 처리합니다.
 *
 * @param currentDir 현재 분석 중인 파일의 디렉토리 경로
 * @param importPath import 구문에 명시된 상대 또는 절대 경로
 * @param allFiles 프로젝트 내에 존재하는 모든 파일의 정규화된 경로 목록
 * @returns 해소된 실제 파일 경로, 찾지 못한 경우 null
 */
export function resolveModulePath(
  currentDir: string,
  importPath: string,
  allFiles: string[]
): string | null {
  // 1. TypeScript ESM 대응: .js/.jsx 확장자를 제거하여 베이스 경로 확보
  // 실제 파일은 .ts/.tsx일 수 있으므로 확장자 없이 매칭을 시도하기 위함입니다.
  let cleanPath = importPath;
  if (importPath.endsWith('.js')) {
    cleanPath = importPath.slice(0, -3);
  } else if (importPath.endsWith('.jsx')) {
    cleanPath = importPath.slice(0, -4);
  }

  // 대상 파일의 기본 절대 경로(확장자 제외)를 계산합니다.
  const targetBase = normalize(join(currentDir, cleanPath));
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.svg'];

  // 2. 확장자를 순차적으로 붙여서 실제 파일이 존재하는지 확인합니다.
  for (const ext of extensions) {
    const withExt = targetBase + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  // 3. 원본 경로 그대로 시도합니다. (이미 확장자가 정확히 붙어 있거나 정적 자산인 경우)
  const originalPath = normalize(join(currentDir, importPath));
  if (allFiles.includes(originalPath)) return originalPath;

  // 4. 디렉토리 임포트 시도: 경로가 디렉토리인 경우 index 파일을 찾습니다.
  for (const ext of extensions) {
    const withIndex = normalize(join(targetBase, 'index' + ext));
    if (allFiles.includes(withIndex)) return withIndex;
  }

  // 모든 시도에도 파일을 찾지 못한 경우 null 반환
  return null;
}
