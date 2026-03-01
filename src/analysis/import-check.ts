import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath, loadProjectAliases, findNearestProjectRoot } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/** 프로젝트 파일 목록 캐시를 위한 내부 변수 */
let projectFilesCache: { workspacePath: string; files: string[] } | null = null;

/**
 * 프로젝트 내의 모든 파일 목록을 가져옵니다. (v3.2 Cached Turbo)
 */
export async function getProjectFiles(
  workspacePath: string,
  ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**']
): Promise<string[]> {
  if (projectFilesCache && projectFilesCache.workspacePath === workspacePath) {
    return projectFilesCache.files;
  }

  const rawFiles = await glob(['**/*.{ts,js,tsx,jsx,json,css,svg}'], { 
    cwd: workspacePath, 
    absolute: true,
    ignore: ignorePatterns
  });
  const files = rawFiles.map((f) => normalize(f));
  
  projectFilesCache = { workspacePath, files };
  return files;
}

/**
 * 프로젝트 파일 캐시를 초기화합니다.
 */
export function clearProjectFilesCache() {
  projectFilesCache = null;
}

/**
 * 레이어 간 의존성 방향(아키텍처 규칙)이 올바른지 검사합니다.
 */
export async function checkArchitecture(
  filePath: string,
  rules: ArchitectureRule[],
  workspacePath: string = process.cwd(),
  ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**']
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const relativeFilePath = relative(workspacePath, absoluteFilePath);

  const activeRules = rules.filter(r => new RegExp('^' + r.from.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(relativeFilePath));
  if (activeRules.length === 0) return [];

  const allFiles = await getProjectFiles(workspacePath, ignorePatterns);
  const violations: { id: string; message: string }[] = [];

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];
  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      if (!source) return;
      const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles, workspacePath, filePath);
      if (resolved) {
        const relResolved = relative(workspacePath, resolved);
        activeRules.forEach(rule => {
          if (new RegExp('^' + rule.to.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(relResolved)) {
            violations.push({ id: 'ARCHITECTURE_VIOLATION', message: rule.message });
          }
        });
      }
    });
  }
  return violations;
}

/**
 * AI 에이전트의 환각(Hallucination) 탐지
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd(),
  ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**']
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const dependencies = await loadAllDependencies(filePath, workspacePath);
  const allFiles = await getProjectFiles(workspacePath, ignorePatterns);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const aliases = loadProjectAliases(filePath);
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

  return scanImportsForHallucination(root, filePath, absoluteFilePath, allFiles, workspacePath, aliases, nodeBuiltins, dependencies);
}

/**
 * 임포트 구문을 순회하며 파일/라이브러리 환각 여부를 정밀 스캔합니다.
 */
function scanImportsForHallucination(root: SgNode, filePath: string, absPath: string, allFiles: string[], workspacePath: string, aliases: any, nodeBuiltins: Set<string>, dependencies: string[]): { id: string; message: string }[] {
  const violations: { id: string; message: string }[] = [];
  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      const isAliased = Object.keys(aliases).some(alias => source.startsWith(alias));
      if (source.startsWith('.') || isAliased) {
        const resolved = resolveModulePath(dirname(normalize(absPath)), source, allFiles, workspacePath, filePath);
        if (!resolved) {
          violations.push({ id: 'HALLUCINATION_FILE', message: `존재하지 않는 파일 참조: ${source}${isAliased ? ' (별칭 해석 실패)' : ''}` });
        }
      } else {
        const libName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!nodeBuiltins.has(libName) && !dependencies.includes(libName)) {
          violations.push({ id: 'HALLUCINATION_LIB', message: `설치되지 않은 라이브러리 참조: ${libName}` });
        }
      }
    });
  }
  return violations;
}

/**
 * 프로젝트의 모든 의존성( dependencies + devDependencies )을 로드합니다.
 */
async function loadAllDependencies(filePath: string, workspacePath: string): Promise<string[]> {
  const projectRoot = findNearestProjectRoot(dirname(filePath));
  const load = (p: string) => {
    if (!existsSync(p)) return [];
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      return Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    } catch (e) { return []; }
  };

  let deps = load(join(projectRoot, 'package.json'));
  if (projectRoot !== workspacePath) {
    deps = [...new Set([...deps, ...load(join(workspacePath, 'package.json'))])];
  }
  return deps;
}

/**
 * 에이전트의 '가짜 구현(Fake Logic)' 여부를 탐지합니다.
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const violations: { id: string; message: string }[] = [];
  root.findAll({ rule: { kind: 'function_declaration' } }).forEach((m) => {
    const name = m.find({ rule: { kind: 'identifier' } })?.text().trim() || '';
    if (name.startsWith('get') || name.startsWith('is')) return;

    const body = m.find({ rule: { kind: 'statement_block' } })?.text() || '';
    const params = m.find({ rule: { kind: 'formal_parameters' } })?.text() || '';

    if (params.trim().length > 2 && body.includes('return ')) {
      const pList = params.replace(/[()]/g, '').split(',').map(p => p.trim().split(':')[0].replace(/\?$/, '').trim());
      if (pList.every(p => !body.includes(p))) {
        violations.push({ id: 'FAKE_LOGIC_CONST', message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)` });
      }
    }
  });
  return violations;
}
