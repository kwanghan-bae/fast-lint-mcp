import { readFileSync } from 'fs';
import { extractImportsFromFile } from './src/analysis/import-check.js';
import { verifyHallucinationNative } from './native/index.js';
import { builtinModules } from 'module';
import { join } from 'path';

// debug 함수는 내부 로직을 처리합니다.
async function debug() {
  console.log('--- 1. 임포트 추출 테스트 ---');
  const testJsContent = readFileSync('test.js', 'utf-8');
  const testJsImports = extractImportsFromFile(testJsContent);
  console.log('test.js 추출된 임포트:', testJsImports);

  const stateTsContent = readFileSync('src/state.ts', 'utf-8');
  const stateTsImports = extractImportsFromFile(stateTsContent);
  console.log('src/state.ts 추출된 임포트:', stateTsImports);

  console.log('\n--- 2. 네이티브 엔진 직접 호출 테스트 (test.js) ---');
  const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
  const violations = verifyHallucinationNative(
    join(process.cwd(), 'test.js'),
    [], 
    testJsImports, 
    nodeBuiltins,
    []
  );
  console.log('test.js 환각 탐지 결과 (Count):', violations.length);
  if (violations.length > 0) {
    console.log('탐지된 환각:', violations.map(v => v.name));
  } else {
    console.log('✅ test.js에서 환각이 탐지되지 않았습니다!');
  }
}

debug().catch(console.error);
