import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath, loadProjectAliases } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';

/**
 * 프로젝트 내의 모든 파일 목록을 가져옵니다.
 */
export async function getProjectFiles(workspacePath: string): Promise<string[]> {
  const rawFiles = await glob(['**/*.{ts,js,tsx,jsx,json,css,svg}'], { 
    cwd: workspacePath, 
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/coverage/**']
  });
  return rawFiles.map((f) => normalize(f));
}

/**
 * 레이어 간 의존성 방향(아키텍처 규칙)이 올바른지 검사합니다.
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

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      if (source) {
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles, workspacePath);
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
 * AI 에이전트의 환각(Hallucination) 탐지 (v2.2 Alias Support)
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const root = parse(lang, content).root();
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
  const aliases = loadProjectAliases(workspacePath);
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      const isAliased = Object.keys(aliases).some(alias => source.startsWith(alias));

      if (source.startsWith('.') || isAliased) {
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles, workspacePath);
        if (!resolved) {
          violations.push({
            id: 'HALLUCINATION_FILE',
            message: `존재하지 않는 파일 참조: ${source}${isAliased ? ' (별칭 해석 실패)' : ''}`,
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
 * 에이전트의 '가짜 구현(Fake Logic)' 탐지
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const root = parse(lang, content).root();
  const violations: { id: string; message: string }[] = [];

  root.findAll({ rule: { kind: 'function_declaration' } }).forEach((m) => {
    const name = m.find({ rule: { kind: 'identifier' } })?.text().trim() || '';
    const body = m.find({ rule: { kind: 'statement_block' } })?.text() || '';
    const params = m.find({ rule: { kind: 'formal_parameters' } })?.text() || '';

    if (name.startsWith('get') || name.startsWith('is')) return;

    if (params.trim().length > 2 && body.includes('return ')) {
      const pList = params.replace(/[()]/g, '').split(',').map(p => p.trim().split(':')[0].replace(/\?$/, '').trim());
      if (pList.every(p => !body.includes(p))) {
        violations.push({
          id: 'FAKE_LOGIC_CONST',
          message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)`,
        });
      }
    }
  });

  return violations;
}
