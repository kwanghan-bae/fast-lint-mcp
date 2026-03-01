import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from '../src/state.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
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

  it('데이터가 없는 경우 null을 반환해야 한다', () => {
    const manager = new StateManager(workspace);
    expect(manager.getLastCoverage()).toBeNull();
  });

  it('커버리지를 저장하고 불러올 수 있어야 한다', () => {
    const manager = new StateManager(workspace);
    manager.saveCoverage(85.5);
    expect(manager.getLastCoverage()).toBe(85.5);
  });

  it('잘못된 형식의 파일이 있는 경우 null을 반환해야 한다', () => {
    const manager = new StateManager(workspace);
    writeFileSync(stateFile, 'invalid json');
    expect(manager.getLastCoverage()).toBeNull();
  });

  it('파일 쓰기 실패 시 에러가 발생하지 않아야 한다', () => {
    const manager = new StateManager('/non/existent/path');
    // 에러 없이 조용히 종료되는지 확인
    expect(() => manager.saveCoverage(90)).not.toThrow();
  });
});
