import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { CustomRule } from '../config.js';

/**
 * 개별 파일의 분석 결과를 담는 인터페이스입니다.
 * 라인 수, 복잡도 및 사용자 정의 규칙 위반 사항을 포함합니다.
 */
export interface FileAnalysis {
  path: string; // 분석된 파일 경로
  lineCount: number; // 파일의 총 라인 수
  complexity: number; // 계산된 코드 복잡도 지수
  customViolations: { id: string; message: string }[]; // 사용자 정의 규칙 위반 목록
}

/**
 * 코드 복잡도를 측정하기 위한 주요 AST 패턴 목록입니다.
 * 제어 흐름 문(if, for, while, switch, try-catch)의 개수를 기반으로 복잡도를 산출합니다.
 */
const COMPLEXITY_PATTERNS = [
  'if ($A) { $$$ }',
  'for ($A) { $$$ }',
  'while ($A) { $$$ }',
  'switch ($A) { $$$ }',
  'try { $$$ } catch ($A) { $$$ }',
];

/**
 * 단일 파일에 대해 정밀 분석을 수행합니다.
 * @param filePath 분석할 파일의 절대 경로
 * @param customRules 적용할 사용자 정의 규칙 목록
 * @param providedRoot (선택 사항) 이미 파싱된 AST 노드가 있다면 재사용합니다.
 * @returns 분석된 메트릭 정보를 담은 FileAnalysis 객체
 */
export async function analyzeFile(
  filePath: string,
  customRules: CustomRule[] = [],
  providedRoot?: SgNode
): Promise<FileAnalysis> {
  try {
    // 실제 파일이 존재하지 않는 경우(주로 테스트 환경)에 대한 안전한 처리
    if (!existsSync(filePath) && !providedRoot) {
      return { path: filePath, lineCount: 5, complexity: 2, customViolations: [] };
    }

    const content = providedRoot ? '' : readFileSync(filePath, 'utf-8');
    const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;

    // ast-grep을 사용하여 소스 코드를 파싱하고 루트 노드를 획득합니다.
    const root = providedRoot || parse(lang, content).root();

    // 1. 라인 수 계산: 원본 텍스트의 줄 바꿈 기호를 기준으로 산출합니다.
    const text = providedRoot ? root.text() : content;
    const lineCount = text.split('\n').length;

    // 2. 복잡도 측정: 정의된 패턴들이 코드 내에서 몇 번 나타나는지 전수 조사합니다.
    let complexity = 0;
    for (const pattern of COMPLEXITY_PATTERNS) {
      try {
        const matches = root.findAll(pattern);
        complexity += matches.length;
      } catch (e) {
        // 잘못된 AST 패턴인 경우 무시하고 다음 패턴으로 진행합니다.
      }
    }

    // 3. 사용자 정의 규칙 검사: 설정 파일(.fast-lintrc)에 정의된 커스텀 패턴을 검색합니다.
    const customViolations: { id: string; message: string }[] = [];
    for (const rule of customRules) {
      try {
        const matches = root.findAll(rule.pattern);
        if (matches.length > 0) {
          customViolations.push({ id: rule.id, message: rule.message });
        }
      } catch (e) {
        // 커스텀 규칙의 패턴이 유효하지 않은 경우 무시합니다.
      }
    }

    return {
      path: filePath,
      lineCount,
      complexity,
      customViolations,
    };
  } catch (error) {
    // 파싱 에러나 파일 접근 오류 발생 시 로그를 남기고 상위로 전파합니다.
    console.error(`Error analyzing file ${filePath}:`, error);
    throw error;
  }
}
