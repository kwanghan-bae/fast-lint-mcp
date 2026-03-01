import { dirname, normalize } from 'path';
import glob from 'fast-glob';
import { resolveModulePath } from './PathResolver.js';
import pMap from 'p-map';
import os from 'os';
import { AstCacheManager } from './AstCacheManager.js';

/**
 * 프로젝트 내 파일 간의 의존성 관계(Import/Export)를 분석하고 그래프 구조를 관리하는 클래스입니다.
 * p-map을 사용하여 멀티코어 환경에서 병렬로 의존성 맵을 구축합니다.
 */
export class DependencyGraph {
  /** 각 파일이 임포트하고 있는 대상 목록 (File -> Imports) */
  private importMap: Map<string, string[]> = new Map();
  /** 각 파일을 임포트하고 있는 상위 파일 목록 (File -> Dependents) */
  private dependentMap: Map<string, string[]> = new Map();

  /**
   * DependencyGraph 인스턴스를 생성합니다.
   * @param workspacePath 분석할 워크스페이스 절대 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 스캔하여 의존성 맵을 생성합니다.
   * v3.3 Turbo: 파싱 오버헤드를 제거하고 중복 스캔을 방지합니다.
   * @param providedFiles 이미 스캔된 파일 목록이 있다면 이를 활용합니다.
   */
  async build(providedFiles?: string[]) {
    this.importMap.clear();
    this.dependentMap.clear();

    let allFiles: string[] = [];
    if (providedFiles) {
      allFiles = providedFiles.map((f) => normalize(f));
    } else {
      const files = await glob(['**/*.{ts,js,tsx,jsx,kt,kts}'], {
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
          '**/.git/**',
        ],
      });
      allFiles = files.map((f) => normalize(f));
    }

    const concurrency = Math.max(1, os.cpus().length - 1);

    await pMap(
      allFiles,
      async (file) => {
        const imports = await this.extractImports(file, allFiles);
        this.importMap.set(file, imports);

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
   * @param filePath 대상 파일 경로
   */
  getDependents(filePath: string): string[] {
    return this.dependentMap.get(normalize(filePath)) || [];
  }

  /**
   * 프로젝트 내의 순환 참조(Circular Dependency)를 탐지합니다.
   * v3.3.2: 고성능 스택 기반 DFS 알고리즘을 사용하여 분석 속도를 높였습니다.
   */
  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const currentPath: string[] = [];
    const cycles: string[][] = [];

    const dfs = (node: string) => {
      if (node.includes('node_modules')) return;
      if (stack.has(node)) {
        const cycleStartIdx = currentPath.indexOf(node);
        cycles.push([...currentPath.slice(cycleStartIdx), node]);
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      currentPath.push(node);

      const neighbors = this.importMap.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }

      currentPath.pop();
      stack.delete(node);
    };

    for (const node of this.importMap.keys()) {
      dfs(node);
    }
    return cycles;
  }

  /**
   * 특정 파일의 임포트/익스포트 구문을 분석하여 의존 경로를 추출합니다.
   * @param filePath 분석할 소스 파일 경로
   * @param allFiles 프로젝트 내 전체 파일 목록 (경로 해소용)
   */
  private async extractImports(filePath: string, allFiles: string[]): Promise<string[]> {
    try {
      const root = AstCacheManager.getInstance().getRootNode(filePath);
      if (!root) return [];

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
