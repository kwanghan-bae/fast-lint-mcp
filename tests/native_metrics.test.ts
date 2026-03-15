import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFileMetricsNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Semantic Metrics (Commit 6.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_metrics');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('파일의 복잡도와 라인 수를 정확히 계산해야 한다', () => {
    const filePath = join(testDir, 'complex.ts');
    const code = 
      'function test(a) {\n' +
      '  if (a > 0 && a < 10) {\n' +
      '    for (let i=0; i<a; i++) {\n' +
      '       console.log(i);\n' +
      '    }\n' +
      '  } else if (a === 0) {\n' +
      '    return 0;\n' +
      '  }\n' +
      '  return 1;\n' +
      '}\n';
    
    writeFileSync(filePath, code);

    const result = getFileMetricsNative(filePath);
    expect(result).toBeDefined();
    // 복잡도 예상: 1(base) + if(1) + &&(1) + for(1) + else if(1) = 5
    expect(result?.complexity).toBe(5);
    expect(result?.lines).toBe(10);
  });
});
