import { runSelfHealingNative } from '../../native/index.js';
import { existsSync } from 'fs';

/**
 * 프로젝트 내의 코드 품질 위반 사항을 자동으로 수정합니다.
 * v6.7.0: 핵심 자가 치유 로직을 Rust Native로 이관하여 대규모 수정 시의 성능을 극대화했습니다.
 */
export async function runSelfHealing(
  files: string[],
  _workspacePath: string
): Promise<{ fixedCount: number; messages: string[] }> {
  let totalFixed = 0;
  const messages: string[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;

    try {
      // v0.0.1: Native Fixer 호출 (주석 누락 등 READABILITY 위반 우선 해결)
      const result = runSelfHealingNative(file);
      if (result.fixed_count > 0) {
        totalFixed += result.fixed_count;
        messages.push(`[Native Fix] ${file}: ${result.fixed_count}개의 품질 이슈를 자동으로 수정했습니다.`);
      }
    } catch (e) {
      // Ignore
    }
  }

  return { fixedCount: totalFixed, messages };
}
