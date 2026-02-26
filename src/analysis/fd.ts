import glob from 'fast-glob';
import { readFileSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { join, dirname, normalize } from 'path';
import { resolveModulePath } from '../utils/PathResolver.js';

/**
 * 프로젝트 내의 모든 의존성 관계를 추출하여 맵(Map) 형태로 생성합니다.
 * @param workspacePath 프로젝트 루트 경로
 * @returns 파일 경로를 키로 하고, 해당 파일이 임포트하는 대상 목록을 값으로 하는 Map
 */
export async function getDependencyMap(
  workspacePath: string = process.cwd()
): Promise<Map<string, string[]>> {
  // src 디렉토리 하위의 모든 소스 파일을 탐색합니다.
  const rawFiles = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath });
  const allFiles = rawFiles.map((f) => normalize(f));

  const depMap = new Map<string, string[]>();

  for (const filePath of allFiles) {
    const fullPath = join(workspacePath, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    const lang =
      filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;

    // 소스 코드를 AST로 파싱합니다.
    const ast = parse(lang, content);
    const root = ast.root();
    const deps: string[] = [];

    /**
     * 다양한 형태의 Import 및 Export from 구문을 탐지하기 위한 ast-grep 패턴들입니다.
     * Wildcard($$$)와 Named Placeholder($SOURCE)를 사용하여 유연하게 매칭합니다.
     */
    const patterns = [
      "import $CLAUSE from '$SOURCE'",
      "import { $$$ } from '$SOURCE'",
      "import * as $NS from '$SOURCE'",
      "import '$SOURCE'",
      "export $$$ARGS from '$SOURCE'",
      "export { $$$ } from '$SOURCE'",
      'import($SOURCE)', // 동적 임포트
      'require($SOURCE)', // CommonJS 방식
    ];

    for (const pattern of patterns) {
      try {
        const matches = root.findAll(pattern);
        for (const match of matches) {
          let importPath = match.getMatch('SOURCE')?.text();

          // 따옴표 제거 및 공백 정리
          if (importPath) {
            importPath = importPath.replace(/^['"]|['"]$/g, '').trim();
          }

          // 상대 경로로 시작하는 임포트인 경우 실제 파일 경로로 해소합니다.
          if (importPath && importPath.startsWith('.')) {
            const resolved = resolveModulePath(dirname(filePath), importPath, allFiles);
            if (resolved) {
              deps.push(normalize(resolved));
            }
          }
        }
      } catch (e) {
        // 특정 패턴에서 파싱 오류 발생 시 해당 패턴만 건너뜁니다.
      }
    }

    // 중복된 임포트 경로를 제거하고 맵에 저장합니다.
    depMap.set(filePath, [...new Set(deps)]);
  }

  return depMap;
}

/**
 * 프로젝트 내의 어떤 파일에서도 참조되지 않는 '고아 파일(Orphan Files)'을 찾아냅니다.
 * @param workspacePath 프로젝트 루트 경로
 * @returns 고아 파일 경로들의 배열
 */
export async function findOrphanFiles(workspacePath: string = process.cwd()): Promise<string[]> {
  const depMap = await getDependencyMap(workspacePath);
  const referenced = new Set<string>();

  // 모든 파일의 의존성 목록을 순회하며 '참조된' 파일들의 집합을 만듭니다.
  for (const deps of depMap.values()) {
    for (const dep of deps) {
      referenced.add(dep);
    }
  }

  // 프로젝트의 진입점(Entry Points)들은 참조되지 않아도 고아가 아닙니다.
  const entryPoints = [
    normalize('src/index.ts'),
    normalize('src/index.js'),
    normalize('src/main.ts'),
    normalize('src/main.js'),
  ];

  for (const entry of entryPoints) {
    if (depMap.has(entry)) {
      referenced.add(entry);
    }
  }

  const orphans: string[] = [];
  // 전체 파일 중 참조 집합(Set)에 포함되지 않은 파일들을 고아로 판정합니다.
  for (const file of depMap.keys()) {
    if (!referenced.has(file)) {
      orphans.push(file);
    }
  }

  return orphans;
}
