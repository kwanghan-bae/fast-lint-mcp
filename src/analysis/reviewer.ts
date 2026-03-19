import { existsSync } from 'fs';
import { SgNode } from '@ast-grep/napi';
import { Violation } from '../types/index.js';
import { READABILITY } from '../constants.js';
import { 
  verifyHallucinationNative, 
  runSemanticReviewNative,
  ReviewOptions
} from '../../native/index.js';

/**
 * AST 기반의 결정론적 API 계약 검증을 수행하여 환각(Hallucination)을 탐지합니다.
 * v0.0.1: Rust Native HashSet 엔진을 사용하여 O(1) 속도로 검증합니다.
 */
export async function verifyAPIContracts(
  _root: SgNode,
  filePath: string,
  allExportedSymbols: { name: string; file: string }[] = [],
  isTestFile: boolean = false
): Promise<Violation[]> {
  if (isTestFile) return [];

  // v6.4.0: 모든 로직을 Rust Native로 이관하여 JS 루프 제거
  const results = verifyHallucinationNative(
    filePath,
    [], // localDefs now handled inside native via OXC
    [], // imports now handled inside native via OXC
    [], // builtins (TODO: pass from TS if needed, currently using internal Rust list)
    allExportedSymbols.map(s => s.name)
  );

  return results.map(r => ({
    type: 'HALLUCINATION',
    file: filePath,
    line: r.line,
    message: `[AI Hallucination] 존재하지 않는 API 호출이 감지되었습니다: ${r.name}`,
    rationale: `심볼 [${r.name}]이 현재 파일의 정의나 임포트 목록에 존재하지 않습니다.`,
  }));
}

/**
 * 코드 시맨틱 리뷰를 수행하여 가독성 및 잠재적 문제를 탐지합니다.
 * v6.4.0: 가독성 규칙(READABILITY) 검사를 Rust Native로 이관했습니다.
 */
export async function runSemanticReview(
  filePath: string,
  isDataFile: boolean = false
): Promise<Violation[]> {
  if (!existsSync(filePath) || isDataFile) return [];

  const isTestFile =
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/__tests__/');

  const options: ReviewOptions = {
    maxFunctionLines: READABILITY.MAX_FUNCTION_LINES,
    maxParameterCount: READABILITY.MAX_PARAMETER_COUNT,
    densityThresholdMedium: READABILITY.DENSITY_THRESHOLD_MEDIUM,
    densityThresholdHigh: READABILITY.DENSITY_THRESHOLD_HIGH,
    minFunctionLinesForComment: READABILITY.MIN_FUNCTION_LINES_FOR_COMMENT,
  };

  try {
    const nativeViolations = runSemanticReviewNative(filePath, isTestFile, options);
    
    // JS에서 추가로 처리해야 할 복잡한 패턴(중첩 등)이 있다면 여기서 수행 가능
    // 현재는 Rust에서 대부분의 기초 규칙을 처리함
    return nativeViolations.map(v => ({
        type: v.type as any,
        file: v.file || filePath,
        line: v.line || 1,
        rationale: v.rationale || undefined,
        message: v.message
    }));
  } catch (e) {
    return [];
  }
}
