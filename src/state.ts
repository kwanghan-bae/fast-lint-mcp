import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { simpleGit } from 'simple-git';

/**
 * 프로젝트 및 브랜치별 상태를 관리하며, 자동 청소 기능을 지원합니다. (v3.7 Collaboration)
 * 사용자 홈 디렉토리(~/.fast-lint-mcp)를 저장소로 활용하여 프로젝트 오염을 방지합니다.
 */
export class StateManager {
  /** 전역 저장소 루트 경로 (~/.fast-lint-mcp) */
  private globalStoragePath: string;
  /** 프로젝트 및 브랜치별 고유 저장소 경로 */
  private projectStoragePath: string = '';
  /** 현재 컨텍스트의 상태 파일(state.json) 경로 */
  private stateFilePath: string = '';

  /**
   * StateManager 인스턴스를 초기화합니다.
   * @param workspacePath 분석할 프로젝트의 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {
    this.globalStoragePath = join(homedir(), '.fast-lint-mcp');
    if (!existsSync(this.globalStoragePath)) {
      mkdirSync(this.globalStoragePath, { recursive: true });
    }
  }

  /**
   * 현재 Git 브랜치 이름을 비동기로 가져옵니다.
   * Git 환경이 아닌 경우 'no-git'을 반환합니다.
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const git = simpleGit(this.workspacePath);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return 'no-git';
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (e) {
      return 'default';
    }
  }

  /**
   * 프로젝트 경로와 브랜치 이름을 조합하여 독립된 저장소 컨텍스트를 초기화합니다.
   */
  private async initContext() {
    let branch = 'default';
    try {
      branch = await this.getCurrentBranch();
    } catch (e) {}

    // v3.7: 경로와 브랜치를 결합하여 격리된 컨텍스트 생성 (MD5 해싱)
    const contextHash = createHash('md5').update(`${this.workspacePath}:${branch}`).digest('hex');

    this.projectStoragePath = join(this.globalStoragePath, 'storage', contextHash);
    if (!existsSync(this.projectStoragePath)) {
      mkdirSync(this.projectStoragePath, { recursive: true });
    }
    this.stateFilePath = join(this.projectStoragePath, 'state.json');
  }

  /**
   * 전역 저장소에서 지난 세션의 커버리지 점수를 비동기로 읽어옵니다.
   * 읽기 시점에 30일 이상 된 오래된 데이터는 자동으로 청소합니다.
   */
  async getLastCoverage(): Promise<number | null> {
    await this.initContext();
    await this.cleanupOldData();

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
   * 현재 세션의 커버리지 점수를 전역 저장소에 원자적(Atomic)으로 저장합니다.
   * 데이터 파손을 방지하기 위해 임시 파일을 생성한 후 이름을 변경하는 방식을 사용합니다.
   */
  async saveCoverage(totalCoverage: number) {
    if (!this.stateFilePath) await this.initContext();

    try {
      const state = {
        totalCoverage,
        workspacePath: this.workspacePath,
        lastAccessed: new Date().toISOString(),
      };

      const tempPath = `${this.stateFilePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      const { renameSync } = require('fs');
      renameSync(tempPath, this.stateFilePath);
    } catch (e) {}
  }

  /**
   * 30일 이상 접근하지 않은 전역 저장소 내의 오래된 프로젝트/브랜치 데이터를 삭제합니다.
   */
  private async cleanupOldData() {
    const storageRoot = join(this.globalStoragePath, 'storage');
    if (!existsSync(storageRoot)) return;

    const now = Date.now();
    const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30일 기준

    try {
      const folders = readdirSync(storageRoot);
      for (const folder of folders) {
        const folderPath = join(storageRoot, folder);
        const statePath = join(folderPath, 'state.json');

        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, 'utf-8'));
          const lastAccessedTime = new Date(state.lastAccessed || 0).getTime();
          const fileMtime = statSync(statePath).mtimeMs;
          const maxAccessed = Math.max(lastAccessedTime, fileMtime);

          if (now - maxAccessed > MAX_AGE) {
            rmSync(folderPath, { recursive: true, force: true });
          }
        }
      }
    } catch (e) {}
  }
}
