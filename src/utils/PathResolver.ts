import { join, dirname, normalize } from 'path';
import {
  findNearestProjectRootNative,
  loadProjectAliasesNative,
  resolveModulePathNativeV2,
} from '../../native/index.js';

/**
 * 특정 파일 경로에서 상위로 올라가며 가장 가까운 프로젝트 루트를 찾습니다.
 * Rust Native 구현을 사용하여 I/O 성능을 최적화합니다.
 */
export function findNearestProjectRoot(currentDir: string): string {
  return findNearestProjectRootNative(currentDir);
}

/**
 * 프로젝트 설정에서 경로 별칭(Path Alias) 설정을 읽어옵니다.
 * Rust Native 구현을 사용하여 tsconfig.json 및 package.json을 파싱합니다.
 */
export function loadProjectAliases(pathContext?: string): Record<string, string> {
  let workspacePath = process.cwd();
  if (pathContext) {
    workspacePath = findNearestProjectRoot(
      pathContext.includes('.') ? dirname(pathContext) : pathContext
    );
  }
  return loadProjectAliasesNative(workspacePath);
}

/**
 * 소스 코드 내의 임포트 경로를 실제 물리 파일 경로로 변환합니다.
 * Rust Native 구현을 사용하여 복잡한 경로 해석 로직을 고속으로 처리합니다.
 */
export function resolveModulePath(
  currentDir: string,
  importPath: string,
  allFiles: string[],
  _ignoredWorkspacePath?: string,
  filePath?: string
): string | null {
  return resolveModulePathNativeV2(currentDir, importPath, allFiles, filePath);
}

/**
 * 모든 경로 캐시를 초기화합니다. (Native 캐시 포함)
 * 현재 Native 구현은 내부적으로 Lazy 캐시를 사용하므로 JS 레벨의 캐시는 필요하지 않습니다.
 */
export function clearPathCache(): void {
  // v0.0.1: Native 캐시 초기화 기능이 추가되면 여기서 호출 (현재는 무상태 Lazy 처리)
}
