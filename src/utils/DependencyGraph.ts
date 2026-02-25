import { readFileSync, existsSync } from 'fs';
import { dirname, join, normalize, relative, extname } from 'path';
import glob from 'fast-glob';
import { Lang, parse } from '@ast-grep/napi';
import { resolveModulePath } from './PathResolver.js';

export class DependencyGraph {
    private importMap: Map<string, string[]> = new Map(); // file -> what it imports
    private dependentMap: Map<string, string[]> = new Map(); // file -> what imports it

    constructor(private workspacePath: string = process.cwd()) {}

    /**
     * 내장 Rust 엔진(@ast-grep/napi)을 사용하여 의존성 그래프를 고속으로 빌드합니다.
     * 사용자는 별도의 Rust 설치가 필요 없습니다.
     */
    async build() {
        this.importMap.clear();
        this.dependentMap.clear();

        const files = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: this.workspacePath });
        const allFiles = files.map(f => normalize(join(this.workspacePath, f)));

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
        const normalizedPath = normalize(filePath);
        return this.dependentMap.get(normalizedPath) || [];
    }

    private extractImports(filePath: string, allFiles: string[]): string[] {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
            
            // 내장 Rust 엔진을 사용한 고속 파싱
            const ast = parse(lang, content);
            const root = ast.root();
            const imports: string[] = [];
            const dir = dirname(filePath);

            // import 및 export from 구문 추출 (중괄호 및 다양한 스타일 지원)
            const patterns = [
                "import $A from '$B'",
                "import $A from \"$B\"",
                "import { $$$ } from '$B'",
                "import { $$$ } from \"$B\"",
                "export { $$$ } from '$B'",
                "export { $$$ } from \"$B\"",
                "export * from '$B'",
                "export * from \"$B\"",
                "import '$B'",
                "import \"$B\""
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
                } catch (e) {
                    // Skip invalid patterns
                }
            }
            
            return [...new Set(imports)];
        } catch (e) {
            return [];
        }
    }
}
