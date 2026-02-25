import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';

describe('SemanticService (v2.0 Tools)', () => {
    const testProjectRoot = join(process.cwd(), '.test-semantic-project');
    let semantic: SemanticService;

    beforeEach(async () => {
        if (existsSync(testProjectRoot)) {
            rmSync(testProjectRoot, { recursive: true, force: true });
        }
        mkdirSync(testProjectRoot);
        mkdirSync(join(testProjectRoot, 'src'));

        // 테스트용 파일 생성
        const code = `
            export class Calculator {
                add(a: number, b: number) {
                    if (a > 0) return a + b;
                    return b;
                }
            }
            export function unusedFunction() {
                return 'I am dead';
            }
        `;
        const callerCode = `
            import { Calculator } from './main';
            const calc = new Calculator();
            console.log(calc.add(1, 2));
        `;

        writeFileSync(join(testProjectRoot, 'src/main.ts'), code);
        writeFileSync(join(testProjectRoot, 'src/caller.ts'), callerCode);
        writeFileSync(join(testProjectRoot, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { target: "esnext", module: "esnext", allowJs: true, skipLibCheck: true }
        }));

        semantic = new SemanticService(testProjectRoot);
        await semantic.ensureInitialized();
    });

    it('getSymbolMetrics는 파일 내 심볼과 복잡도를 추출해야 한다', () => {
        const metrics = semantic.getSymbolMetrics(join(testProjectRoot, 'src/main.ts'));
        expect(metrics.length).toBeGreaterThan(0);
        
        const addMethod = metrics.find(m => m.name === 'Calculator.add');
        expect(addMethod).toBeDefined();
        expect(addMethod?.complexity).toBe(2); // if문 1개 + 기본 1
    });

    it('getSymbolContent는 특정 심볼의 코드만 읽어야 한다', () => {
        const content = semantic.getSymbolContent(join(testProjectRoot, 'src/main.ts'), 'unusedFunction');
        expect(content).toContain("return 'I am dead'");
        expect(content).not.toContain('class Calculator');
    });

    it('findDeadCode는 참조가 없는 Export 심볼을 찾아야 한다', () => {
        const deadCodes = semantic.findDeadCode();
        expect(deadCodes.some(d => d.symbol === 'unusedFunction')).toBe(true);
        expect(deadCodes.some(d => d.symbol === 'Calculator')).toBe(false); // caller.ts에서 쓰임
    });

    it('analyzeImpact는 심볼 수정 시 영향을 받는 파일을 추적해야 한다', () => {
        const impact = semantic.analyzeImpact(join(testProjectRoot, 'src/main.ts'), 'Calculator');
        expect(impact.referencingFiles.some(f => f.includes('caller.ts'))).toBe(true);
    });

    it('findReferences는 특정 심볼의 모든 참조를 찾아야 한다', () => {
        const mainPath = join(testProjectRoot, 'src/main.ts');
        const refs = semantic.findReferences(mainPath, 'Calculator');
        expect(refs.length).toBeGreaterThan(0);
        expect(refs.some(r => r.file.includes('caller.ts'))).toBe(true);
    });

    it('goToDefinition은 특정 심볼의 정의 위치를 찾아야 한다', () => {
        const callerPath = join(testProjectRoot, 'src/caller.ts');
        const def = semantic.goToDefinition(callerPath, 'Calculator');
        expect(def).not.toBeNull();
        expect(def?.file).toContain('main.ts');
    });
});
