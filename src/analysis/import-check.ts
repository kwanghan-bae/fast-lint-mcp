import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath, loadProjectAliases, findNearestProjectRoot } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';
import { AstCacheManager } from '../utils/AstCacheManager.js';

let projectFilesCache: { workspacePath: string; files: string[] } | null = null;

/**
 * 프로젝트 내의 모든 파일 목록을 가져옵니다. (v3.2 Cached Turbo)
 */
export async function getProjectFiles(
  workspacePath: string,
  ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**']
): Promise<string[]> {
  // 동일 워크스페이스에 대한 캐시가 있다면 즉시 반환
  if (projectFilesCache && projectFilesCache.workspacePath === workspacePath) {
    return projectFilesCache.files;
  }

  const rawFiles = await glob(['**/*.{ts,js,tsx,jsx,json,css,svg}'], { 
    cwd: workspacePath, 
    absolute: true,
    ignore: ignorePatterns
  });
  const files = rawFiles.map((f) => normalize(f));
  
  // 캐시 업데이트
  projectFilesCache = { workspacePath, files };
  return files;
}

/**
 * 프로젝트 파일 캐시를 비웁니다.
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

  const allFiles = await getProjectFiles(workspacePath, ignorePatterns);

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      if (source) {
        // v3.1: Context-Aware Path Resolution
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles, workspacePath, filePath);
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
 * AI 에이전트의 환각(Hallucination) 탐지 (v3.1 Multi-Module Support)
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd(),
  ignorePatterns: string[] = ['**/node_modules/**', '**/dist/**']
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const violations: { id: string; message: string }[] = [];

  // v3.1: 파일에서 가장 가까운 프로젝트 루트를 찾아 의존성 로드
  const projectRoot = findNearestProjectRoot(dirname(filePath));
  const pkgPath = join(projectRoot, 'package.json');
  let dependencies: string[] = [];
  
  const loadDeps = (path: string) => {
    if (existsSync(path)) {
      try {
        const pkg = JSON.parse(readFileSync(path, 'utf-8'));
        return Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
      } catch (e) {}
    }
    return [];
  };

  dependencies = loadDeps(pkgPath);
  // 상위(Root) package.json 의존성도 보조적으로 포함 (공통 라이브러리 대응)
  if (projectRoot !== workspacePath) {
    const rootPkgDeps = loadDeps(join(workspacePath, 'package.json'));
    dependencies = [...new Set([...dependencies, ...rootPkgDeps])];
  }

  const allFiles = await getProjectFiles(workspacePath, ignorePatterns);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const aliases = loadProjectAliases(filePath);
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      const isAliased = Object.keys(aliases).some(alias => source.startsWith(alias));

      if (source.startsWith('.') || isAliased) {
        // v3.1: Context-Aware Path Resolution
        const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles, workspacePath, filePath);
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
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

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
