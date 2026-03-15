import { countTechDebt } from './src/analysis/rg.js';
import { writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from './src/utils/AstCacheManager.js';

async function verify() {
  const filePath = join(process.cwd(), 'verify_rg_accuracy.ts');
  const code =
    '// TODO: 진짜 주석 1\n' +
    '/* FIXME: 진짜 주석 2 */\n' +
    '\n' +
    'const myTODO = "이건 변수명이라서 카운트되면 안됨";\n' +
    'const hackString = "HACK: 이것도 문자열 내부라서 카운트되면 안됨";\n' +
    '\n' +
    '// XXX: 진짜 주석 3\n';

  writeFileSync(filePath, code);

  // 캐시 클리어 후 실행
  AstCacheManager.getInstance().clear();
  const count = await countTechDebt([filePath]);

  console.log('--- 기술 부채 스캔 정밀 검증 결과 ---');
  console.log('분석 파일: ' + filePath);
  console.log('검출된 개수: ' + count + ' (기대값: 3)');

  if (count === 3) {
    console.log('✅ 검증 성공: 주석만 정확하게 카운트하고 변수명/문자열 내 키워드는 무시합니다.');
  } else {
    console.log('❌ 검증 실패: 정밀도에 문제가 있습니다. (검출 개수: ' + count + ')');
  }

  rmSync(filePath);
}

verify().catch(console.error);
