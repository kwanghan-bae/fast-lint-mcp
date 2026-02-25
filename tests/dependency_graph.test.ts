import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, normalize } from 'path';

describe('DependencyGraph (Native Rust Engine)', () => {
    const testDir = join(process.cwd(), 'temp_dep_test');

    beforeEach(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        if (!existsSync(join(testDir, 'src'))) mkdirSync(join(testDir, 'src'), { recursive: true });
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('import 구문을 정확히 파싱하여 의존성 그래프를 빌드해야 한다', async () => {
        const fileA = normalize(join(testDir, 'src/A.ts'));
        const fileB = normalize(join(testDir, 'src/B.ts'));
        const fileC = normalize(join(testDir, 'src/C.ts'));

        // B는 A를 import 함
        writeFileSync(fileA, 'export const a = 1;');
        writeFileSync(fileB, "import { a } from './A';\nexport const b = a + 1;");
        // C는 B를 import 함
        writeFileSync(fileC, "import { b } from './B';\nconsole.log(b);");

        const graph = new DependencyGraph(testDir);
        await graph.build();

        // A를 import 하는 파일은 B여야 함
        const dependentsOfA = graph.getDependents(fileA);
        expect(dependentsOfA).toContain(normalize(fileB));
        expect(dependentsOfA).not.toContain(normalize(fileC));

        // B를 import 하는 파일은 C여야 함
        const dependentsOfB = graph.getDependents(fileB);
        expect(dependentsOfB).toContain(normalize(fileC));
    });

    it('export from 구문도 의존성으로 인식해야 한다', async () => {
        const fileA = normalize(join(testDir, 'src/A.ts'));
        const fileIndex = normalize(join(testDir, 'src/index.ts'));

        writeFileSync(fileA, 'export const a = 1;');
        writeFileSync(fileIndex, "export { a } from './A';");

        const graph = new DependencyGraph(testDir);
        await graph.build();

        const dependentsOfA = graph.getDependents(fileA);
        expect(dependentsOfA).toContain(normalize(fileIndex));
    });
});
