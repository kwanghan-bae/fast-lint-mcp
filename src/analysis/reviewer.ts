import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { Violation } from '../types/index.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';
import { READABILITY } from '../constants.js';

/** 한글 문자 포함 여부를 확인하는 정규식 */
const KOREAN_CHAR_REGEX = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
/** 주석 패턴을 탐지하는 정규식 */
const COMMENT_PATTERN_REGEX = /\/\/|\/\*|\*/g;

/**
 * 정성적 코드 품질을 분석하고 시니어 개발자의 관점에서 조언을 생성합니다.
 */
export async function runSemanticReview(
  filePath: string,
  isDataFile: boolean = false
): Promise<Violation[]> {
  if (!existsSync(filePath) || isDataFile) return [];

  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const isTestFile =
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/__tests__/');

  const content = root.text();
  const allLines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  // 파이프라인 분석 실행
  violations.push(...reviewClasses(root, filePath, isTestFile, allLines));
  violations.push(...reviewFunctions(root, filePath, isTestFile, allLines));
  violations.push(...reviewMembers(root, filePath, isTestFile, allLines));
  violations.push(...reviewGlobals(root, filePath, allLines));
  violations.push(...reviewComplexity(root, filePath, isTestFile));

  return violations;
}

/**
 * 심볼 이름이 노이즈인지 확인하여 판단합니다. (v4.4.0: 상수 활용)
 */
function isNoiseSymbol(name: string): boolean {
  const n = name.trim().toLowerCase();
  const commonNames = ['game', 'app', 'core', 'main', 'root', 'item', 'data', 'info', 'ctx'];
  // anonymous는 예외로 하되, 임계값 이하이거나 표준 명칭은 주석 강제 대상에서 제외
  return n === '' || (n !== 'anonymous' && (n.length <= READABILITY.NOISE_SYMBOL_LENGTH_LIMIT || commonNames.includes(n)));
}

/**
 * 특정 AST 노드 바로 위에 한글 주석이 존재하는지 검사하는 헬퍼 함수입니다.
 * v4.4.0: 탐색 깊이 상수화
 */
function hasKoreanCommentAbove(node: SgNode, allLines: string[], depth = READABILITY.KOREAN_COMMENT_SEARCH_DEPTH): boolean {
  let targetNode = node;
  let current = node;

  while (current.parent()) {
    const p = current.parent()!;
    const kind = String(p.kind());
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
      targetNode = p;
      current = p;
    } else break;
  }

  const range = targetNode.range();
  let currentLineIdx = range.start.line - 1;
  let checkedLines = 0;
  let foundComment = false;

  while (currentLineIdx >= 0 && checkedLines < depth) {
    const line = allLines[currentLineIdx]?.trim();
    if (!line) {
      if (foundComment) break;
      currentLineIdx--;
      continue;
    }

    if (line.includes('//') || line.includes('*') || line.includes('/*')) {
      foundComment = true;
      if (KOREAN_CHAR_REGEX.test(line)) return true;
      currentLineIdx--;
      checkedLines++;
    } else {
      if (foundComment) break;
      currentLineIdx--;
      checkedLines++;
    }
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
      if (isNoiseSymbol(className)) return;

      if (!hasKoreanCommentAbove(m, allLines)) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          line: m.range().start.line + 1,
          rationale: `심볼 타입: Class [${className}]`,
          message: `[Senior Advice] 클래스 [${className}] 위에 한글 주석을 추가하여 역할을 설명하세요.`,
        });
      }
    });
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
 * 단일 함수의 품질을 분석합니다. (v4.4.0: 상수 활용)
 */
function analyzeSingleFunction(
  m: SgNode,
  filePath: string,
  isTestFile: boolean,
  allLines: string[]
): Violation[] {
  const violations: Violation[] = [];
  const idNode = m.find({
    rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }] },
  });
  const name = idNode?.text().trim() || 'anonymous';

  if (isNoiseSymbol(name)) return [];

  const startLine = m.range().start.line + 1;

  if (!isTestFile && m.kind() === 'function_declaration' && !hasKoreanCommentAbove(m, allLines)) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      line: startLine,
      rationale: `심볼 타입: ${m.kind()} [${name}]`,
      message: `[Senior Advice] 함수 [${name}] 위에 한글 주석을 추가하여 용도를 설명하세요.`,
    });
  }

  if (isTestFile) return violations;

  const body = m.text();
  const bodyLines = body.split(/\r?\n/);
  if (bodyLines.length < READABILITY.MIN_FUNCTION_LINES_FOR_COMMENT) return violations;

  if (bodyLines.length > READABILITY.MAX_FUNCTION_LINES) {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      line: startLine,
      rationale: `함수 길이: ${bodyLines.length}줄 (제한: ${READABILITY.MAX_FUNCTION_LINES}줄)`,
      message: `[Senior Advice] 함수 [${name}]의 길이가 너무 깁니다 (${bodyLines.length}줄). 분할을 권장합니다.`,
    });
  }

  violations.push(...checkCommentDensity(m, name, filePath, body, bodyLines, allLines));
  return violations;
}

/**
 * 함수의 주석 밀도를 분석합니다. (v4.4.0: 상수 활용)
 */
function checkCommentDensity(
  m: SgNode,
  name: string,
  path: string,
  body: string,
  lines: string[],
  allLines: string[]
): Violation[] {
  const violations: Violation[] = [];
  const startLine = m.range().start.line + 1;
  const hasKorean = KOREAN_CHAR_REGEX.test(body);
  const hasTopComment = hasKoreanCommentAbove(m, allLines);
  const commentCount = (body.match(COMMENT_PATTERN_REGEX) || []).length + (hasTopComment ? 1 : 0);

  if (lines.length > READABILITY.DENSITY_THRESHOLD_MEDIUM && !hasKorean && commentCount > 0) {
    const hasAnyKorean =
      hasKorean ||
      (hasTopComment && KOREAN_CHAR_REGEX.test(allLines[m.range().start.line - 1] || ''));
    if (!hasAnyKorean) {
      violations.push({
        type: 'READABILITY',
        file: path,
        line: startLine,
        rationale: `함수 길이: ${lines.length}줄, 주석 개수: ${commentCount}`,
        message: `[Senior Advice] 함수 [${name}]에 한글 주석이 없습니다. 한글 주석을 추가하세요.`,
      });
    }
  } else if (lines.length > READABILITY.DENSITY_THRESHOLD_HIGH && commentCount === 0) {
    violations.push({
      type: 'READABILITY',
      file: path,
      line: startLine,
      rationale: `함수 길이: ${lines.length}줄, 주석 0개`,
      message: `[Senior Advice] 함수 [${name}]의 로직이 복잡하지만 주석이 없습니다. 한글 주석을 추가하세요.`,
    });
  }
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
  const isDtoOrEntity = filePath.toLowerCase().includes('dto') || filePath.toLowerCase().includes('entity');

  root.findAll({ rule: { kind: 'class_body' } }).forEach((body) => {
    body.children().forEach((m) => {
      const kind = m.kind() as string;
      if (kind.includes('definition') || kind.includes('method') || kind.includes('field')) {
        const allIds = m.findAll({
          rule: { any: [{ kind: 'property_identifier' }, { kind: 'identifier' }] },
        });
        
        let idNode = allIds.find(node => {
          let parent = node.parent();
          while (parent && parent !== m) {
            if (parent.kind() === 'decorator') return false;
            parent = parent.parent();
          }
          return true;
        }) || allIds[0];

        const name = idNode?.text().trim() || 'unknown';
        if (isNoiseSymbol(name)) return;

        let label = kind.includes('method') ? '메서드' : '멤버 변수';
        if (!kind.includes('method') && isDtoOrEntity) {
          label = '필드 (DTO/Entity)';
        }

        if (!hasKoreanCommentAbove(m, allLines)) {
          violations.push({
            type: 'READABILITY',
            file: filePath,
            line: m.range().start.line + 1,
            rationale: `심볼 타입: ${kind} [${name}]`,
            message: `[Senior Advice] ${label} [${name}] 위에 한글 주석을 추가하세요.`,
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

  const isTestFile =
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/__tests__/');

  root.findAll({ rule: { any: globalKinds } }).forEach((m) => {
    const parent = m.parent();
    if (parent?.kind() !== 'program' && parent?.kind() !== 'export_statement') return;

    let name = '';
    let label = '전역 요소';
    const startLine = m.range().start.line + 1;

    if (m.kind() === 'expression_statement') {
      const text = m.text();
      if (isTestFile) {
        if (text.startsWith('describe(')) {
          name = 'describe';
          label = '테스트 스위트(Suite)';
        } else if (text.startsWith('beforeEach(') || text.startsWith('beforeAll(') || text.startsWith('afterEach(')) {
          name = text.split('(')[0];
          label = '테스트 설정 로직(Setup)';
        } else {
          return;
        }
      } else {
        if (!text.includes('=') || (!text.includes('exports') && !text.includes('module'))) return;
        name = text.split('=')[0].trim();
        label = '모듈 할당';
      }
    } else {
      let idNode = null;
      try {
        idNode = m.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } });
      } catch (e) {
        idNode = m.find({ rule: { kind: 'identifier' } });
      }
      if (!idNode) return;
      name = idNode.text().trim();
      label = m.text().includes('=>') || m.text().includes('function') ? '함수형 변수' : '전역 변수';
    }

    if (isNoiseSymbol(name)) return;

    if (!hasKoreanCommentAbove(m, allLines)) {
      const advice = label.includes('테스트') 
        ? `[Senior Advice] 복잡한 ${label} [${name}] 구간의 의도(Intent)나 Mocking 구조를 설명하는 한글 주석을 추가하세요.` 
        : `[Senior Advice] ${label} [${name}] 위에 한글 주석을 추가하세요.`;
      
      violations.push({
        type: 'READABILITY',
        file: filePath,
        line: startLine,
        rationale: `심볼 타입: ${label}`,
        message: advice,
      });
    }
  });
  return violations;
}

/**
 * 복잡도 및 파라미터 개수를 리뷰합니다. (v4.4.0: 상수 활용)
 */
function reviewComplexity(root: SgNode, filePath: string, isTestFile: boolean): Violation[] {
  if (isTestFile) return [];
  const violations: Violation[] = [];

  root.findAll('if ($A) { if ($B) { if ($C) { $$$ } } }').forEach((m) => {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      line: m.range().start.line + 1,
      message: '[Senior Advice] 코드 중첩이 너무 깊습니다. 조기 리턴을 활용하세요.',
    });
  });

  root.findAll(`function $F($A, $B, $C, $D, $E, $$$) { $$$ }`).forEach((m) => {
    violations.push({
      type: 'READABILITY',
      file: filePath,
      line: m.range().start.line + 1,
      rationale: `파라미터 개수 > ${READABILITY.MAX_PARAMETER_COUNT}`,
      message: `[Senior Advice] 파라미터가 너무 많습니다 (${READABILITY.MAX_PARAMETER_COUNT}개 초과). 객체로 묶으세요.`,
    });
  });
  return violations;
}
