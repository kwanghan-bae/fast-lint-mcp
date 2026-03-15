import { countTechDebtNative } from '../../native/index.js';

/**
 * 프로젝트 내의 기술 부채(TODO, FIXME 등)를 고속으로 스캔하여 개수를 반환합니다.
 * v0.0.1: Rust Native 엔진을 활용하여 멀티코어 병렬 스캔을 수행합니다.
 */
export async function countTechDebt(files: string[]): Promise<number> {
  try {
    return countTechDebtNative(files);
  } catch (error) {
    // 전체 프로세스 실패 시 안전하게 0 반환
    return 0;
  }
}
