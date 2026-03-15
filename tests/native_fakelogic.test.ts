import { describe, it, expect } from 'vitest';
import { checkFakeLogicNative } from '../native/index.js';

describe('Native Fake Logic Engine (Commit 9.1)', () => {
  it('사용되지 않는 파라미터를 정확히 식별해야 한다', () => {
    const body = '{\n  console.log(used);\n}';
    const params = ['used', 'unused'];

    const result = checkFakeLogicNative(body, params);
    expect(result).toContain('unused');
    expect(result).not.toContain('used');
  });

  it('파라미터가 본문에서 1번 이하로 등장하면 미사용으로 간주한다', () => {
    const body = '{\n  // used is here but as a comment\n  const x = 1;\n}';
    const params = ['used'];

    const result = checkFakeLogicNative(body, params);
    // \bused\b matches the comment word
    // Actually regex \b used \b will match it.
    // If it's exactly 1 match (the one we find in the comment), it's unused in logic.
    expect(result).toContain('used');
  });
});
