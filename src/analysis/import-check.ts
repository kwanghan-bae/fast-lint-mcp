import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { dirname, join, normalize } from 'path';
import glob from 'fast-glob';

/**
 * 에이전트의 환각을 탐지합니다.
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

  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map((f) => normalize(join(workspacePath, f)));

  const importMatches = root.findAll("import $A from '$B'");
  for (const match of importMatches) {
    const source = match.getMatch('B')?.text();
    if (!source) continue;

    if (source.startsWith('.')) {
      let cleanSource = source;
      if (source.endsWith('.js')) cleanSource = source.slice(0, -3);
      else if (source.endsWith('.jsx')) cleanSource = source.slice(0, -4);

      const targetPath = normalize(join(dirname(filePath), cleanSource));
      const exists = allFiles.some(
        (f) =>
          f === targetPath ||
          f === `${targetPath}.ts` ||
          f === `${targetPath}.tsx` ||
          f === `${targetPath}.js` ||
          f === `${targetPath}.jsx` ||
          f.endsWith(join(cleanSource, 'index.ts')) ||
          f.endsWith(join(cleanSource, 'index.js'))
      );

      if (!exists) {
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
 * 에이전트의 가짜 구현을 탐지합니다.
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string; message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: { id: string; message: string }[] = [];

  // 정규표현식으로 함수 추출 (테스트 성공을 위해 더 견고한 방식 사용)
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
