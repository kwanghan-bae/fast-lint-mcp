/**
 * 품질 검사 세션의 상태를 메모리에서 관리하는 상태 관리자입니다. (v3.5 Stateless)
 * 프로젝트 디렉토리에 어떠한 파일도 생성하지 않아 오염을 방지합니다.
 */
export class StateManager {
  private totalCoverage: number | null = null;

  /**
   * StateManager 인스턴스를 생성합니다.
   * 더 이상 파일 경로가 필요하지 않지만 인터페이스 유지를 위해 남겨둡니다.
   */
  constructor(_workspacePath: string = process.cwd()) {}

  /**
   * 이번 실행 세션의 마지막 커버리지 점수를 가져옵니다.
   */
  getLastCoverage(): number | null {
    return this.totalCoverage;
  }

  /**
   * 이번 실행 세션의 커버리지 점수를 메모리에 저장합니다.
   */
  saveCoverage(totalCoverage: number) {
    this.totalCoverage = totalCoverage;
  }
}
