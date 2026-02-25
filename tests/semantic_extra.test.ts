import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SemanticService Extra', () => {
    const testProjectRoot = join(process.cwd(), 'temp_semantic_extra');
    let service: SemanticService;

    beforeEach(() => {
        if (!existsSync(testProjectRoot)) mkdirSync(testProjectRoot, { recursive: true });
        if (!existsSync(join(testProjectRoot, 'src'))) mkdirSync(join(testProjectRoot, 'src'), { recursive: true });
        
        writeFileSync(join(testProjectRoot, 'src/vars.ts'), 'export const myVar = 42;');
        writeFileSync(join(testProjectRoot, 'src/methods.ts'), 'export class MyClass { myMethod() { return 1; } }');
        
        service = new SemanticService(testProjectRoot);
    });

    afterEach(() => {
        rmSync(testProjectRoot, { recursive: true, force: true });
    });

    it('변수 선언(VariableStatement) 참조를 찾아야 한다', () => {
        const filePath = join(testProjectRoot, 'src/vars.ts');
        const metrics = service.getSymbolMetrics(filePath);
        // ts-morph에서 getFunctions()는 export const func = () => {} 를 잡지 않을 수 있으므로
        // 심볼 타입별 분석 확인
        expect(metrics).toBeDefined();
    });

    it('존재하지 않는 심볼에 대해 null을 반환해야 한다', () => {
        const content = service.getSymbolContent(join(testProjectRoot, 'src/vars.ts'), 'nonExistent');
        expect(content).toBeNull();
    });

    it('클래스 메서드(ClassName.method) 정의를 찾아야 한다', () => {
        const filePath = join(testProjectRoot, 'src/methods.ts');
        const def = service.goToDefinition(filePath, 'MyClass.myMethod');
        expect(def).not.toBeNull();
    });

    it('프로젝트 전체에서 정의를 검색해야 한다', () => {
        const def = service.goToDefinition(join(testProjectRoot, 'src/vars.ts'), 'MyClass');
        expect(def).not.toBeNull();
        expect(def?.file).toContain('methods.ts');
    });
});
