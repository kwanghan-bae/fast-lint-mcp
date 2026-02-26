import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { Violation } from './types/index.js';

/**
 * 품질 데이터베이스가 저장될 기본 디렉토리 이름입니다.
 */
const DB_DIR = '.fast-lint';

/**
 * 품질 이력 및 캐시 정보를 담은 SQLite 데이터베이스 파일 이름입니다.
 */
const DB_FILE = 'quality_history.db';

/**
 * 데이터베이스의 file_metrics 테이블 구조를 정의하는 인터페이스입니다.
 * 개별 파일의 분석 결과 및 캐싱용 메타데이터를 저장합니다.
 */
export interface FileMetric {
  path: string; // 파일의 상대 경로
  hash: string; // 파일 내용의 SHA-256 해시값
  mtime_ms: number; // 파일의 최종 수정 시간 (밀리초)
  line_count: number; // 파일의 전체 라인 수
  complexity: number; // 파일 내 함수들의 합산 복잡도
  violations: string; // 발견된 위반 사항 목록 (JSON 문자열)
  updated_at: string; // 기록 업데이트 일시
}

/**
 * 데이터베이스의 session_stats 테이블 구조를 정의하는 인터페이스입니다.
 * 각 품질 검사 세션의 요약 통계 정보를 저장합니다.
 */
export interface SessionStats {
  id: number; // 세션 식별자
  timestamp: string; // 세션 실행 일시
  total_coverage: number; // 세션 당시의 전체 테스트 커버리지 (%)
  violation_count: number; // 세션에서 발견된 전체 위반 건수
  pass_status: number; // 통과 여부 (1: PASS, 0: FAIL)
}

/**
 * 품질 데이터와 캐시를 관리하기 위해 SQLite(Better-SQLite3)를 사용하는 데이터베이스 서비스 클래스입니다.
 */
export class QualityDB {
  // SQLite 데이터베이스 연결 인스턴스
  private db: Database.Database;

  /**
   * QualityDB 인스턴스를 생성하고 데이터베이스 파일을 연결합니다.
   * 경로 권한 문제 발생 시 시스템 임시 디렉토리를 폴백(Fallback)으로 사용합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(workspacePath: string = process.cwd()) {
    let dbPath = join(workspacePath, DB_DIR);

    // 루트(/)나 빈 경로에서 실행 시 권한 문제를 방지하기 위해 홈 디렉토리로 우회합니다.
    if (workspacePath === '/' || workspacePath === '') {
      dbPath = join(os.homedir(), '.fast-lint-mcp', DB_DIR);
    }

    try {
      if (!existsSync(dbPath)) {
        mkdirSync(dbPath, { recursive: true });
      }
    } catch (e) {
      // 권한 문제 등으로 실패할 경우 시스템 임시 디렉토리에 생성합니다.
      dbPath = join(os.tmpdir(), 'fast-lint-mcp', DB_DIR);
      if (!existsSync(dbPath)) {
        mkdirSync(dbPath, { recursive: true });
      }
    }

    // 데이터베이스 파일 연결
    this.db = new Database(join(dbPath, DB_FILE));
    this.init();
  }

  /**
   * 필요한 테이블을 생성하고 스키마 마이그레이션을 수행합니다.
   */
  private init() {
    this.db.exec(`
      -- 파일별 메트릭 및 캐시 저장 테이블
      CREATE TABLE IF NOT EXISTS file_metrics (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        mtime_ms REAL DEFAULT 0,
        line_count INTEGER DEFAULT 0,
        complexity INTEGER DEFAULT 0,
        violations TEXT DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 세션별 요약 통계 저장 테이블
      CREATE TABLE IF NOT EXISTS session_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_coverage REAL DEFAULT 0,
        violation_count INTEGER DEFAULT 0,
        pass_status BOOLEAN NOT NULL
      );
    `);

    // 마이그레이션: 이전 버전 사용자를 위해 mtime_ms 컬럼이 없으면 추가합니다.
    try {
      this.db.exec('ALTER TABLE file_metrics ADD COLUMN mtime_ms REAL DEFAULT 0');
    } catch (e) {
      // 이미 컬럼이 존재하는 경우 에러가 발생하므로 의도적으로 무시합니다.
    }
  }

  /**
   * 특정 파일의 저장된 분석 메트릭 정보를 조회합니다.
   * @param path 파일 경로
   */
  getFileMetric(path: string): FileMetric | undefined {
    const stmt = this.db.prepare('SELECT * FROM file_metrics WHERE path = ?');
    return stmt.get(path) as FileMetric | undefined;
  }

  /**
   * 파일의 분석 결과를 데이터베이스에 기록하거나 업데이트합니다.
   * UPSERT(INSERT ON CONFLICT) 구문을 사용하여 기존 기록이 있으면 수정합니다.
   */
  updateFileMetric(
    path: string,
    hash: string,
    mtimeMs: number,
    lineCount: number,
    complexity: number,
    violations: Violation[] = []
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

  /**
   * 가장 최근에 실행된 분석 세션 정보를 조회합니다.
   */
  getLastSession(): SessionStats | null {
    const stmt = this.db.prepare('SELECT * FROM session_stats ORDER BY timestamp DESC LIMIT 1');
    const res = stmt.get() as SessionStats | undefined;
    if (res) {
      // 데이터가 존재하면 반환하며, 커버리지 기본값을 보장합니다.
      return { ...res, total_coverage: res.total_coverage || 0 };
    }
    return null;
  }

  /**
   * 새로운 품질 분석 세션 결과를 기록합니다.
   * @param totalCoverage 세션 전체 커버리지
   * @param violationCount 발견된 총 위반 수
   * @param passStatus 인증 통과 여부
   */
  saveSession(totalCoverage: number, violationCount: number, passStatus: boolean) {
    const stmt = this.db.prepare(`
      INSERT INTO session_stats (total_coverage, violation_count, pass_status)
      VALUES (?, ?, ?)
    `);
    return stmt.run(totalCoverage, violationCount, passStatus ? 1 : 0);
  }

  /**
   * 데이터베이스 연결을 닫습니다.
   */
  close() {
    this.db.close();
  }
}
