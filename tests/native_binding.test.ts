import { describe, it, expect } from 'vitest';
import { helloRust } from '../native/index.js';

describe('NAPI-RS Native Binding (Commit 1.1)', () => {
  it('Rust 함수 helloRust()가 정상적으로 메시지를 반환해야 한다', () => {
    const message = helloRust();
    console.log('Rust says:', message);
    expect(message).toBe('Project Fast-Core is alive!');
  });
});
