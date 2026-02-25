import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, normalize } from 'path';

describe('Semantic Service Stress Test (Edge Cases)', () => {
    const testRoot = join(process.cwd(), '.stress-test-project');
    let service: SemanticService;

    beforeEach(async () => {
        if (!existsSync(testRoot)) mkdirSync(testRoot, { recursive: true });
        if (!existsSync(join(testRoot, 'src'))) mkdirSync(join(testRoot, 'src'), { recursive: true });
        service = new SemanticService(testRoot);
    });

    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    it('다양한 함수 선언 방식을 누락 없이 탐지해야 한다', async () => {
        const code = `
            export async function asyncFunc<T>(a: T): Promise<T> { return a; }
            const arrowFunc = (x: number) => x * 2;
            export const namedArrow = (y: string): void => { console.log(y); };
            function regularFunc() { return true; }
            class Test {
                public static staticMethod() {}
                private privateMethod() {}
                async asyncMethod() {}
            }
        `;
        const filePath = normalize(join(testRoot, 'src/complex.ts'));
        writeFileSync(filePath, code);
        await service.ensureInitialized();

        const metrics = service.getSymbolMetrics(filePath);
        const names = metrics.map(m => m.name);

        expect(names).toContain('asyncFunc');
        expect(names).toContain('arrowFunc');
        expect(names).toContain('namedArrow');
        expect(names).toContain('regularFunc');
        expect(names).toContain('Test.staticMethod');
        expect(names).toContain('Test.privateMethod');
        expect(names).toContain('Test.asyncMethod');
    });

    it('중첩된 제어문에서도 복잡도를 정확히 계산해야 한다', async () => {
        const code = `
            function complexLogic(a, b) {
                if (a) {
                    if (b) {
                        for(let i=0; i<10; i++) {
                            while(true) { break; }
                        }
                    }
                }
                return a && b || false;
            }
        `;
        const filePath = normalize(join(testRoot, 'src/complexity.ts'));
        writeFileSync(filePath, code);
        await service.ensureInitialized();

        const metrics = service.getSymbolMetrics(filePath);
        const logic = metrics.find(m => m.name === 'complexLogic');
        
        expect(logic?.complexity).toBeGreaterThanOrEqual(5);
    });

    it('다양한 모듈 참조 방식을 의존성 그래프에 반영해야 한다', async () => {
        const codeA = `export const a = 1; export default a;`;
        const codeB = `
            import { a as aliasedA } from './A';
            import defaultA from './A';
            import * as allA from './A';
            export { a } from './A';
        `;
        const fileA = normalize(join(testRoot, 'src/A.ts'));
        const fileB = normalize(join(testRoot, 'src/B.ts'));
        writeFileSync(fileA, codeA);
        writeFileSync(fileB, codeB);
        
        await service.ensureInitialized();
        const dependents = service.getDependents(fileA);
        expect(dependents).toContain(fileB);
    });
});
