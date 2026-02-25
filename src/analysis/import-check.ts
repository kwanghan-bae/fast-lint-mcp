import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { dirname, join, normalize, isAbsolute, relative } from 'path';
import glob from 'fast-glob';
import { resolveModulePath } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';

/**
 * 아키텍처 규칙(의존성 방향)을 검사합니다.
 */
export async function checkArchitecture(
  filePath: string,
  rules: ArchitectureRule[],
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  const violations: { id: string; message: string }[] = [];
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const relativeFilePath = relative(workspacePath, absoluteFilePath);

  // 현재 파일이 'from' 패턴에 매치되는 규칙들 필터링
  const activeRules = rules.filter((rule: ArchitectureRule) => {
      const fromPattern = rule.from;
      const regex = new RegExp('^' + fromPattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
      return regex.test(relativeFilePath);
  });

  if (activeRules.length === 0) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();

  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map(f => normalize(join(workspacePath, f)));

  const importMatches = root.findAll("import $A from '$B'");
  for (const match of importMatches) {
    const source = match.getMatch('B')?.text();
    if (!source || !source.startsWith('.')) continue;

    const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);
    if (!resolved) continue;

    const relativeResolved = relative(workspacePath, resolved);

    for (const rule of activeRules) {
        const toPattern = rule.to;
        const targetRegex = new RegExp('^' + toPattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
        if (targetRegex.test(relativeResolved)) {
            violations.push({
                id: 'ARCHITECTURE_VIOLATION',
                message: rule.message,
            });
        }
    }
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

  // 로컬 파일 목록 (정규화)
  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map((f) => normalize(join(workspacePath, f)));

  // 현재 파일의 절대 경로 계산
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);

  // import 구문 탐지
  const importMatches = root.findAll("import $A from '$B'");
  for (const match of importMatches) {
    const source = match.getMatch('B')?.text();
    if (!source) continue;

    if (source.startsWith('.')) {
      // 공통 유틸리티 사용 (경로 해석)
      const resolved = resolveModulePath(dirname(normalize(absoluteFilePath)), source, allFiles);

      if (!resolved) {
        violations.push({
          id: 'HALLUCINATION_FILE',
          message: `존재하지 않는 파일 참조: ${source}`,
        });
      }
    } else if (!source.includes('/') || source.startsWith('@')) {
      const builtins = ['fs', 'path', 'crypto', 'os', 'http', 'https', 'child_process', 'events'];
      const libraryName = source.startsWith('@')
        ? source.split('/').slice(0, 2).join('/')
        : source.split('/')[0];
      if (!builtins.includes(libraryName) && !dependencies.includes(libraryName)) {
        violations.push({
          id: 'HALLUCINATION_LIB',
          message: `설치되지 않은 라이브러리 참조: ${libraryName}`,
        });
      }
    }
  }

  return violations;
}

/**
 * 에이전트의 가짜 구현(Fake Green)을 탐지합니다.
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: { id: string; message: string }[] = [];

  // 정규표현식으로 함수 추출
  const funcRegex = /function\s+([a-zA-Z0-0_]+)\s*\(([^)]+)\)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const name = match[1];
    const args = match[2];
    const body = match[3];

    if (name.startsWith('get') || name.startsWith('is')) continue;

    if (args.trim().length > 0 && body.includes('return ')) {
      const params = args.split(',').map((p) => p.trim().split(':')[0].trim());
      const isUnused = params.every((p) => !body.includes(p));
      if (isUnused) {
        violations.push({
          id: 'FAKE_LOGIC_CONST',
          message: `[${name}] 파라미터를 사용하지 않는 의심스러운 로직`,
        });
      }
    }
  }

  return violations;
}
