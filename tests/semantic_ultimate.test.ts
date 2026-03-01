import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('Semantic Service Ultimate Test (v3.7.5 Syntax Matrix)', () => {
  const testProjectRoot = join(process.cwd(), `temp_ult_${Math.random().toString(36).substring(7)}`);

  beforeEach(() => {
    if (!existsSync(testProjectRoot)) mkdirSync(testProjectRoot, { recursive: true });
    const cache = AstCacheManager.getInstance();
    cache.clear();
    cache.enabled = false;
  });

  afterEach(() => {
    if (existsSync(testProjectRoot)) rmSync(testProjectRoot, { recursive: true, force: true });
  });

  it.skip('현대 TS/JS의 모든 내보내기 및 선언 방식을 탐지해야 한다', async () => {
    const semantic = new SemanticService();
    const filePath = join(testProjectRoot, 'syntax.ts');
    const code = `
      export default class DefaultClass { init() {} }
      export function defaultFunc() {}
      export const arrow = () => {};
      const namedFunc = function() {};
    `;
    writeFileSync(filePath, code);

    await semantic.ensureInitialized(true, testProjectRoot);

    const metrics = semantic.getSymbolMetrics(filePath, true);
    const names = metrics.map(m => m.name);

    expect(names).toContain('DefaultClass');
    expect(names).toContain('DefaultClass.init');
    expect(names).toContain('defaultFunc');
    expect(names).toContain('arrow');
  });

  it.skip('초대형 파일에서도 성능과 안정성을 유지해야 한다', async () => {
    const semantic = new SemanticService();
    const filePath = join(testProjectRoot, 'Large.ts');
    const functions = Array.from({ length: 100 }, (_, i) => `function func${i}() { return ${i}; }`).join('\n');
    writeFileSync(filePath, functions);

    const start = Date.now();
    const metrics = semantic.getSymbolMetrics(filePath, true);
    const end = Date.now();

    expect(metrics.length).toBeGreaterThanOrEqual(100);
    expect(end - start).toBeLessThan(1000); 
  });
});
