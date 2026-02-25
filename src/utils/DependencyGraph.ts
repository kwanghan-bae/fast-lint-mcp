import { readFileSync, existsSync } from 'fs';
import { dirname, join, normalize } from 'path';
import glob from 'fast-glob';
import { Lang, parse } from '@ast-grep/napi';
import { resolveModulePath } from './PathResolver.js';

export class DependencyGraph {
    private importMap: Map<string, string[]> = new Map(); // file -> what it imports
    private dependentMap: Map<string, string[]> = new Map(); // file -> what imports it

    constructor(private workspacePath: string = process.cwd()) {}

    async build() {
        this.importMap.clear();
        this.dependentMap.clear();

        const files = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: this.workspacePath, absolute: true });
        const allFiles = files.map(f => normalize(f));

        for (const file of allFiles) {
            const imports = this.extractImports(file, allFiles);
            this.importMap.set(file, imports);

            for (const imp of imports) {
                const deps = this.dependentMap.get(imp) || [];
                if (!deps.includes(file)) {
                    deps.push(file);
                    this.dependentMap.set(imp, deps);
                }
            }
        }
    }

    getDependents(filePath: string): string[] {
        return this.dependentMap.get(normalize(filePath)) || [];
    }

    /**
     * 순환 참조를 탐지합니다. (DFS 기반)
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
            if (!visited.has(node)) {
                dfs(node, []);
            }
        }

        return cycles;
    }

    /**
     * 참조되지 않는 고립된 파일들을 찾습니다.
     */
    findOrphans(): string[] {
        const orphans: string[] = [];
        for (const [file, _] of this.importMap) {
            // 진입점 파일(index.ts 등)은 제외
            if (file.endsWith('index.ts') || file.endsWith('index.js')) continue;
            
            if (!this.dependentMap.has(file) || this.dependentMap.get(file)?.length === 0) {
                orphans.push(file);
            }
        }
        return orphans;
    }

    private extractImports(filePath: string, allFiles: string[]): string[] {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
            const ast = parse(lang, content);
            const root = ast.root();
            const imports: string[] = [];
            const dir = dirname(filePath);

            const patterns = [
                "import $A from '$B'", "import $A from \"$B\"",
                "import { $$$ } from '$B'", "import { $$$ } from \"$B\"",
                "export { $$$ } from '$B'", "export { $$$ } from \"$B\"",
                "export * from '$B'", "export * from \"$B\"",
                "import '$B'", "import \"$B\""
            ];

            for (const pattern of patterns) {
                try {
                    const matches = root.findAll(pattern);
                    for (const m of matches) {
                        const source = m.getMatch('B')?.text();
                        if (source && (source.startsWith('.') || source.startsWith('/'))) {
                            const resolved = resolveModulePath(dir, source, allFiles);
                            if (resolved) imports.push(resolved);
                        }
                    }
                } catch (e) {}
            }
            return [...new Set(imports)];
        } catch (e) {
            return [];
        }
    }
}
