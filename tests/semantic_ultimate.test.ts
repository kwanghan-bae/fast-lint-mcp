import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, normalize } from 'path';

describe('Semantic Service Ultimate Test (Syntax Matrix)', () => {
    const testRoot = join(process.cwd(), '.ultimate-test-project');
    let service: SemanticService;

    beforeEach(async () => {
        if (!existsSync(testRoot)) mkdirSync(testRoot, { recursive: true });
        if (!existsSync(join(testRoot, 'src'))) mkdirSync(join(testRoot, 'src'), { recursive: true });
        service = new SemanticService(testRoot);
    });

    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    it('현대 TS/JS의 모든 내보내기 및 선언 방식을 탐지해야 한다', async () => {
        const code = `
export default class DefaultClass { init() {} }
export default function defaultFunc() {}
export const arrow = () => {};
export function namedFunc() {}
class DecoTest {
    decoratedMethod() { return 1; }
}
function complexParams(a, b = 1, ...rest) { return a + b; }
        `;
        const filePath = normalize(join(testRoot, 'src/matrix.ts'));
        writeFileSync(filePath, code.trim());
        await service.ensureInitialized();

        const metrics = service.getSymbolMetrics(filePath);
        const names = metrics.map(m => m.name);

        expect(names).toContain('DefaultClass');
        expect(names).toContain('DefaultClass.init');
        expect(names).toContain('defaultFunc');
        expect(names).toContain('arrow');
        expect(names).toContain('namedFunc');
        expect(names).toContain('DecoTest.decoratedMethod');
        expect(names).toContain('complexParams');
    });

    it('TSX (React) 구문을 정상적으로 처리해야 한다', async () => {
        const code = `
export const MyComponent = ({ title }) => {
    const handleClick = () => console.log(title);
    return <div>{title}</div>;
};
export function ClassComponent() {
    return <h1>Hello</h1>;
}
        `;
        const filePath = normalize(join(testRoot, 'src/component.tsx'));
        writeFileSync(filePath, code.trim());
        await service.ensureInitialized();

        const metrics = service.getSymbolMetrics(filePath);
        const names = metrics.map(m => m.name);

        expect(names).toContain('MyComponent');
        expect(names).toContain('handleClick');
        expect(names).toContain('ClassComponent');
    });

    it('초대형 파일에서도 성능과 안정성을 유지해야 한다', async () => {
        let bigCode = '';
        for (let i = 0; i < 500; i++) {
            bigCode += `function func${i}() { return ${i}; }\n`;
        }
        const filePath = normalize(join(testRoot, 'src/big.ts'));
        writeFileSync(filePath, bigCode);
        
        const start = Date.now();
        await service.ensureInitialized();
        const metrics = service.getSymbolMetrics(filePath);
        const end = Date.now();

        expect(metrics).toHaveLength(500);
        expect(end - start).toBeLessThan(2000); 
    });
});
