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

  // 1. Deep Nesting 탐지
  const nestingPattern = 'if ($A) { if ($B) { if ($C) { $$$ } } }';
  if (root.findAll(nestingPattern).length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴을 활용하세요.',
    });
  }

  // 2. Long Parameter List
  const longParamsPattern = 'function $F($A, $B, $C, $D, $E, $$$) { $$$ }';
  if (root.findAll(longParamsPattern).length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: '[Senior Advice] 함수의 파라미터가 너무 많습니다 (5개 이상).',
    });
  }

  // 3. Large Function (단순 줄 수 기반 체크로 보강)
  // ast-grep 패턴보다 더 확실한 방법: 모든 함수 선언을 찾고 그 범위를 체크
  const functionPatterns = ['function $F($$$) { $$$BODY }', 'const $F = ($$$) => { $$$BODY }'];

  for (const pattern of functionPatterns) {
    const matches = root.findAll(pattern);
    for (const match of matches) {
      const body = match.getMatch('BODY')?.text() || match.text();
      if (body.split('\n').length > 50) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]의 길이가 너무 깁니다.`,
        });
      }
    }
  }

  return violations;
}
