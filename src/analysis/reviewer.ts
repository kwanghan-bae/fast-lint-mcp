import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { Violation } from '../types/index.js';

/**
 * 정성적 코드 품질 (가독성, 디자인 패턴, SRP 등)을 분석하고 시니어 개발자의 관점에서 조언을 생성합니다.
 * ast-grep을 사용하여 코드의 구조적 패턴을 탐지하고, 가독성을 저해하는 요소를 식별합니다.
 * @param filePath 분석 대상 파일 경로
 * @returns 발견된 가독성 위반 사항 목록
 */
export async function runSemanticReview(filePath: string): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  // 파일 확장자에 따라 적절한 파싱 언어(TypeScript 또는 JavaScript)를 선택합니다.
  const lang =
    filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: Violation[] = [];

  // 1. 과도한 중첩(Deep Nesting) 탐지 로직
  const nestingPattern = 'if ($A) { if ($B) { if ($C) { $$$ } } }';
  if (root.findAll(nestingPattern).length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message:
        '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴(Early Return)을 활용하여 코드 흐름을 단순화하세요.',
    });
  }

  // 2. 긴 파라미터 목록(Long Parameter List) 탐지 로직
  const longParamsPattern = 'function $F($A, $B, $C, $D, $E, $$$) { $$$ }';
  if (root.findAll(longParamsPattern).length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message:
        '[Senior Advice] 함수의 파라미터가 너무 많습니다 (5개 이상). 관련 데이터를 객체로 묶어서 전달하는 것을 고려하세요.',
    });
  }

  // 3. 거대 함수(Large Function) 탐지 로직
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
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]의 길이가 너무 깁니다 (${lines.length}줄). 기능별로 작은 함수로 분리하세요.`,
        });
      }

      // 4. 한글 주석 누락 및 영문 주석 체크 로직
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(body);
      const commentCount = (body.match(/\/\/|\/\*/g) || []).length;

      if (lines.length > 20 && !hasKorean && commentCount > 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]에 한글 주석이 없습니다. 팀 내 가독성을 위해 영문 주석을 한글로 변경하세요.`,
        });
      } else if (lines.length > 30 && commentCount === 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${match.getMatch('F')?.text() || 'anonymous'}]의 로직이 복잡하지만 설명 주석이 없습니다. 핵심 로직에 대한 한글 주석을 추가하세요.`,
        });
      }
    }
  }

  // 5. 주요 구성 요소(클래스, 함수, 전역 변수)에 대한 한글 주석 필수 체크 로직
  const allLines = content.split('\n');

  /**
   * 특정 AST 노드 바로 위에 한글 주석이 존재하는지 검사하는 헬퍼 함수입니다.
   */
  const hasKoreanCommentAbove = (node: any, depth = 5): boolean => {
    // export 문, decorator 등을 포함한 실제 시작 위치를 찾기 위해 부모 노드들 탐색
    let targetNode = node;
    let parent = node.parent();
    while (
      parent &&
      (parent.kind() === 'export_statement' ||
        parent.kind() === 'decorator' ||
        parent.kind() === 'export_item' ||
        parent.kind() === 'lexical_declaration' ||
        parent.kind() === 'variable_declaration')
    ) {
      targetNode = parent;
      parent = parent.parent();
    }

    const startLine = targetNode.range().start.line;

    let checkedLines = 0;
    let currentLineIdx = startLine - 1;

    while (currentLineIdx >= 0 && checkedLines < depth) {
      const line = allLines[currentLineIdx].trim();

      // 빈 줄은 무시하고 더 위를 탐색
      if (line === '') {
        currentLineIdx--;
        continue;
      }

      // 주석 기호(// 또는 *)가 포함되어 있는지 확인
      if (line.includes('//') || line.includes('*') || line.includes('/*')) {
        // 한글이 포함되어 있는지 확인
        if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(line)) {
          return true;
        }
        // 주석은 발견했지만 한글이 없는 경우 -> 계속해서 위쪽 탐색 (멀티라인 주석 대응)
        currentLineIdx--;
        checkedLines++;
      } else {
        // 주석이 아닌 일반 코드가 나오면 탐색 중단
        break;
      }
    }
    return false;
  };

  // 클래스 선언 탐지
  root
    .findAll({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }] } })
    .forEach((m) => {
      const className =
        m
          .find({ rule: { kind: 'type_identifier' } })
          ?.text()
          .trim() || 'unknown';
      if (!hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 클래스 [${className}] 위에 한글 주석을 추가하여 해당 클래스의 역할을 설명하세요.`,
        });
      }
    });

  // 함수 선언 탐지
  root
    .findAll({ rule: { any: [{ kind: 'function_declaration' }, { kind: 'function' }] } })
    .forEach((m) => {
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

  // 클래스 멤버 변수(Field) 탐지
  root
    .findAll({ rule: { any: [{ kind: 'public_field_definition' }, { kind: 'field_definition' }] } })
    .forEach((m) => {
      const varName =
        m
          .find({ rule: { any: [{ kind: 'property_identifier' }, { kind: 'identifier' }] } })
          ?.text() || 'unknown';
      if (!hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 멤버 변수 [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
        });
      }
    });

  // 전역 변수 및 상수 탐지
  root
    .findAll({ rule: { any: [{ kind: 'lexical_declaration' }, { kind: 'variable_declaration' }] } })
    .forEach((m) => {
      const parent = m.parent();
      const parentKind = parent?.kind();

      if (parentKind === 'program' || parentKind === 'export_statement') {
        const varName = m.find({ rule: { kind: 'identifier' } })?.text() || 'unknown';
        if (m.text().includes('{') && m.text().indexOf('{') < m.text().indexOf('=')) return;

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
