import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { Violation } from '../types/index.js';

/**
 * 정성적 코드 품질을 분석하고 시니어 개발자의 관점에서 조언을 생성합니다.
 */
export async function runSemanticReview(filePath: string): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const isTs =
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.cts') ||
    filePath.endsWith('.mts');
  const lang = isTs ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: Violation[] = [];

  const allLines = content.split(/\r?\n/);

  /**
   * 특정 AST 노드 바로 위에 한글 주석이 존재하는지 검사하는 헬퍼 함수입니다.
   */
  const hasKoreanCommentAbove = (node: SgNode, depth = 5): boolean => {
    let targetNode = node;
    let parent = node.parent();

    while (parent) {
      const kind = parent.kind();
      if (
        kind === 'export_statement' ||
        kind === 'decorator' ||
        kind === 'export_item' ||
        kind === 'lexical_declaration' ||
        kind === 'variable_declaration' ||
        kind === 'expression_statement'
      ) {
        targetNode = parent;
        parent = parent.parent();
      } else {
        break;
      }
    }

    const range = targetNode.range();
    const startLine = range.start.line;
    let currentLineIdx = startLine - 1;
    let checkedLines = 0;

    while (currentLineIdx >= 0 && checkedLines < depth) {
      const line = allLines[currentLineIdx].trim();
      if (line === '') {
        currentLineIdx--;
        continue;
      }

      if (line.includes('//') || line.includes('*') || line.includes('/*')) {
        if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(line)) return true;
        currentLineIdx--;
        checkedLines++;
      } else {
        break;
      }
    }
    return false;
  };

  // 1. 클래스 선언 검사
  root
    .findAll({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }] } })
    .forEach((m) => {
      if (m.kind() === 'class' && m.parent()?.kind() === 'class_declaration') return;

      const idNode = isTs
        ? m.find({ rule: { any: [{ kind: 'type_identifier' }, { kind: 'identifier' }] } })
        : m.find({ rule: { kind: 'identifier' } });

      const className = idNode?.text().trim() || 'unknown';

      if (!hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 클래스 [${className}] 위에 한글 주석을 추가하여 역할을 설명하세요.`,
        });
      }
    });

  // 2. 함수 관련 검사
  root
    .findAll({
      rule: {
        any: [
          { kind: 'function_declaration' },
          { kind: 'arrow_function' },
          { kind: 'function_expression' },
        ],
      },
    })
    .forEach((m) => {
      const idNode = m.find({ rule: { kind: 'identifier' } });
      const funcDisplayName = idNode?.text() || 'anonymous';

      if (m.kind() === 'function_declaration' && !hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${funcDisplayName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
        });
      }

      const body = m.text();
      const bodyLines = body.split(/\r?\n/);
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(body);
      const commentCount = (body.match(/\/\/|\/\*/g) || []).length;

      if (bodyLines.length > 50) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${funcDisplayName}]의 길이가 너무 깁니다 (${bodyLines.length}줄). 기능별로 작은 함수로 분리하세요.`,
        });
      }

      if (bodyLines.length > 20 && !hasKorean && commentCount > 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${funcDisplayName}]에 한글 주석이 없습니다. 팀 내 가독성을 위해 영문 주석을 한글로 변경하세요.`,
        });
      } else if (bodyLines.length > 30 && commentCount === 0) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 함수 [${funcDisplayName}]의 로직이 복잡하지만 설명 주석이 없습니다. 핵심 로직에 대한 한글 주석을 추가하세요.`,
        });
      }
    });

  // 3. 클래스 멤버 검사
  root.findAll({ rule: { kind: 'class_body' } }).forEach((body) => {
    body.children().forEach((m) => {
      const kindName = m.kind() as string;
      if (
        kindName.includes('definition') ||
        kindName.includes('method') ||
        kindName.includes('field')
      ) {
        const nameNode = m.find({
          rule: { any: [{ kind: 'property_identifier' }, { kind: 'identifier' }] },
        });
        const varName = nameNode?.text() || 'unknown';
        const kindLabel = kindName.includes('method') ? '메서드' : '멤버 변수';

        if (!hasKoreanCommentAbove(m)) {
          violations.push({
            type: 'READABILITY',
            file: filePath,
            message: `[Senior Advice] ${kindLabel} [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
          });
        }
      }
    });
  });

  // 4. 전역 요소 검사
  root
    .findAll({
      rule: {
        any: [
          { kind: 'lexical_declaration' },
          { kind: 'variable_declaration' },
          { kind: 'expression_statement' },
        ],
      },
    })
    .forEach((m) => {
      const parent = m.parent();
      if (parent?.kind() !== 'program' && parent?.kind() !== 'export_statement') return;

      let varName = '';
      let typeLabel = '전역 요소';

      if (m.kind() === 'expression_statement') {
        const text = m.text();
        if (!text.includes('=') || (!text.includes('exports') && !text.includes('module'))) return;
        varName = text.split('=')[0].trim();
        typeLabel = '모듈 할당';
      } else {
        const idNode = m.find({ rule: { kind: 'identifier' } });
        if (!idNode) return;
        varName = idNode.text();
        const isFunction = m.text().includes('=>') || m.text().includes('function');
        typeLabel = isFunction ? '함수형 변수' : '전역 변수';
      }

      if (varName.includes('{') || varName.includes('[')) return;

      if (!hasKoreanCommentAbove(m)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] ${typeLabel} [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
        });
      }
    });

  // 5. 정성적 리뷰 (패턴 매칭 사용)
  if (root.findAll('if ($A) { if ($B) { if ($C) { $$$ } } }').length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message:
        '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴(Early Return)을 활용하여 코드 흐름을 단순화하세요.',
    });
  }

  if (root.findAll('function $F($A, $B, $C, $D, $E, $$$) { $$$ }').length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message:
        '[Senior Advice] 함수의 파라미터가 너무 많습니다 (5개 이상). 관련 데이터를 객체로 묶어서 전달하는 것을 고려하세요.',
    });
  }

  return violations;
}
