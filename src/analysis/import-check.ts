import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';

// 파일 목록 캐시 (성능 최적화 핵심)
let cachedFileList: string[] | null = null;

async function getProjectFiles(workspacePath: string): Promise<string[]> {
  if (cachedFileList) return cachedFileList;
  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath, absolute: true });
  cachedFileList = rawFiles.map((f) => normalize(f));
  return cachedFileList;
}

/**
 * 아키텍처 규칙(의존성 방향)을 검사합니다.
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

  // 모든 종류의 import/export from 문 탐색
  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      if (source && source.startsWith('.')) {
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);
        if (resolved) {
          const relativeResolved = relative(workspacePath, resolved);
          for (const rule of activeRules) {
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
 * 에이전트의 환각(존재하지 않는 파일/라이브러리 참조)을 탐지합니다.
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

  const pkgPath = join(workspacePath, 'package.json');
  let dependencies: string[] = [];
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      dependencies = Object.keys(pkg.dependencies || {}).concat(
        Object.keys(pkg.devDependencies || {})
      );
    } catch (e) {}
  }

  const allFiles = await getProjectFiles(workspacePath);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      if (source.startsWith('.')) {
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);
        if (!resolved) {
          violations.push({
            id: 'HALLUCINATION_FILE',
            message: `존재하지 않는 파일 참조: ${source}`,
          });
        }
      } else {
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
 * 에이전트의 가짜 구현(Fake Green)을 탐지합니다.
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: { id: string; message: string }[] = [];

  // 1. 모든 함수 선언문 (Node Kind 기반)
  root.findAll({ rule: { kind: 'function_declaration' } }).forEach((m) => {
    const name =
      m
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim() || '';
    const body = m.find({ rule: { kind: 'statement_block' } })?.text() || '';
    const params = m.find({ rule: { kind: 'formal_parameters' } })?.text() || '';

    if (name.startsWith('get') || name.startsWith('is')) return;

    if (params.trim().length > 2 && body.includes('return ')) {
      const pList = params
        .replace(/[()]/g, '')
        .split(',')
        .map((p) => p.trim().split(':')[0].trim());
      const isUnused = pList.every((p) => !body.includes(p));
      if (isUnused) {
        violations.push({
          id: 'FAKE_LOGIC_CONST',
          message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직`,
        });
      }
    }
  });

  // 2. 화살표 함수 및 함수 표현식
  root.findAll({ rule: { kind: 'variable_declarator' } }).forEach((m) => {
    const name =
      m
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim() || '';
    const body = m.text(); // 화살표 함수 본문 포함 전체 텍스트

    if (name.startsWith('get') || name.startsWith('is')) return;

    if (body.includes('=>') && body.includes('return ')) {
      // 단순화된 파라미터 미사용 체크 (테스트 대응용)
      if (body.includes('return ') && !body.includes('(')) {
        // 파라미터가 없거나 쓰이지 않는 특징
        // 실제 구현은 더 정밀해야 함
      }
    }
  });

  return violations;
}
