import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkFakeLogic } from '../src/analysis/import-check.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('v4.3 Shorthand Property 정밀도 검증', () => {
  const testDir = join(process.cwd(), 'temp_v43_verify');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('[FAKE_LOGIC] 객체 단축 속성(Shorthand Property)으로 사용된 파라미터를 정상으로 인지해야 한다', async () => {
    const filePath = join(testDir, 'AnalysisService.ts');
    const code = `
      export class AnalysisService {
        public static calculateADX(high, low, close, period = 14) {
          // high, low, close, period가 객체 단축 속성으로 사용됨
          return ADX.calculate({ high, low, close, period });
        }
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkFakeLogic(filePath);

    // v4.3.0 엔진은 { high } 패턴을 인식하여 위반을 보고하지 않아야 함
    expect(violations.length).toBe(0);
  });

  it('[FAKE_LOGIC] 일반 객체 속성 값으로 할당된 파라미터도 정상으로 인지해야 한다', async () => {
    const filePath = join(testDir, 'NormalAssign.ts');
    const code = `
      function assignValue(param) {
        const obj = { key: param }; // 일반 할당
        return obj;
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkFakeLogic(filePath);
    expect(violations.length).toBe(0);
  });
});
