import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { Violation } from '../types/index.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/** 한글 문자 포함 여부를 확인하는 정규식 */
const KOREAN_CHAR_REGEX = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
/** 주석 패턴을 탐지하는 정규식 */
const COMMENT_PATTERN_REGEX = /\/\/|\/\*|\*/g;

/**
 * 정성적 코드 품질을 분석하고 시니어 개발자의 관점에서 조언을 생성합니다.
 * v3.7.2: 초정밀 함수 분리 및 가독성 극대화
 */
export async function runSemanticReview(
  filePath: string,
  isDataFile: boolean = false
): Promise<Violation[]> {
  if (!existsSync(filePath) || isDataFile) return [];

  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const isTestFile = isTestingFile(filePath);
  const violations: Violation[] = [];
  const content = root.text();
  const allLines = content.split(/\r?\n/);

  // 파이프라인 분석 실행
  violations.push(...reviewClasses(root, filePath, isTestFile, allLines));
  violations.push(...reviewFunctions(root, filePath, isTestFile, allLines));
  violations.push(...reviewMembers(root, filePath, isTestFile, allLines));
  violations.push(...reviewGlobals(root, filePath, allLines));
  violations.push(...reviewComplexity(root, filePath, isTestFile));

  return violations;
}

/**
 * 대상 파일이 테스트 관련 파일인지 확인합니다.
 */
function isTestingFile(filePath: string): boolean {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/__tests__/')
  );
}

/**
 * 특정 AST 노드 바로 위에 한글 주석이 존재하는지 검사하는 헬퍼 함수입니다.
 */
function hasKoreanCommentAbove(node: SgNode, allLines: string[], depth = 5): boolean {
  let targetNode = node;
  let parent = node.parent();

  while (parent) {
    const kind = parent.kind();
    if (
      [
        'export_statement',
        'decorator',
        'export_item',
        'lexical_declaration',
        'variable_declaration',
        'expression_statement',
      ].includes(kind)
    ) {
      targetNode = parent;
      parent = parent.parent();
    } else break;
  }

  const range = targetNode.range();
  let currentLineIdx = range.start.line - 1;
  let checkedLines = 0;

  while (currentLineIdx >= 0 && checkedLines < depth) {
    const line = allLines[currentLineIdx]?.trim();
    if (!line) {
      currentLineIdx--;
      continue;
    }
    if (line.includes('//') || line.includes('*') || line.includes('/*')) {
      if (KOREAN_CHAR_REGEX.test(line)) return true;
      currentLineIdx--;
      checkedLines++;
    } else break;
  }
  return false;
}

/**
 * 클래스 선언부에 대한 한글 주석 여부를 리뷰합니다.
 */
function reviewClasses(
  root: SgNode,
  filePath: string,
  isTestFile: boolean,
  allLines: string[]
): Violation[] {
  if (isTestFile) return [];
  const violations: Violation[] = [];

  root
    .findAll({ rule: { any: [{ kind: 'class_declaration' }, { kind: 'class' }] } })
    .forEach((m) => {
      if (m.kind() === 'class' && m.parent()?.kind() === 'class_declaration') return;

      let idNode = null;
      try {
        idNode = m.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } });
      } catch (e) {
        idNode = m.find({ rule: { kind: 'identifier' } });
      }
      const className = idNode?.text().trim() || 'unknown';
      if (className !== 'unknown' && className.length <= 3) return;

      if (!hasKoreanCommentAbove(m, allLines)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[Senior Advice] 클래스 [${className}] 위에 한글 주석을 추가하여 역할을 설명하세요.`,
        });
      }
    });
  return violations;
}

/**
 * 단일 함수의 품질을 분석하여 위반 사항을 반환합니다.
 */
function analyzeSingleFunction(
  m: SgNode,
  filePath: string,
  isTestFile: boolean,
  allLines: string[]
): Violation[] {
  const violations: Violation[] = [];
  const idNode = m.find({ rule: { kind: 'identifier' } });
  const funcName = idNode?.text() || 'anonymous';

  if (funcName.length <= 3) return [];

  // 선언부 주석 검사
  if (!isTestFile && m.kind() === 'function_declaration' && !hasKoreanCommentAbove(m, allLines)) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: `[Senior Advice] 함수 [${funcName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
    });
  }

  if (isTestFile) return violations;

  const body = m.text();
  const bodyLines = body.split(/\r?\n/);
  if (bodyLines.length < 5) return violations;

  // 비대한 함수 검사
  if (bodyLines.length > 50) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: `[Senior Advice] 함수 [${funcName}]의 길이가 너무 깁니다 (${bodyLines.length}줄). 기능별로 작은 함수로 분리하세요.`,
    });
  }

  // 주석 밀도 및 한글 포함 검사
  violations.push(...checkFunctionCommentDensity(m, funcName, filePath, body, bodyLines, allLines));

  return violations;
}

/**
 * 함수의 주석 밀도와 한글 포함 여부를 정밀 분석합니다.
 */
function checkFunctionCommentDensity(
  m: SgNode,
  name: string,
  path: string,
  body: string,
  lines: string[],
  allLines: string[]
): Violation[] {
  const violations: Violation[] = [];
  const hasKorean = KOREAN_CHAR_REGEX.test(body);
  const hasTopComment = hasKoreanCommentAbove(m, allLines);
  const internalCommentCount = (body.match(COMMENT_PATTERN_REGEX) || []).length;
  const totalCommentCount = internalCommentCount + (hasTopComment ? 1 : 0);

  if (lines.length > 20 && !hasKorean && totalCommentCount > 0) {
    const hasAnyKorean =
      hasKorean ||
      (hasTopComment && KOREAN_CHAR_REGEX.test(allLines[m.range().start.line - 1] || ''));
    if (!hasAnyKorean) {
      violations.push({
        type: 'READABILITY',
        file: path,
        message: `[Senior Advice] 함수 [${name}]에 한글 주석이 없습니다. 팀 내 가독성을 위해 영문 주석을 한글로 변경하세요.`,
      });
    }
  } else if (lines.length > 30 && totalCommentCount === 0) {
    violations.push({
      type: 'READABILITY',
      file: path,
      message: `[Senior Advice] 함수 [${name}]의 로직이 복잡하지만 설명 주석이 없습니다. 핵심 로직에 대한 한글 주석을 추가하세요.`,
    });
  }
  return violations;
}

/**
 * 프로젝트 내 함수들의 품질을 일괄 리뷰합니다.
 */
function reviewFunctions(
  root: SgNode,
  filePath: string,
  isTestFile: boolean,
  allLines: string[]
): Violation[] {
  const violations: Violation[] = [];
  const funcKinds = [
    { kind: 'function_declaration' },
    { kind: 'arrow_function' },
    { kind: 'function_expression' },
  ];

  root.findAll({ rule: { any: funcKinds } }).forEach((m) => {
    violations.push(...analyzeSingleFunction(m, filePath, isTestFile, allLines));
  });
  return violations;
}

/**
 * 클래스 멤버들의 품질을 리뷰합니다.
 */
function reviewMembers(
  root: SgNode,
  filePath: string,
  isTestFile: boolean,
  allLines: string[]
): Violation[] {
  if (isTestFile) return [];
  const violations: Violation[] = [];
  root.findAll({ rule: { kind: 'class_body' } }).forEach((body) => {
    body.children().forEach((m) => {
      const kind = m.kind() as string;
      if (kind.includes('definition') || kind.includes('method') || kind.includes('field')) {
        const nameNode = m.find({
          rule: { any: [{ kind: 'property_identifier' }, { kind: 'identifier' }] },
        });
        const name = nameNode?.text() || 'unknown';
        if (name.length <= 3) return;
        const label = kind.includes('method') ? '메서드' : '멤버 변수';

        if (!hasKoreanCommentAbove(m, allLines)) {
          violations.push({
            type: 'READABILITY',
            file: filePath,
            message: `[Senior Advice] ${label} [${name}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
          });
        }
      }
    });
  });
  return violations;
}

/**
 * 전역 변수 및 할당부의 품질을 리뷰합니다.
 */
function reviewGlobals(root: SgNode, filePath: string, allLines: string[]): Violation[] {
  const violations: Violation[] = [];
  const globalKinds = [
    { kind: 'lexical_declaration' },
    { kind: 'variable_declaration' },
    { kind: 'expression_statement' },
  ];

  root.findAll({ rule: { any: globalKinds } }).forEach((m) => {
    const parent = m.parent();
    if (parent?.kind() !== 'program' && parent?.kind() !== 'export_statement') return;

    let varName = '';
    let typeLabel = '전역 요소';

    if (m.kind() === 'expression_statement') {
      if (
        !m.text().includes('=') ||
        (!m.text().includes('exports') && !m.text().includes('module'))
      )
        return;
      varName = m.text().split('=')[0].trim();
      typeLabel = '모듈 할당';
    } else {
      const idNode = m.find({ rule: { kind: 'identifier' } });
      if (!idNode) return;
      varName = idNode.text();
      typeLabel =
        m.text().includes('=>') || m.text().includes('function') ? '함수형 변수' : '전역 변수';
    }

    if (varName.includes('{') || varName.includes('[') || varName.length <= 3) return;

    if (!hasKoreanCommentAbove(m, allLines)) {
      violations.push({
        type: 'READABILITY',
        file: filePath,
        message: `[Senior Advice] ${typeLabel} [${varName}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
      });
    }
  });
  return violations;
}

/**
 * 복잡도 및 파라미터 개수를 리뷰합니다.
 */
function reviewComplexity(root: SgNode, filePath: string, isTestFile: boolean): Violation[] {
  if (isTestFile) return [];
  const violations: Violation[] = [];

  if (root.findAll('if ($A) { if ($B) { if ($C) { $$$ } } }').length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message: '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴(Early Return)을 활용하세요.',
    });
  }

  if (root.findAll('function $F($A, $B, $C, $D, $E, $$$) { $$$ }').length > 0) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      message:
        '[Senior Advice] 함수의 파라미터가 너무 많습니다 (5개 이상). 객체로 묶어서 전달하세요.',
    });
  }
  return violations;
}
