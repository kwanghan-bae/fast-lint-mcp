import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

/**
 * 프로젝트별 상태를 사용자 홈 디렉토리의 전용 저장소(~/.fast-lint-mcp)에서 관리합니다. (v3.6 Global Storage)
 * 이를 통해 프로젝트 디렉토리를 오염시키지 않으면서도 세션 간 품질 추적이 가능합니다.
 */
export class StateManager {
  private globalStoragePath: string;
  private projectStoragePath: string;
  private stateFilePath: string;

  /**
   * StateManager 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로 (해싱을 통해 전용 저장소 경로 생성)
   */
  constructor(workspacePath: string = process.cwd()) {
    // 1. 전역 저장소 루트 (~/.fast-lint-mcp)
    this.globalStoragePath = join(homedir(), '.fast-lint-mcp');
    if (!existsSync(this.globalStoragePath)) {
      mkdirSync(this.globalStoragePath, { recursive: true });
    }

    // 2. 프로젝트별 고유 경로 (절대 경로 해싱)
    const projectHash = createHash('md5').update(workspacePath).digest('hex');
    this.projectStoragePath = join(this.globalStoragePath, 'storage', projectHash);
    if (!existsSync(this.projectStoragePath)) {
      mkdirSync(this.projectStoragePath, { recursive: true });
    }

    // 3. 상태 파일 경로
    this.stateFilePath = join(this.projectStoragePath, 'state.json');
  }

  /**
   * 전역 저장소에서 지난 세션의 커버리지 점수를 읽어옵니다.
   */
  getLastCoverage(): number | null {
    if (!existsSync(this.stateFilePath)) return null;
    try {
      const content = readFileSync(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);
      return state.totalCoverage ?? null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 전역 저장소에 현재 세션의 커버리지 점수를 기록합니다.
   */
  saveCoverage(totalCoverage: number) {
    try {
      const state = { 
        totalCoverage,
        lastUpdated: new Date().toISOString()
      };
      writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      // 조용히 실패 (가드레일 역할이므로 크리티컬하지 않음)
    }
  }

  /**
   * 프로젝트별 임시 파일 저장 경로를 제공합니다. (향후 성능 캐시용)
   */
  getTempPath(fileName: string): string {
    return join(this.projectStoragePath, fileName);
  }
}
