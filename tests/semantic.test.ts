import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticService } from '../src/service/SemanticService.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('SemanticService (v3.7.5 Engine)', () => {
  // 테스트 간 충돌 방지를 위해 유니크한 경로 사용
  const testProjectRoot = join(process.cwd(), `temp_sem_${Math.random().toString(36).substring(7)}`);

  beforeEach(async () => {
    if (!existsSync(testProjectRoot)) mkdirSync(testProjectRoot, { recursive: true });
    if (!existsSync(join(testProjectRoot, 'src'))) mkdirSync(join(testProjectRoot, 'src'));
    const cache = AstCacheManager.getInstance();
    cache.clear();
    cache.enabled = false;
  });

  afterEach(() => {
    if (existsSync(testProjectRoot)) rmSync(testProjectRoot, { recursive: true, force: true });
  });

  it.skip('getSymbolMetrics는 파일 내 심볼과 복잡도를 추출해야 한다', async () => {
    const semantic = new SemanticService();
    // 테스트 대상 워크스페이스 명시적 초기화
    await semantic.ensureInitialized(true, testProjectRoot);
    
    const filePath = join(testProjectRoot, 'src/main.ts');
    const code = `
      class Calculator {
        add(a, b) {
          if (a) return a + b;
          return b;
        }
      }
      function unusedFunction() { return 'I am dead'; }
    `;
    writeFileSync(filePath, code);

    // 파일 작성 후 강제 재인덱싱
    await semantic.ensureInitialized(true, testProjectRoot);

    const metrics = semantic.getSymbolMetrics(filePath, true);
    expect(metrics.length).toBeGreaterThan(0);
    
    const addMethod = metrics.find(m => m.name.includes('add'));
    expect(addMethod).toBeDefined();
    expect(addMethod?.complexity).toBeGreaterThanOrEqual(2);
  });

  it('getSymbolContent는 특정 심볼의 코드만 읽어야 한다', async () => {
    const semantic = new SemanticService();
    const filePath = join(testProjectRoot, 'src/main.ts');
    const code = `function unusedFunction() { return 'I am dead'; }`;
    writeFileSync(filePath, code);

    const content = semantic.getSymbolContent(filePath, 'unusedFunction');
    expect(content).toContain("return 'I am dead'");
  });
});
