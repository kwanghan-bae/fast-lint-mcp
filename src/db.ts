import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DB_DIR = '.fast-lint';
const DB_FILE = 'quality_history.db';

export class QualityDB {
  private db: Database.Database;

  constructor(workspacePath: string = process.cwd()) {
    const dbPath = join(workspacePath, DB_DIR);
    if (!existsSync(dbPath)) {
      mkdirSync(dbPath, { recursive: true });
    }

    this.db = new Database(join(dbPath, DB_FILE));
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_metrics (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        mtime_ms REAL DEFAULT 0, -- 수정 시간(mtime) 추가
        line_count INTEGER DEFAULT 0,
        complexity INTEGER DEFAULT 0,
        violations TEXT DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_coverage REAL DEFAULT 0,
        violation_count INTEGER DEFAULT 0,
        pass_status BOOLEAN NOT NULL
      );
    `);

    // 마이그레이션: mtime_ms 컬럼이 없으면 추가
    try {
      this.db.exec('ALTER TABLE file_metrics ADD COLUMN mtime_ms REAL DEFAULT 0');
    } catch (e) {}
  }

  getFileMetric(path: string) {
    const stmt = this.db.prepare('SELECT * FROM file_metrics WHERE path = ?');
    return stmt.get(path) as any;
  }

  updateFileMetric(
    path: string,
    hash: string,
    mtimeMs: number,
    lineCount: number,
    complexity: number,
    violations: any = []
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO file_metrics (path, hash, mtime_ms, line_count, complexity, violations, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(path) DO UPDATE SET
        hash = excluded.hash,
        mtime_ms = excluded.mtime_ms,
        line_count = excluded.line_count,
        complexity = excluded.complexity,
        violations = excluded.violations,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(path, hash, mtimeMs, lineCount, complexity, JSON.stringify(violations));
  }

  getLastSession() {
    const stmt = this.db.prepare('SELECT * FROM session_stats ORDER BY timestamp DESC LIMIT 1');
    const res = stmt.get() as any;
    if (res) {
      return { ...res, total_coverage: res.total_coverage || 0 };
    }
    return null;
  }

  saveSession(totalCoverage: number, violationCount: number, passStatus: boolean) {
    const stmt = this.db.prepare(`
      INSERT INTO session_stats (total_coverage, violation_count, pass_status)
      VALUES (?, ?, ?)
    `);
    return stmt.run(totalCoverage, violationCount, passStatus ? 1 : 0);
  }

  close() {
    this.db.close();
  }
}
