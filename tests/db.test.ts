import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QualityDB } from '../src/db.js';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Quality Database', () => {
  const testWorkspace = join(process.cwd(), 'test-workspace-db');

  beforeEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    mkdirSync(testWorkspace);
  });

  afterEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('데이터베이스와 테이블이 올바르게 초기화되어야 한다', () => {
    const db = new QualityDB(testWorkspace);
    expect(existsSync(join(testWorkspace, '.fast-lint', 'quality_history.db'))).toBe(true);
    db.close();
  });

  it('파일 메트릭을 저장하고 불러올 수 있어야 한다', () => {
    const db = new QualityDB(testWorkspace);
    const path = 'src/index.ts';
    const hash = 'abc123hash';

    db.updateFileMetric(path, hash, 1000, 100, 5);
    const metric = db.getFileMetric(path);

    expect(metric.path).toBe(path);
    expect(metric.hash).toBe(hash);
    expect(metric.mtime_ms).toBe(1000);
    expect(metric.line_count).toBe(100);
    expect(metric.complexity).toBe(5);
    db.close();
  });

  it('세션 통계를 저장하고 마지막 세션을 조회할 수 있어야 한다', () => {
    const db = new QualityDB(testWorkspace);

    db.saveSession(85.5, 2, true);
    const lastSession = db.getLastSession();

    expect(lastSession.total_coverage).toBe(85.5);
    expect(lastSession.violation_count).toBe(2);
    expect(lastSession.pass_status).toBe(1);
    db.close();
  });
});
