import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 품질 검사 세션 간의 상태(예: 이전 커버리지 점수)를 관리하는 간단한 상태 관리자입니다.
 * 기존의 무거운 SQLite(QualityDB)를 대체하여 성능을 극대화합니다.
 */
export class StateManager {
  private stateFilePath: string;

  /**
   * StateManager 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(workspacePath: string = process.cwd()) {
    this.stateFilePath = join(workspacePath, '.fast-lint-state.json');
  }

  /**
   * 이전 세션에서 기록된 전체 테스트 커버리지를 가져옵니다.
   * @returns 이전 커버리지 점수 (%) 또는 기록이 없으면 null
   */
  getLastCoverage(): number | null {
    if (existsSync(this.stateFilePath)) {
      try {
        const content = readFileSync(this.stateFilePath, 'utf-8');
        const state = JSON.parse(content);
        return state.totalCoverage ?? null;
      } catch (e) {
        // 파싱 실패 시 무시
      }
    }
    return null;
  }

  /**
   * 현재 세션의 전체 테스트 커버리지를 상태 파일에 저장합니다.
   * @param totalCoverage 현재 커버리지 점수 (%)
   */
  saveCoverage(totalCoverage: number) {
    try {
      const state = { totalCoverage };
      writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      // 파일 쓰기 실패 시 에러 무시
    }
  }
}
