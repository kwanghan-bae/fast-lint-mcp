import { readFileSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { Violation } from '../types/index.js';

/**
 * 정성적 코드 품질 (가독성, 디자인 패턴, SRP)을 분석합니다.
 */
export async function runSemanticReview(filePath: string): Promise<Violation[]> {
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: Violation[] = [];

  // 1. Deep Nesting 탐지 (3단계 이상 중첩 시 경고)
  const nestingPattern = 'if ($A) { if ($B) { if ($C) { $$$ } } }';
  const nestingMatches = root.findAll(nestingPattern);
  if (nestingMatches.length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴(Early Return)을 활용하여 평탄화하세요.',
    });
  }

  // 2. Long Parameter List (인자가 5개 이상인 함수)
  const longParamsPattern = 'function $F($A, $B, $C, $D, $E, $$$) { $$$ }';
  const longParamsMatches = root.findAll(longParamsPattern);
  if (longParamsMatches.length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: '[Senior Advice] 함수의 파라미터가 너무 많습니다 (5개 이상). 객체(Object)를 전달하거나 함수를 분리하세요.',
    });
  }

  // 3. Magic Numbers (상수가 아닌 숫자의 직접 사용 탐지)
  // 패턴: 변수 할당 시 0, 1, -1 이외의 숫자를 직접 사용
  const magicNumberPattern = '[ $A = $VAL ]'; // ast-grep의 숫자 매칭 필요
  // (실제로는 더 복잡한 규칙이 필요하지만, 여기서는 핵심 가이드를 제공하는 데 집중)
  
  // 4. Large Class / File (단일 함수 50줄 초과)
  const functions = root.findAll('function $F($$$) { $BODY }');
  for (const func of functions) {
    const bodyText = func.getMatch('BODY')?.text() || '';
    if (bodyText.split('
').length > 50) {
      violations.push({
        type: 'READABILITY',
        file: filePath,
        message: `[Senior Advice] 함수 [${func.getMatch('F')?.text()}]의 길이가 너무 깁니다 (50줄 초과). SRP 원칙에 따라 분리하세요.`,
      });
    }
  }

  return violations;
}
