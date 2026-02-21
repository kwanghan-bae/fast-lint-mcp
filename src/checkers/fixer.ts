import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * ESLint 및 Prettier를 사용하여 사소한 스타일 위반 및 코딩 규칙을 자동 수정(Self-Healing)합니다.
 */
export async function runSelfHealing(files: string[]): Promise<{ fixedCount: number, messages: string[] }> {
  const messages: string[] = [];
  let fixedCount = 0;

  if (files.length === 0) return { fixedCount, messages };

  try {
    // 1. ESLint --fix 실행
    const eslintPath = join(process.cwd(), 'node_modules', '.bin', 'eslint');
    if (existsSync(eslintPath)) {
      try {
        // 변경된 파일들에 대해 ESLint fix 시도
        const fileArgs = files.join(' ');
        execSync(`${eslintPath} ${fileArgs} --fix`, { stdio: 'ignore' });
        messages.push(`ESLint를 통해 스타일 위반 사항을 자동으로 수정했습니다.`);
        fixedCount++;
      } catch (e) {
        // ESLint는 일부 에러가 남아있으면 비제로 종료 코드를 반환하므로 무시
      }
    }

    // 2. Prettier --write 실행
    const prettierPath = join(process.cwd(), 'node_modules', '.bin', 'prettier');
    if (existsSync(prettierPath)) {
      try {
        const fileArgs = files.join(' ');
        execSync(`${prettierPath} --write ${fileArgs}`, { stdio: 'ignore' });
        messages.push(`Prettier를 통해 코드 포맷팅을 최적화했습니다.`);
        fixedCount++;
      } catch (e) {}
    }

  } catch (error) {
    console.warn('Warning: Self-healing process failed partially.');
  }

  return { fixedCount, messages };
}
