import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * ESM 환경에서 현재 파일 및 프로젝트 루트 경로를 계산하기 위한 설정입니다.
 */
// 현재 파일의 URL 객체를 절대 경로 문자열로 변환
const __filename = fileURLToPath(import.meta.url);
// 현재 파일이 위치한 디렉토리 경로
const __dirname = dirname(__filename);
// MCP 서버 패키지의 루트 디렉토리 (dist/checkers 기준 상위 2단계)
const mcpRootDir = join(__dirname, '..', '..');

/**
 * ESLint나 Prettier 같은 외부 도구의 실행 파일 경로를 동적으로 탐색합니다.
 * 우선순위: 1. 분석 대상 프로젝트 내부 > 2. MCP 서버 내장 도구 > 3. 시스템 글로벌 경로
 * @param toolName 실행할 도구 이름 (eslint 또는 prettier)
 * @param workspacePath 분석 대상 프로젝트의 루트 경로
 * @returns 도구의 실행 절대 경로 또는 null
 */
function resolveToolPath(toolName: string, workspacePath: string): string | null {
  // 1. 분석 대상 프로젝트의 로컬 node_modules 시도
  const localPath = join(workspacePath, 'node_modules', '.bin', toolName);
  if (existsSync(localPath)) return localPath;

  // 2. MCP 서버 자체에 내장된(설치된) 도구 경로 시도
  const internalPath = join(mcpRootDir, 'node_modules', '.bin', toolName);
  if (existsSync(internalPath)) return internalPath;

  // 3. 마지막 수단: 시스템 환경변수(PATH)에 등록된 글로벌 도구 시도
  try {
    const globalPath = execSync(`which ${toolName}`, { encoding: 'utf-8' }).trim();
    if (globalPath) return globalPath;
  } catch (e) {
    // PATH에서도 발견되지 않은 경우 무시
  }

  return null;
}

/**
 * 분석 대상 프로젝트에 린트 설정 파일이 없을 경우,
 * MCP 서버가 제공하는 기본(Guardian) 설정을 사용할 수 있도록 경로를 반환합니다.
 * @param toolName 도구 이름
 * @param workspacePath 프로젝트 경로
 * @returns 사용할 설정 파일 경로 또는 null (프로젝트 설정이 이미 있는 경우)
 */
function getLinterConfig(toolName: string, workspacePath: string): string | null {
  const configs: Record<string, string[]> = {
    eslint: ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml'],
    prettier: [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.js',
      '.prettierrc.cjs',
      '.prettierrc.yaml',
    ],
  };

  // 프로젝트 내부에 공식 설정 파일 중 하나라도 존재하는지 확인합니다.
  const hasConfig = configs[toolName].some((f) => existsSync(join(workspacePath, f)));
  if (hasConfig) return null; // 이미 설정이 있다면 해당 설정을 따르도록 함

  // 설정이 없는 경우 MCP 서버 내의 '가디언(Guardian) 표준 설정' 경로를 구성합니다.
  const guardianConfig = join(
    mcpRootDir,
    toolName === 'eslint' ? '.eslintrc.guardian.json' : '.prettierrc.guardian'
  );
  return existsSync(guardianConfig) ? guardianConfig : null;
}

/**
 * ESLint 및 Prettier를 실행하여 코드의 사소한 포맷 및 구문 오류를 자동으로 수정합니다.
 * @param files 수정 대상 파일 목록
 * @param workspacePath 프로젝트 루트 경로
 * @returns 수정 결과 (수정된 도구 수 및 안내 메시지)
 */
export async function runSelfHealing(
  files: string[],
  workspacePath: string = process.cwd()
): Promise<{ fixedCount: number; messages: string[] }> {
  const messages: string[] = [];
  let fixedCount = 0;

  if (files.length === 0) return { fixedCount, messages };

  const tools = ['eslint', 'prettier'];
  for (const tool of tools) {
    const toolPath = resolveToolPath(tool, workspacePath);
    if (!toolPath) {
      // 필수 도구를 찾을 수 없는 경우 경고 메시지만 남기고 건너뜁니다.
      messages.push(`Warning: ${tool} 엔진을 찾을 수 없어 자동 수정을 건너뜁니다.`);
      continue;
    }

    const configPath = getLinterConfig(tool, workspacePath);
    // 도구별 설정 인자 구성
    const configArg = configPath
      ? tool === 'eslint'
        ? `-c ${configPath}`
        : `--config ${configPath}`
      : '';
    // 수정 실행 플래그 설정
    const fixFlag = tool === 'eslint' ? '--fix' : '--write';

    try {
      const fileArgs = files.join(' ');
      // 동기 방식으로 도구를 실행하여 즉시 결과를 반영합니다.
      execSync(`${toolPath} ${configArg} ${fixFlag} ${fileArgs}`, {
        cwd: workspacePath,
        stdio: 'ignore', // 불필요한 표준 출력은 무시
      });
      messages.push(
        `${tool} 엔진(${configPath ? '가디언 표준' : '프로젝트 설정'})으로 자동 수정을 완료했습니다.`
      );
      fixedCount++;
    } catch (e) {
      /**
       * ESLint 등은 수정 후에도 잔여 에러가 있으면 종료 코드를 1로 반환하는 경우가 있으나,
       * 최대한 수정을 시도했으므로 예외를 무시하고 정상 참작합니다.
       */
    }
  }

  return { fixedCount, messages };
}
