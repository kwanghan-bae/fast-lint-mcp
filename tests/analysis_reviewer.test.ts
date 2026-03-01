import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { runSemanticReview } from '../src/analysis/reviewer.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('runSemanticReview', () => {
  const testFile = join(process.cwd(), 'temp_review.ts');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
  });

  it('Deep Nesting이 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'function deep() { if (a) { if (b) { if (c) { return true; } } } }';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(violations.some((v) => v.type === 'READABILITY' && v.message.includes('중첩'))).toBe(
      true
    );
  });

  it('Long Parameter List가 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'function longParams(a, b, c, d, e, f) { return a + b + c + d + e + f; }';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(violations.some((v) => v.type === 'READABILITY' && v.message.includes('파라미터'))).toBe(
      true
    );
  });

  it('함수 길이가 150줄을 초과하면 READABILITY 위반을 반환해야 한다', async () => {
    // 150줄 이상의 빈 줄을 포함하는 함수 생성
    const lines = [];
    lines.push('function longFunc() {');
    for (let i = 0; i < 155; i++) lines.push('  // line ' + i);
    lines.push('  return true;');
    lines.push('}');
    writeFileSync(testFile, lines.join('\n'));

    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('길이가 너무 깁니다'))
    ).toBe(true);
  });

  it('20줄 이상의 긴 함수에서 한글 주석이 없으면 READABILITY 위반을 반환해야 한다', async () => {
    const lines = ['function englishComments() {'];
    for (let i = 0; i < 25; i++) lines.push('  // Logic step ' + i);
    lines.push('  return true;');
    lines.push('}');
    writeFileSync(testFile, lines.join('\n'));

    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('한글 주석이 없습니다'))
    ).toBe(true);
  });

  it('30줄 이상의 긴 함수에서 주석이 아예 없으면 READABILITY 위반을 반환해야 한다', async () => {
    const lines = ['function noComments() {'];
    for (let i = 0; i < 35; i++) lines.push('  console.log(' + i + ');');
    lines.push('  return true;');
    lines.push('}');
    writeFileSync(testFile, lines.join('\n'));

    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('주석이 없습니다'))
    ).toBe(true);
  });

  it('한글 주석이 없는 클래스 멤버 변수가 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'class Test { private myVar = 1; }';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('멤버 변수 [myVar]'))
    ).toBe(true);
  });

  it('한글 주석이 있는 클래스 멤버 변수는 위반을 반환하지 않아야 한다', async () => {
    const code = 'class Test {\n  // 한글 주석입니다\n  private myVar = 1;\n}';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('멤버 변수 [myVar]'))
    ).toBe(false);
  });

  it('한글 주석이 없는 전역 변수가 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'export const globalVar = 1;';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('전역 변수 [globalVar]'))
    ).toBe(true);
  });

  it('한글 주석이 없는 클래스 선언이 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'class MyClass {}';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('클래스 [MyClass]'))
    ).toBe(true);
  });

  it('한글 주석이 없는 함수 선언이 발견되면 READABILITY 위반을 반환해야 한다', async () => {
    const code = 'function myFunc() {}';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('함수 [myFunc]'))
    ).toBe(true);
  });

  it('export 문이 있어도 상단에 한글 주석이 있으면 통과해야 한다', async () => {
    const code = '// 테스트 클래스\nexport class ExportedClass {}';
    writeFileSync(testFile, code);
    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('ExportedClass'))
    ).toBe(false);
  });
});
