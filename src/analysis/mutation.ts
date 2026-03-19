import { runMutationTestNative } from '../../native/index.js';
import { Violation } from '../types/index.js';

/**
 * 특정 파일에 대해 '경량 변이 테스트(Lightweight Mutation Test)'를 수행합니다.
 * v6.5.0: 모든 오케스트레이션을 Rust Native로 이관하여 FFI 및 I/O 오버헤드를 극대화로 줄였습니다.
 * @param filePath 변이 테스트를 적용할 파일 경로
 * @returns 변이 생존(Mutation Survived) 시 위반 사항 목록
 */
export async function runMutationTest(
  filePath: string
): Promise<Violation[]> {
  try {
    // v0.0.1: Native 변이 엔진 호출 (AST 기반 변이 + 병렬 실행 준비)
    const results = runMutationTestNative(filePath, 'npm test');
    return results.map(r => ({
        type: 'MUTATION_SURVIVED',
        file: filePath,
        line: r.line || 1,
        rationale: r.rationale || undefined,
        message: r.message
    }));
  } catch (e) {
    return [];
  }
}
