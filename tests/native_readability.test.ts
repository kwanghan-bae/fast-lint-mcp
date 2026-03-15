import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasKoreanCommentNative } from '../native/index.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Native Readability Engine (Commit 8.2)', () => {
  const testDir = join(process.cwd(), 'temp_native_readability');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('한글 주석이 있는 경우 true를 반환해야 한다', () => {
    const filePath = join(testDir, 'has_korean.ts');
    const code = '// 이 함수는 테스트용입니다.\n' + 'function test() {}\n';

    writeFileSync(filePath, code);

    // 2라인(function test) 위 3라인 이내 탐색
    const hasKorean = hasKoreanCommentNative(filePath, 2, 3);
    expect(hasKorean).toBe(true);
  });

  it('한글 주석이 없는 경우 false를 반환해야 한다', () => {
    const filePath = join(testDir, 'no_korean.ts');
    const code = '// This is a test function.\n' + 'function test() {}\n';

    writeFileSync(filePath, code);

    const hasKorean = hasKoreanCommentNative(filePath, 2, 3);
    expect(hasKorean).toBe(false);
  });

  it('주석 자체가 없는 경우 false를 반환해야 한다', () => {
    const filePath = join(testDir, 'no_comment.ts');
    const code = 'function test() {}\n';

    writeFileSync(filePath, code);

    const hasKorean = hasKoreanCommentNative(filePath, 1, 3);
    expect(hasKorean).toBe(false);
  });
});
