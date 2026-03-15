import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SymbolIndexer } from '../src/utils/SymbolIndexer.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SymbolIndexer (Precision Deep Scan)', () => {
  const testDir = join(process.cwd(), 'temp_indexer_test');
  let indexer: SymbolIndexer;

  beforeEach(async () => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    indexer = new SymbolIndexer();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('프로젝트 전체 심볼을 정확히 인덱싱하고 정의를 찾아야 한다', async () => {
    // 1. 테스트 파일 생성
    const fileA = join(testDir, 'math.ts');
    const codeA = `
      export function add(a: number, b: number): number {
        return a + b;
      }
      export class Calculator {
        multiply(a: number, b: number): number {
          return a * b;
        }
      }
    `;
    writeFileSync(fileA, codeA);

    const fileB = join(testDir, 'main.ts');
    const codeB = `
      import { add, Calculator } from './math';
      const result = add(1, 2);
      const calc = new Calculator();
      calc.multiply(3, 4);
    `;
    writeFileSync(fileB, codeB);

    // 2. 인덱싱 실행
    await indexer.indexAll(testDir);
    expect(indexer.isIndexed).toBe(true);

    // 3. 정의(Definition) 검증
    const addDef = indexer.getDefinition('add');
    expect(addDef).not.toBeNull();
    expect(addDef?.file).toBe(fileA);
    expect(addDef?.line).toBe(2);

    const multiplyDef = indexer.getDefinition('Calculator.multiply');
    expect(multiplyDef).not.toBeNull();
    expect(multiplyDef?.file).toBe(fileA);
    expect(multiplyDef?.line).toBe(6);

    // 4. 참조(References) 검증
    const addRefs = indexer.findReferences('add');
    // 선언부 1개 + 호출부 1개 + 임포트 1개 = 3개 예상
    expect(addRefs.length).toBeGreaterThanOrEqual(2);
    expect(addRefs.some((r) => r.file === fileB)).toBe(true);

    // 5. 공개 심볼 검증
    const exported = indexer.getAllExportedSymbols();
    expect(exported.some((s) => s.name === 'add')).toBe(true);
    expect(exported.some((s) => s.name === 'Calculator')).toBe(true);
  });

  it('변수 선언 및 할당을 인덱싱해야 한다', async () => {
    const filePath = join(testDir, 'vars.ts');
    const code = `
      const myVar = 10;
      let otherVar = "hello";
      var legacyVar = true;
    `;
    writeFileSync(filePath, code);
    await indexer.indexAll(testDir);

    expect(indexer.getDefinition('myVar')).not.toBeNull();
    expect(indexer.getDefinition('otherVar')).not.toBeNull();
    expect(indexer.getDefinition('legacyVar')).not.toBeNull();
  });

  it('존재하지 않는 심볼 조회 시 안전하게 처리해야 한다', () => {
    expect(indexer.getDefinition('nonExistent')).toBeNull();
    expect(indexer.findReferences('nonExistent')).toEqual([]);
  });
});
