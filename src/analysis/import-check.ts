import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';

/**
 * 프로젝트 내의 모든 파일 목록을 가져옵니다. (Zero-Cache 아키텍처에 맞춰 매 세션 새로 갱신 가능하도록 개선)
 * @param workspacePath 프로젝트 루트 경로
 * @returns 절대 경로로 변환된 파일 목록
 */
export async function getProjectFiles(workspacePath: string): Promise<string[]> {
  // .json, .css, .svg 등 다양한 자산 파일도 임포트 대상이 될 수 있으므로 확장자 범위를 넓힙니다.
  const rawFiles = await glob(['**/*.{ts,js,tsx,jsx,json,css,svg}'], { 
    cwd: workspacePath, 
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/tests/**']
  });
  return rawFiles.map((f) => normalize(f));
}

/**
 * 레이어 간 의존성 방향(아키텍처 규칙)이 올바른지 검사합니다.
 * 예를 들어, '도메인 레이어는 인프라 레이어를 참조할 수 없다'와 같은 규칙을 검증합니다.
 * @param filePath 분석 대상 파일 경로
 * @param rules 적용할 아키텍처 규칙 목록
 * @param workspacePath 프로젝트 루트 경로
 * @returns 아키텍처 위반 사항 목록
 */
export async function checkArchitecture(
  filePath: string,
  rules: ArchitectureRule[],
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const violations: { id: string; message: string }[] = [];
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const relativeFilePath = relative(workspacePath, absoluteFilePath);

  // 현재 파일에 적용되는 규칙만 필터링합니다. (from 패턴 매칭)
  const activeRules = rules.filter((rule: ArchitectureRule) => {
    const fromPattern = rule.from;
    const regex = new RegExp(
      '^' + fromPattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(relativeFilePath);
  });

  if (activeRules.length === 0) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();

  const allFiles = await getProjectFiles(workspacePath);

  // 모든 종류의 import/export from 문을 탐색하기 위한 AST 패턴
  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      // 상대 경로 임포트인 경우 실제 파일 경로로 해소하여 검사합니다.
      if (source && source.startsWith('.')) {
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);
        if (resolved) {
          const relativeResolved = relative(workspacePath, resolved);
          for (const rule of activeRules) {
            // 참조 대상 경로가 허용되지 않는 레이어(to 패턴)에 속하는지 확인합니다.
            const targetRegex = new RegExp(
              '^' + rule.to.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
            );
            if (targetRegex.test(relativeResolved)) {
              violations.push({ id: 'ARCHITECTURE_VIOLATION', message: rule.message });
            }
          }
        }
      }
    });
  }

  return violations;
}

/**
 * AI 에이전트의 환각(Hallucination)으로 인해 존재하지 않는 파일이나
 * 설치되지 않은 라이브러리를 참조하는 경우를 탐지합니다.
 * @param filePath 분석 대상 파일 경로
 * @param workspacePath 프로젝트 루트 경로
 * @returns 환각 관련 위반 사항 목록
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: { id: string; message: string }[] = [];

  // package.json에서 실제 설치된 의존성 목록을 가져옵니다.
  const pkgPath = join(workspacePath, 'package.json');
  let dependencies: string[] = [];
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      dependencies = Object.keys(pkg.dependencies || {}).concat(
        Object.keys(pkg.devDependencies || {})
      );
    } catch (e) {
      // 의존성 목록 로드 실패 시 빈 목록 사용
    }
  }

  const allFiles = await getProjectFiles(workspacePath);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  // Node.js 표준 내장 모듈 목록을 준비합니다 (node: 접두사 포함).
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      if (source.startsWith('.')) {
        // 1. 파일 환각 체크: 실제 프로젝트 내에 파일이 존재하는지 확인
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);
        if (!resolved) {
          violations.push({
            id: 'HALLUCINATION_FILE',
            message: `존재하지 않는 파일 참조: ${source}`,
          });
        }
      } else {
        // 2. 라이브러리 환각 체크: 설치된 패키지나 표준 모듈인지 확인
        const libraryName = source.startsWith('@')
          ? source.split('/').slice(0, 2).join('/')
          : source.split('/')[0];
        if (!nodeBuiltins.has(libraryName) && !dependencies.includes(libraryName)) {
          violations.push({
            id: 'HALLUCINATION_LIB',
            message: `설치되지 않은 라이브러리 참조: ${libraryName}`,
          });
        }
      }
    });
  }

  return violations;
}

/**
 * 에이전트가 테스트를 통과시키기 위해 실제 로직을 구현하지 않고
 * 파라미터를 무시한 채 상수값을 반환하는 등의 '가짜 구현(Fake Logic)'을 탐지합니다.
 * @param filePath 분석 대상 파일 경로
 * @returns 가짜 로직 위반 사항 목록
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: { id: string; message: string }[] = [];

  // 1. 일반 함수 선언문 조사
  root.findAll({ rule: { kind: 'function_declaration' } }).forEach((m) => {
    const name =
      m
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim() || '';
    const body = m.find({ rule: { kind: 'statement_block' } })?.text() || '';
    const params = m.find({ rule: { kind: 'formal_parameters' } })?.text() || '';

    // getter나 단순 상태 확인 함수는 제외합니다.
    if (name.startsWith('get') || name.startsWith('is')) return;

    // 파라미터가 선언되어 있지만 본문(body) 내에서 한 번도 참조되지 않는 경우를 탐지합니다.
    if (params.trim().length > 2 && body.includes('return ')) {
      const pList = params
        .replace(/[()]/g, '')
        .split(',')
        .map((p) => p.trim().split(':')[0].replace(/\?$/, '').trim());

      const isUnused = pList.every((p) => !body.includes(p));
      if (isUnused) {
        violations.push({
          id: 'FAKE_LOGIC_CONST',
          message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)`,
        });
      }
    }
  });

  // 2. 화살표 함수 및 함수 표현식 조사
  root.findAll({ rule: { kind: 'variable_declarator' } }).forEach((m) => {
    const name =
      m
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim() || '';
    const body = m.text();

    if (name.startsWith('get') || name.startsWith('is')) return;

    // TODO: 화살표 함수에 대한 정밀한 파라미터 사용 분석 로직 추가 예정
    if (body.includes('=>') && body.includes('return ')) {
      // 현재는 테스트 대응용 단순화된 체크만 수행
    }
  });

  return violations;
}
