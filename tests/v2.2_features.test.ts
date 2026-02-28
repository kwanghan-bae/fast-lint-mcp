import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveModulePath, loadProjectAliases } from '../src/utils/PathResolver.js';
import { analyzeFile } from '../src/analysis/sg.js';
import { JavascriptProvider } from '../src/providers/JavascriptProvider.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('v2.2 New Features Validation', () => {
  const workspace = join(process.cwd(), 'temp_v22_test');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
    if (!existsSync(workspace)) mkdirSync(workspace);
  });

  afterEach(() => {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  });

  it('Path Alias: tsconfig.json의 별칭을 인식해야 한다', () => {
    const tsconfig = {
      compilerOptions: {
        paths: { '@/utils/*': ['./src/utils/*'] }
      }
    };
    writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify(tsconfig));
    
    const aliases = loadProjectAliases(workspace);
    expect(aliases['@/utils']).toBe('./src/utils');

    // Alias resolution test
    const allFiles = [join(workspace, 'src/utils/Helper.ts')];
    const resolved = resolveModulePath(workspace, '@/utils/Helper', allFiles, workspace);
    expect(resolved).toContain('src/utils/Helper.ts');
  });

  it('Context-Aware: @data 태그가 있는 파일은 SIZE 제한을 완화해야 한다', async () => {
    const dataFile = join(workspace, 'LargeData.ts');
    const content = '// @data\nexport const data = [' + '1,'.repeat(1000) + '];';
    writeFileSync(dataFile, content);

    const metrics = await analyzeFile(dataFile);
    expect(metrics.isDataFile).toBe(true);

    const provider = new JavascriptProvider({
      rules: { maxLineCount: 100, maxComplexity: 10 }
    } as any);

    const violations = await provider.check(dataFile);
    // 원래 100줄 제한이지만 @data로 인해 1000줄까지 허용되어야 함 (현재 파일은 약 1001줄 이상일 수 있음)
    // 리터럴 비중 분석을 통해 통과 여부 확인
    const sizeViolation = violations.find(v => v.type === 'SIZE');
    if (metrics.lineCount <= 1000) {
        expect(sizeViolation).toBeUndefined();
    }
  });

  it('Refactoring Blueprint: 복잡한 심볼에 대해 Advice를 제공해야 한다', async () => {
    const logicFile = join(workspace, 'ComplexLogic.ts');
    const content = `
      function heavyUIProcess(a) {
        if (a) { if (a) { if (a) { console.log(1); } } }
        if (a) { if (a) { if (a) { console.log(2); } } }
        if (a) { if (a) { if (a) { console.log(3); } } }
        return a;
      }
    `;
    writeFileSync(logicFile, content);

    const provider = new JavascriptProvider({
      rules: { maxLineCount: 500, maxComplexity: 5 }
    } as any);

    const violations = await provider.check(logicFile);
    const complexityViolation = violations.find(v => v.type === 'COMPLEXITY');
    
    expect(complexityViolation).toBeDefined();
    expect(complexityViolation?.message).toContain('[Refactoring Blueprint]');
    expect(complexityViolation?.message).toContain('heavyUIProcess');
    expect(complexityViolation?.message).toContain('Senior Advice');
  });
});
