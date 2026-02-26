import { describe, it, expect, afterEach } from 'vitest';
import { runSemanticReview } from '../src/analysis/reviewer.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('runSemanticReview (JavaScript Specific)', () => {
  const testFileJs = join(process.cwd(), 'temp_review.js');

  afterEach(() => {
    if (existsSync(testFileJs)) rmSync(testFileJs);
  });

  it('JS 파일에서 한글 주석이 없는 전역 할당(exports)을 감지해야 한다', async () => {
    const code = 'exports.myService = () => { return 1; };';
    writeFileSync(testFileJs, code);
    const violations = await runSemanticReview(testFileJs);
    expect(violations.some((v) => v.message.includes('모듈 할당 [exports.myService]'))).toBe(true);
  });

  it('JS 파일에서 한글 주석이 없는 클래스 필드를 감지해야 한다', async () => {
    const code = 'class Api { baseUrl = "http://api.com"; }';
    writeFileSync(testFileJs, code);
    const violations = await runSemanticReview(testFileJs);
    expect(violations.some((v) => v.message.includes('멤버 변수 [baseUrl]'))).toBe(true);
  });

  it('JS 파일에서 한글 주석이 있는 전역 변수는 통과해야 한다', async () => {
    const code = '// 프로젝트 설정\nconst config = {};';
    writeFileSync(testFileJs, code);
    const violations = await runSemanticReview(testFileJs);
    expect(violations.some((v) => v.message.includes('전역 변수 [config]'))).toBe(false);
  });

  it('JS 파일에서 module.exports 할당을 감지해야 한다', async () => {
    const code = 'module.exports = function() {};';
    writeFileSync(testFileJs, code);
    const violations = await runSemanticReview(testFileJs);
    expect(violations.some((v) => v.message.includes('모듈 할당 [module.exports]'))).toBe(true);
  });
});
