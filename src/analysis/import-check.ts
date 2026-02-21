import { readFileSync, existsSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { dirname, join } from 'path';
import glob from 'fast-glob';

/**
 * 에이전트의 환각(존재하지 않는 파일/라이브러리 참조)을 탐지합니다.
 */
export async function checkHallucination(filePath: string, workspacePath: string = process.cwd()): Promise<{ id: string, message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: { id: string, message: string }[] = [];

  // package.json에서 설치된 의존성 로드
  const pkgPath = join(workspacePath, 'package.json');
  let dependencies: string[] = [];
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      dependencies = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    } catch (e) {}
  }

  // 모든 로컬 파일 목록 (상대 경로 대조용)
  const allFiles = await glob(['src/**/*.{ts,js}'], { cwd: workspacePath });

  // 1. import ... from 'source'
  const importMatches = root.findAll("import $A from '$B'");
  for (const match of importMatches) {
    const source = match.getMatch('B')?.text();
    if (!source) continue;

    if (source.startsWith('.')) {
      // 로컬 파일 존재 여부 확인
      const targetPath = join(dirname(filePath), source);
      const exists = allFiles.some(f => f.startsWith(targetPath) || f === `${targetPath}.ts` || f === `${targetPath}.js`);
      if (!exists) {
        violations.push({ id: 'HALLUCINATION_FILE', message: `존재하지 않는 파일 참조: ${source}` });
      }
    } else if (!source.includes('/') || source.startsWith('@')) {
      // 라이브러리 존재 여부 확인 (node built-in 제외)
      const builtins = ['fs', 'path', 'crypto', 'os', 'http', 'https', 'child_process', 'events'];
      const libraryName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
      if (!builtins.includes(libraryName) && !dependencies.includes(libraryName)) {
        violations.push({ id: 'HALLUCINATION_LIB', message: `설치되지 않은 라이브러리 참조: ${libraryName}` });
      }
    }
  }

  return violations;
}

/**
 * 에이전트의 가짜 구현(Fake Green)을 탐지합니다.
 */
export async function checkFakeLogic(filePath: string): Promise<{ id: string, message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
  const ast = parse(lang, content);
  const root = ast.root();
  const violations: { id: string, message: string }[] = [];

  // 1. 파라미터를 사용하지 않고 상수만 반환하는 함수 (Getter 제외)
  // 패턴: function $F($A) { return $B } (여기서 $A는 존재하지만 본문에서 쓰이지 않음)
  const simpleReturns = root.findAll("function $F($A) { return $B }");
  for (const match of simpleReturns) {
    const params = match.getMatch('A')?.text();
    const body = match.text();
    const funcName = match.getMatch('F')?.text();
    
    // 단순 getter는 제외
    if (funcName?.startsWith('get')) continue;

    if (params && params.trim().length > 0) {
      // 본문에서 파라미터가 쓰이는지 간단히 체크 (실제로는 더 정교한 분석 필요)
      const paramList = params.split(',').map(p => p.trim().split(':')[0].trim());
      const unused = paramList.every(p => !body.includes(p) || body.indexOf(p) === body.lastIndexOf(p)); // 선언부 제외
      if (unused) {
        violations.push({ id: 'FAKE_LOGIC_CONST', message: `[${funcName}] 파라미터를 사용하지 않고 상수만 반환하는 의심스러운 로직` });
      }
    }
  }

  return violations;
}
