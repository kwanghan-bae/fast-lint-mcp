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
  private importMap: Map<string, string[]> = new Map();
  private dependentMap: Map<string, string[]> = new Map();

  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 스캔하여 의존성 맵을 생성합니다.
   * v3.3 Turbo: 파싱 오버헤드를 제거하고 중복 스캔을 방지합니다.
   */
  async build(providedFiles?: string[]) {
    this.importMap.clear();
    this.dependentMap.clear();

    let allFiles: string[] = [];
    if (providedFiles) {
      allFiles = providedFiles.map(f => normalize(f));
    } else {
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

  getDependents(filePath: string): string[] {
    return this.dependentMap.get(normalize(filePath)) || [];
  }

  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]) => {
      // v3.3.1: node_modules 등 외부 파일은 순환 참조 분석에서 제외하여 노이즈 차단
      if (node.includes('node_modules')) return;

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
