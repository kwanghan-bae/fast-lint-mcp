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

  // 5. [New] 주요 구성 요소(클래스, 함수, 전역 변수)에 대한 한글 주석 체크
  const allLines = content.split('\n');

  // 한글 주석 존재 여부 확인 헬퍼 함수
  const hasKoreanCommentAbove = (node: any, depth = 2): boolean => {
    // 만약 export 문으로 감싸져 있다면 export 문의 위치를 기준으로 함
    const targetNode = node.parent()?.kind() === 'export_statement' ? node.parent() : node;
    const startLine = targetNode.range().start.line;

    for (let i = 1; i <= depth; i++) {
      const prevLineIdx = startLine - i;
      if (prevLineIdx < 0) break;
      const prevLine = allLines[prevLineIdx];
      // 한글이 포함되어 있고, 주석 기호(// 또는 *)가 포함되어 있는지 확인
      if (
        /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(prevLine) &&
        (prevLine.includes('//') || prevLine.includes('*'))
      ) {
        return true;
      }
    }
    return false;
  };

  // 클래스 선언 탐지
  root.findAll({ rule: { kind: 'class_declaration' } }).forEach((m) => {
    const className =
      m
        .find({ rule: { kind: 'type_identifier' } })
        ?.text()
        .trim() || 'unknown';
    if (!hasKoreanCommentAbove(m)) {
      violations.push({
        type: 'READABILITY',
        file: filePath,
        message: `[Senior Advice] 클래스 [${className}] 위에 한글 주석을 추가하여 역할을 설명하세요.`,
      });
    }
  });

  // 함수 선언 탐지
  root.findAll({ rule: { kind: 'function_declaration' } }).forEach((m) => {
    const funcName =
      m
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim() || 'anonymous';
    if (!hasKoreanCommentAbove(m)) {
      violations.push({
        type: 'READABILITY',
        file: filePath,
        message: `[Senior Advice] 함수 [${funcName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
      });
    }
  });

  // 클래스 멤버 변수 탐지
  root
    .findAll({
      rule: { kind: 'public_field_definition' },
    })
    .forEach((m) => {
      const varName = m.find({ rule: { kind: 'property_identifier' } })?.text() || 'unknown';

      if (!hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 멤버 변수 [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
        });
      }
    });

  // 전역 변수 탐지 (lexical_declaration: const/let, variable_declaration: var)
  root
    .findAll({ rule: { any: [{ kind: 'lexical_declaration' }, { kind: 'variable_declaration' }] } })
    .forEach((m) => {
      // 부모가 program이거나, export_statement의 자식인 경우 (최상위 변수)
      const parentKind = m.parent()?.kind();
      if (parentKind === 'program' || parentKind === 'export_statement') {
        const varName = m.find({ rule: { kind: 'identifier' } })?.text() || 'unknown';

        // 'const { x } = ...' 같은 구조 분해 할당은 제외 (단순 변수만)
        if (m.text().includes('{') && m.text().indexOf('{') < m.text().indexOf('=')) return;

        // 만약 화살표 함수라면 '함수'로 취급하여 메시지 조정 가능
        const isFunction = m.text().includes('=>') || m.text().includes('function');
        const typeLabel = isFunction ? '함수형 변수' : '전역 변수';

        if (!hasKoreanCommentAbove(m)) {
          violations.push({
            type: 'READABILITY',
            file: filePath,
            message: `[Senior Advice] ${typeLabel} [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
          });
        }
      }
    });

  return violations;
}
