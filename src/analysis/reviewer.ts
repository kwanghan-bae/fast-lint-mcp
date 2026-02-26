import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { Violation } from '../types/index.js';

/**
 * 정성적 코드 품질 (가독성, 디자인 패턴, SRP)을 분석합니다.
 */
export async function runSemanticReview(filePath: string): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];
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

  // 3. Large Function
  const functionPatterns = ['function $F($$$) { $$$BODY }', 'const $F = ($$$) => { $$$BODY }'];

  for (const pattern of functionPatterns) {
    const matches = root.findAll(pattern);
    for (const match of matches) {
      const body = match.getMatch('BODY')?.text() || match.text();
      const lines = body.split('\n');
      if (lines.length > 50) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]의 길이가 너무 깁니다.`,
        });
      }

      // 4. [New] 한글 주석 누락 및 영문 주석 체크
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(body);
      const hasEnglishComment =
        /\/\/.*[a-zA-Z]/.test(body) || /\/\*[\s\S]*?[a-zA-Z][\s\S]*?\*\//.test(body);
      const commentCount = (body.match(/\/\/|\/\*/g) || []).length;

      if (lines.length > 20 && !hasKorean && commentCount > 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]에 한글 주석이 없습니다. 영문 주석을 한글로 변경하세요.`,
        });
      } else if (lines.length > 30 && commentCount === 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]의 로직이 복잡하지만 주석이 없습니다. 한글 주석을 추가하세요.`,
        });
      }
    }
  }

  return violations;
}
