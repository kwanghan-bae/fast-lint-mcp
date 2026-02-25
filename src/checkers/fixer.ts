import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mcpRootDir = join(__dirname, '..', '..');

/**
 * 린터 도구(ESLint, Prettier)의 실행 경로를 스마트하게 찾습니다.
 * 1. 로컬 프로젝트 (Project Local)
 * 2. 가디언 내장 (MCP Internal)
 */
function resolveToolPath(toolName: string, workspacePath: string): string | null {
  // 1. 프로젝트 로컬 시도
  const localPath = join(workspacePath, 'node_modules', '.bin', toolName);
  if (existsSync(localPath)) return localPath;

  // 2. 가디언 내장 시도 (MCP의 node_modules)
  const internalPath = join(mcpRootDir, 'node_modules', '.bin', toolName);
  if (existsSync(internalPath)) return internalPath;

  // 3. 마지막 수단: 글로벌 시도 (시스템 환경변수 활용)
  try {
    const globalPath = execSync(`which ${toolName}`, { encoding: 'utf-8' }).trim();
    if (globalPath) return globalPath;
  } catch (e) {}

  return null;
}

/**
 * 프로젝트 설정 파일이 없을 경우 가디언의 표준 설정을 적용합니다.
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

  // 프로젝트에 설정 파일이 있는지 확인
  const hasConfig = configs[toolName].some((f) => existsSync(join(workspacePath, f)));
  if (hasConfig) return null; // 프로젝트 설정을 따름

  // 없으면 가디언 표준 설정 반환
  const guardianConfig = join(
    mcpRootDir,
    toolName !== 'eslint' ? '.eslintrc.guardian.json' : '.prettierrc.guardian'
  );
  return existsSync(guardianConfig) ? guardianConfig : null;
}

/**
 * ESLint 및 Prettier를 사용하여 범용적으로 사소한 오류를 자동 수정(Self-Healing)합니다.
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
      messages.push(`Warning: ${tool} 엔진을 찾을 수 없어 건너뜁니다.`);
      continue;
    }

    const configPath = getLinterConfig(tool, workspacePath);
    const configArg = configPath
      ? tool === 'eslint'
        ? `-c ${configPath}`
        : `--config ${configPath}`
      : '';
    const fixFlag = tool === 'eslint' ? '--fix' : '--write';

    try {
      const fileArgs = files.join(' ');
      // 프로젝트 루트 기준으로 실행하여 올바른 경로 인식 보장
      execSync(`${toolPath} ${configArg} ${fixFlag} ${fileArgs}`, {
        cwd: workspacePath,
        stdio: 'ignore',
      });
      messages.push(
        `${tool} 엔진(${configPath ? '가디언 표준' : '프로젝트 설정'})으로 자동 수정을 완료했습니다.`
      );
      fixedCount++;
    } catch (e) {
      // ESLint는 잔여 에러가 있으면 실패 코드를 반환하므로 정상 참작
    }
  }

  return { fixedCount, messages };
}
