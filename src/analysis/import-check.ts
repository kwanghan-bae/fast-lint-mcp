import { readFileSync, existsSync } from 'fs';
import { Lang, parse, SgNode } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import {
  resolveModulePath,
  loadProjectAliases,
  findNearestProjectRoot,
} from '../utils/PathResolver.js';
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
    ignore: ignorePatterns,
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

  const activeRules = rules.filter((r) =>
    new RegExp('^' + r.from.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(
      relativeFilePath
    )
  );
  if (activeRules.length === 0) return [];

  const allFiles = await getProjectFiles(workspacePath, ignorePatterns);
  const violations: { id: string; message: string }[] = [];

  const patterns = ["import $A from '$B'", 'import $A from "$B"', "export { $$$ } from '$B'"];
  for (const pattern of patterns) {
    root.findAll(pattern).forEach((match) => {
      const source = match.getMatch('B')?.text();
      if (!source) return;
      const resolved = resolveModulePath(
        dirname(normalize(absoluteFilePath)),
        source,
        allFiles,
        workspacePath,
        filePath
      );
      if (resolved) {
        const relResolved = relative(workspacePath, resolved);
        activeRules.forEach((rule) => {
          if (
            new RegExp('^' + rule.to.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(
              relResolved
            )
          ) {
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

  return scanImportsForHallucination(
    root,
    filePath,
    absoluteFilePath,
    allFiles,
    workspacePath,
    aliases,
    nodeBuiltins,
    dependencies
  );
}

/**
 * 임포트 구문을 순회하며 파일/라이브러리 환각 여부를 정밀 스캔합니다.
 */
function scanImportsForHallucination(
  root: SgNode,
  filePath: string,
  absPath: string,
  allFiles: string[],
  workspacePath: string,
  aliases: any,
  nodeBuiltins: Set<string>,
  dependencies: string[]
): { id: string; message: string; line?: number }[] {
  const violations: { id: string; message: string; line?: number }[] = [];
  const patterns = ["import $A from '$B'", 'import $A from "$B"', "import '$B'", 'import "$B"'];

  for (const pattern of patterns) {
    root.findAll(pattern).forEach((m) => {
      const source = m.getMatch('B')?.text();
      if (!source) return;

      const line = m.range().start.line + 1;
      const isAliased = Object.keys(aliases).some((alias) => source.startsWith(alias));
      if (source.startsWith('.') || isAliased) {
        const resolved = resolveModulePath(
          dirname(normalize(absPath)),
          source,
          allFiles,
          workspacePath,
          filePath
        );
        if (!resolved) {
          violations.push({
            id: 'HALLUCINATION_FILE',
            line,
            message: `존재하지 않는 파일 참조: ${source}${isAliased ? ' (별칭 해석 실패)' : ''}`,
          });
        }
      } else {
        const libName = source.startsWith('@')
          ? source.split('/').slice(0, 2).join('/')
          : source.split('/')[0];
          
        if (!nodeBuiltins.has(libName) && !dependencies.includes(libName)) {
          // v3.8.1: 트랜지티브(Transitive) 의존성 방어 - node_modules에 물리적으로 존재하는지 확인
          let isInstalled = false;
          let currentDir = dirname(absPath);
          while (currentDir.length >= workspacePath.length) {
            if (existsSync(join(currentDir, 'node_modules', libName))) {
              isInstalled = true;
              break;
            }
            const parent = dirname(currentDir);
            if (parent === currentDir) break;
            currentDir = parent;
          }
          if (!isInstalled && existsSync(join(workspacePath, 'node_modules', libName))) {
            isInstalled = true;
          }

          if (!isInstalled) {
            violations.push({
              id: 'HALLUCINATION_LIB',
              line,
              message: `설치되지 않은 라이브러리 참조: ${libName}`,
            });
          }
        }
      }
    });
  }
  return violations;
}

/**
 * 프로젝트의 모든 의존성( dependencies + devDependencies )을 계층적으로 로드합니다.
 * v3.7.6: 상위 디렉토리로 올라가며 모든 package.json을 합산하여 모노레포 및 중첩 구조 지원.
 */
async function loadAllDependencies(filePath: string, workspacePath: string): Promise<string[]> {
  const deps = new Set<string>();
  let currentDir = dirname(isAbsolute(filePath) ? filePath : join(workspacePath, filePath));
  const rootDir = dirname(workspacePath); // 워크스페이스 상위까지만 탐색 제한

  const load = (p: string) => {
    if (!existsSync(p)) return;
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      const all = Object.keys(pkg.dependencies || {}).concat(
        Object.keys(pkg.devDependencies || {})
      );
      all.forEach((d) => deps.add(d));
    } catch (e) {
      /* ignore */
    }
  };

  // 상위로 올라가며 모든 package.json 로드 (Node.js Resolution Strategy 모사)
  while (currentDir.length >= workspacePath.length) {
    load(join(currentDir, 'package.json'));
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  // 워크스페이스 루트의 package.json은 반드시 포함
  load(join(workspacePath, 'package.json'));

  return Array.from(deps);
}

/**
 * 에이전트의 '가짜 구현(Fake Logic)' 여부를 탐지합니다.
 * v3.7.6: 화살표 함수 및 메서드 지원, 파라미터 사용 여부 정밀 체크.
 */
export async function checkFakeLogic(
  filePath: string
): Promise<{ id: string; message: string; line?: number }[]> {
  if (!existsSync(filePath)) return [];
  const root = AstCacheManager.getInstance().getRootNode(filePath);
  if (!root) return [];

  const violations: { id: string; message: string; line?: number }[] = [];
  const funcKinds = ['function_declaration', 'method_definition', 'arrow_function'];

  for (const kind of funcKinds) {
    root.findAll({ rule: { kind } }).forEach((m) => {
      // get/set 접근자는 제외
      const parent = m.parent();
      if (parent?.kind() === 'get_accessor' || parent?.kind() === 'set_accessor') return;

      const idNode = m.find({
        rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }] },
      });
      const name = idNode?.text().trim() || 'anonymous';
      if (
        name.startsWith('get') ||
        name.startsWith('is') ||
        name === 'render' ||
        name === 'useEffect'
      )
        return;

      const bodyNode = m.find({
        rule: { any: [{ kind: 'statement_block' }, { kind: 'expression' }] },
      });
      const body = bodyNode?.text() || '';

      let paramsNode = m.find({ rule: { kind: 'formal_parameters' } });
      // 화살표 함수의 단일 파라미터 처리
      if (!paramsNode && kind === 'arrow_function') {
        paramsNode = m.child(0); // 첫 번째 자식이 파라미터일 확률이 높음
      }

      if (paramsNode && body.includes('return ')) {
        const paramNames = new Set<string>();

        // 1. 일반 식별자 추출 (타입 선언 내부 제외)
        paramsNode.findAll({ rule: { kind: 'identifier' } }).forEach((idNode) => {
          let isType = false;
          let p = idNode.parent();
          while (p && p !== paramsNode) {
            if (p.kind() === 'type_annotation' || p.kind() === 'type_identifier' || p.kind() === 'type_parameters') {
              isType = true;
              break;
            }
            p = p.parent();
          }
          if (!isType) paramNames.add(idNode.text().trim());
        });

        // 2. 구조 분해 할당의 단축 속성명 추출 (예: { id })
        paramsNode.findAll({ rule: { kind: 'shorthand_property_identifier' } }).forEach((idNode) => {
          paramNames.add(idNode.text().trim());
        });

        const pList = Array.from(paramNames).filter(
          (p) => p.length > 0 && !['props', 'req', 'res', 'next', 'ctx'].includes(p)
        );

        // 파라미터가 하나라도 사용되지 않았는지 검사 (단어 경계 기반)
        if (pList.length > 0) {
          const allUnused = pList.every((p) => {
            const regex = new RegExp(`\\b${p}\\b`);
            return !regex.test(body);
          });

          if (allUnused) {
            violations.push({
              id: 'FAKE_LOGIC_CONST',
              line: m.range().start.line + 1,
              message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)`,
            });
          }
        }
      }
    });
  }
  return violations;
}
