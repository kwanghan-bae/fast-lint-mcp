import { readFileSync, existsSync } from 'fs';
import { dirname, join, normalize } from 'path';
import glob from 'fast-glob';
import { Lang, parse } from '@ast-grep/napi';
import { resolveModulePath } from './PathResolver.js';

/**
 * 프로젝트 내 파일 간의 의존성 관계(Import/Export)를 분석하고 그래프 구조를 관리하는 클래스입니다.
 * 순환 참조 탐지 및 고아 파일(참조되지 않는 파일) 식별 기능을 제공합니다.
 */
export class DependencyGraph {
  // 파일별로 어떤 파일들을 임포트하고 있는지 저장하는 맵 (파일 -> 임포트 대상 목록)
  private importMap: Map<string, string[]> = new Map();
  // 특정 파일이 어떤 파일들에 의해 임포트되고 있는지 저장하는 맵 (파일 -> 자신을 사용하는 파일 목록)
  private dependentMap: Map<string, string[]> = new Map();

  /**
   * DependencyGraph 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 스캔하여 의존성 맵을 생성합니다.
   * fast-glob을 사용하여 파일을 찾고, 각 파일의 AST를 분석하여 임포트 구문을 추출합니다.
   */
  async build() {
    this.importMap.clear();
    this.dependentMap.clear();

    // src/ 디렉토리 내의 모든 TypeScript 및 JavaScript 파일을 찾습니다.
    const files = await glob(['src/**/*.{ts,js,tsx,jsx}'], {
      cwd: this.workspacePath,
      absolute: true,
    });
    const allFiles = files.map((f) => normalize(f));

    for (const file of allFiles) {
      // 각 파일에서 임포트 경로를 추출하고 절대 경로로 해소(resolve)합니다.
      const imports = this.extractImports(file, allFiles);
      this.importMap.set(file, imports);

      // 역의존성(dependent) 정보를 업데이트합니다.
      for (const imp of imports) {
        const deps = this.dependentMap.get(imp) || [];
        if (!deps.includes(file)) {
          deps.push(file);
          this.dependentMap.set(imp, deps);
        }
      }
    }
  }

  /**
   * 특정 파일을 임포트하고 있는 상위 파일(Dependents) 목록을 가져옵니다.
   * 증분 분석 시 변경된 파일의 영향 범위를 파악하는 데 사용됩니다.
   * @param filePath 대상 파일 경로
   */
  getDependents(filePath: string): string[] {
    return this.dependentMap.get(normalize(filePath)) || [];
  }

  /**
   * 그래프 구조를 순회하여 순환 참조(Circular Dependency)가 발생하는 경로를 모두 탐지합니다.
   * DFS(깊이 우선 탐색) 알고리즘과 재귀 스택을 사용하여 사이클을 식별합니다.
   * @returns 순환 경로들의 배열 (각 경로는 파일 배열)
   */
  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      stack.add(node);
      path.push(node);

      // 현재 노드가 임포트하는 이웃 노드들을 방문합니다.
      for (const neighbor of this.importMap.get(node) || []) {
        if (!visited.has(neighbor)) {
          // 아직 방문하지 않은 노드라면 DFS 계속 진행
          dfs(neighbor, [...path]);
        } else if (stack.has(neighbor)) {
          // 방문 중인 스택에 이미 있는 노드를 만났다면 순환 참조 발생
          const cycleStartIdx = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStartIdx), neighbor]);
        }
      }

      // 탐색이 완료된 노드는 스택에서 제거합니다.
      stack.delete(node);
    };

    // 모든 노드를 시작점으로 하여 DFS를 수행합니다.
    for (const node of this.importMap.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * 프로젝트 내에서 다른 어떤 파일에 의해서도 참조되지 않는 '고립된 파일' 목록을 찾습니다.
   * @returns 고아 파일 경로 배열
   */
  findOrphans(): string[] {
    const orphans: string[] = [];
    for (const [file, _] of this.importMap) {
      // 엔트리 포인트(index, main)는 참조되지 않아도 고아가 아님
      if (
        file.endsWith('index.ts') ||
        file.endsWith('index.js') ||
        file.endsWith('main.ts') ||
        file.endsWith('main.js')
      )
        continue;

      // 자신을 임포트하는 파일이 하나도 없는 경우 고아 파일로 간주
      if (!this.dependentMap.has(file) || this.dependentMap.get(file)?.length === 0) {
        orphans.push(file);
      }
    }
    return orphans;
  }

  /**
   * 파일의 소스 코드를 파싱하여 Import 및 Export 구문에서 대상 경로를 추출합니다.
   * ast-grep의 강력한 패턴 매칭을 사용하여 다양한 방식의 임포트를 탐지합니다.
   * @param filePath 분석할 파일의 절대 경로
   * @param allFiles 프로젝트 내 전체 파일 목록 (경로 해소용)
   */
  private extractImports(filePath: string, allFiles: string[]): string[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang =
        filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
      const ast = parse(lang, content);
      const root = ast.root();
      const imports: string[] = [];
      const dir = dirname(filePath);

      // 모든 임포트/엑스포트 패턴을 하나의 규칙으로 통합하여 Native Rust 레벨에서 한 번에 검색합니다.
      const importRule = {
        any: [
          { pattern: "import $A from '$B'" },
          { pattern: 'import $A from "$B"' },
          { pattern: "import { $$$ } from '$B'" },
          { pattern: 'import { $$$ } from "$B"' },
          { pattern: "export { $$$ } from '$B'" },
          { pattern: 'export { $$$ } from "$B"' },
          { pattern: "export * from '$B'" },
          { pattern: 'export * from "$B"' },
          { pattern: "import '$B'" },
          { pattern: 'import "$B"' },
        ],
      };

      try {
        const matches = root.findAll({ rule: importRule });
        for (const m of matches) {
          const source = m.getMatch('B')?.text();
          // 상대 경로(.) 또는 절대 경로(/)로 시작하는 임포트만 해소 대상으로 삼습니다.
          if (source && (source.startsWith('.') || source.startsWith('/'))) {
            const resolved = resolveModulePath(dir, source, allFiles);
            if (resolved) imports.push(resolved);
          }
        }
      } catch (e) {
        // 파싱 에러 시 무시
      }
      // 중복 제거 후 반환
      return [...new Set(imports)];
    } catch (e) {
      // 파일 읽기 실패 등 예외 발생 시 빈 배열 반환
      return [];
    }
  }
}
