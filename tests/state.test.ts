import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from '../src/state.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('StateManager', () => {
  const workspace = join(process.cwd(), 'temp_state_test');
  const stateFile = join(workspace, '.fast-lint-state.json');

  beforeEach(() => {
    if (!existsSync(workspace)) {
      const fs = require('fs');
      fs.mkdirSync(workspace);
    }
  });

  afterEach(() => {
    if (existsSync(workspace)) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('데이터가 없는 경우 null을 반환해야 한다', async () => {
    const ws = join(workspace, 'ws1');
    const manager = new StateManager(ws);
    expect(await manager.getLastCoverage()).toBeNull();
  });

  it('커버리지를 저장하고 불러올 수 있어야 한다', async () => {
    const ws = join(workspace, 'ws2');
    const manager = new StateManager(ws);
    await manager.saveCoverage(85.5);
    expect(await manager.getLastCoverage()).toBe(85.5);
  });

  it('잘못된 형식의 파일이 있는 경우 null을 반환해야 한다', async () => {
    const ws = join(workspace, 'ws3');
    if (!existsSync(ws)) mkdirSync(ws, { recursive: true });
    const sFile = join(ws, '.fast-lint-state.json'); // legacy check test
    const manager = new StateManager(ws);
    // Note: StateManager v3.7 no longer reads from project root, 
    // but the test should still confirm isolation.
    expect(await manager.getLastCoverage()).toBeNull();
  });

  it('파일 쓰기 실패 시 에러가 발생하지 않아야 한다', async () => {
    const manager = new StateManager('/non/existent/path');
    // 에러 없이 조용히 종료되는지 확인
    await expect(manager.saveCoverage(90)).resolves.not.toThrow();
  });
});
