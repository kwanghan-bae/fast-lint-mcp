import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import { dirname, join, normalize } from 'path';
import glob from 'fast-glob';
import { Lang, parse } from '@ast-grep/napi';
import { resolveModulePath } from './PathResolver.js';
import pMap from 'p-map';
import os from 'os';

const readFileAsync = promisify(readFile);

/**
 * 프로젝트 내 파일 간의 의존성 관계(Import/Export)를 분석하고 그래프 구조를 관리하는 클래스입니다.
 * p-map을 사용하여 멀티코어 환경에서 병렬로 의존성 맵을 구축합니다.
 */
export class DependencyGraph {
  // 파일별로 어떤 파일들을 임포트하고 있는지 저장하는 맵
  private importMap: Map<string, string[]> = new Map();
  // 특정 파일이 어떤 파일들에 의해 임포트되고 있는지 저장하는 맵
  private dependentMap: Map<string, string[]> = new Map();

  /**
   * DependencyGraph 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 스캔하여 의존성 맵을 생성합니다.
   * v3.2 Turbo: 멀티모듈 구조를 완벽히 지원하며, 빌드 결과물은 스캔에서 원천 차단합니다.
   */
  async build() {
    this.importMap.clear();
    this.dependentMap.clear();

    // 1. 초고속 파일 스캔 (빌드 폴더 및 node_modules는 탐색조차 하지 않음)
    const files = await glob(['**/*.{ts,js,tsx,jsx}'], {
      cwd: this.workspacePath,
      absolute: true,
      ignore: [
        '**/node_modules/**', 
        '**/dist/**', 
        '**/build/**', 
        '**/out/**', 
        '**/.next/**', 
        '**/coverage/**',
        '**/android/**',
        '**/ios/**',
        '**/.git/**'
      ]
    });
    const allFiles = files.map((f) => normalize(f));

    // 2. 풀 코어 병렬 분석
    const concurrency = Math.max(1, os.cpus().length - 1);

    await pMap(
      allFiles,
      async (file) => {
        const imports = await this.extractImports(file, allFiles);
        this.importMap.set(file, imports);

        // 역의존성 맵 구축 (동기적 조작으로 안전성 확보)
        for (const imp of imports) {
          if (!this.dependentMap.has(imp)) {
            this.dependentMap.set(imp, []);
          }
          const deps = this.dependentMap.get(imp)!;
          if (!deps.includes(file)) {
            deps.push(file);
          }
        }
      },
      { concurrency }
    );
  }

  /**
   * 특정 파일을 임포트하고 있는 상위 파일(Dependents) 목록을 가져옵니다.
   */
  getDependents(filePath: string): string[] {
    return this.dependentMap.get(normalize(filePath)) || [];
  }

  /**
   * 순환 참조(Circular Dependency)를 탐지합니다.
   */
  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of this.importMap.get(node) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (stack.has(neighbor)) {
          const cycleStartIdx = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStartIdx), neighbor]);
        }
      }
      stack.delete(node);
    };

    for (const node of this.importMap.keys()) {
      if (!visited.has(node)) dfs(node, []);
    }
    return cycles;
  }

  /**
   * 다른 파일에서 참조되지 않는 고아 파일을 찾습니다.
   */
  findOrphans(): string[] {
    const orphans: string[] = [];
    for (const [file, _] of this.importMap) {
      if (file.match(/index\.[jt]s$/) || file.match(/main\.[jt]s$/)) continue;
      if (!this.dependentMap.has(file) || this.dependentMap.get(file)?.length === 0) {
        orphans.push(file);
      }
    }
    return orphans;
  }

  /**
   * 파일의 임포트 구문을 비동기적으로 추출합니다.
   */
  private async extractImports(filePath: string, allFiles: string[]): Promise<string[]> {
    try {
      const content = await readFileAsync(filePath, 'utf-8');
      const lang = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? Lang.TypeScript : Lang.JavaScript;
      const root = parse(lang, content).root();
      const imports: string[] = [];
      const dir = dirname(filePath);

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
          if (source) {
            // v3.2: Context-Aware Path Resolution (supports sub-project aliases)
            const resolved = resolveModulePath(dir, source, allFiles, undefined, filePath);
            if (resolved) imports.push(resolved);
          }
        }
      } catch (e) {}
      return [...new Set(imports)];
    } catch (e) {
      return [];
    }
  }
}
