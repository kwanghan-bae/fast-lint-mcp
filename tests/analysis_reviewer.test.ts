import { describe, it, expect, afterEach } from 'vitest';
import { runSemanticReview } from '../src/analysis/reviewer.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('runSemanticReview', () => {
  const testFile = join(process.cwd(), 'temp_review.ts');

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

  it('함수 길이가 50줄을 초과하면 READABILITY 위반을 반환해야 한다', async () => {
    // 50줄 이상의 빈 줄을 포함하는 함수 생성
    const lines = [];
    lines.push('function longFunc() {');
    for (let i = 0; i < 55; i++) lines.push('  // line ' + i);
    lines.push('  return true;');
    lines.push('}');
    writeFileSync(testFile, lines.join('\n'));

    const violations = await runSemanticReview(testFile);
    expect(
      violations.some((v) => v.type === 'READABILITY' && v.message.includes('길이가 너무 깁니다'))
    ).toBe(true);
  });
});
