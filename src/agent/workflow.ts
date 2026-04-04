import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FixResult {
  success: boolean;
  error?: string;
  iterations: number;
}

const ALLOWED_PREFIXES = ['npm', 'npx', 'yarn', 'pnpm', 'jest', 'vitest', 'mocha', 'node'];
const FORBIDDEN_CHARS = /[;|&`$(){}<>\n\r]/;

/**
 * testCommand 입력값을 검증하여 Command Injection을 방어합니다.
 * - 빈 문자열이면 'npm test'를 반환합니다.
 * - 허용되지 않은 명령어 접두사 또는 쉘 메타문자가 포함된 경우 오류를 던집니다.
 */
export function validateTestCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return 'npm test';

  if (FORBIDDEN_CHARS.test(trimmed)) {
    throw new Error(`허용되지 않은 문자가 포함된 명령어입니다: ${trimmed}`);
  }

  const firstToken = trimmed.split(/\s+/)[0];
  if (!ALLOWED_PREFIXES.includes(firstToken)) {
    throw new Error(`허용되지 않은 명령어입니다: ${firstToken}`);
  }

  return trimmed;
}

/**
 * 자율형 자가 치유 워크플로우를 관장합니다.
 */
export class AgentWorkflow {
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 특정 파일의 결함을 수정하고 테스트를 통해 검증합니다.
   * @param filePath 대상 파일 경로
   * @param fixLogic 수정을 시도할 로직 (함수)
   * @param testCommand 검증용 테스트 명령어 (기본값: npm test)
   * @param maxRetries 최대 재시도 횟수
   */
  async selfHeal(
    filePath: string,
    fixLogic: (error?: string) => Promise<string>,
    testCommand: string = 'npm test',
    maxRetries: number = 3
  ): Promise<FixResult> {
    let validatedCommand: string;
    try {
      validatedCommand = validateTestCommand(testCommand);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message, iterations: 0 };
    }

    let iterations = 0;
    let lastError: string | undefined;

    while (iterations < maxRetries) {
      iterations++;

      // 1. 수정 제안 받기 (LLM 또는 로직)
      const fixedCode = await fixLogic(lastError);

      // 2. 파일에 적용
      writeFileSync(join(this.workspacePath, filePath), fixedCode, 'utf-8');

      // 3. 테스트 실행 및 검증
      try {
        execSync(validatedCommand, { cwd: this.workspacePath, stdio: 'pipe' });
        // 테스트 통과 시 성공 반환
        return { success: true, iterations };
      } catch (error: unknown) {
        // 테스트 실패 시 에러 로그 캡처 및 재시도
        const err = error as { stderr?: Buffer; stdout?: Buffer; message?: string };
        lastError = err.stderr?.toString() || err.stdout?.toString() || err.message;
        console.error(`[Iteration ${iterations}] Test failed:`, lastError);
      }
    }

    return { success: false, error: lastError, iterations };
  }

  /**
   * 단순 테스트 검증 도구
   */
  verify(testCommand: string = 'npm test'): { success: boolean; error?: string } {
    let validatedCommand: string;
    try {
      validatedCommand = validateTestCommand(testCommand);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }

    try {
      execSync(validatedCommand, { cwd: this.workspacePath, stdio: 'pipe' });
      return { success: true };
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer; stdout?: Buffer; message?: string };
      return {
        success: false,
        error: err.stderr?.toString() || err.stdout?.toString() || err.message,
      };
    }
  }
}
