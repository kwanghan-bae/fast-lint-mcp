import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { simpleGit } from 'simple-git';

/**
 * 프로젝트 및 브랜치별 상태를 관리하며, 자동 청소 기능을 지원합니다. (v3.7 Collaboration)
 */
export class StateManager {
  private globalStoragePath: string;
  private projectStoragePath: string = '';
  private stateFilePath: string = '';

  constructor(private workspacePath: string = process.cwd()) {
    this.globalStoragePath = join(homedir(), '.fast-lint-mcp');
    if (!existsSync(this.globalStoragePath)) {
      mkdirSync(this.globalStoragePath, { recursive: true });
    }
  }

  /**
   * 현재 Git 브랜치 이름을 가져옵니다.
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
   * 컨텍스트(경로+브랜치)에 따른 전용 저장소 경로를 초기화합니다.
   */
  private async initContext() {
    const branch = await this.getCurrentBranch();
    // v3.7: 경로와 브랜치를 결합하여 격리된 컨텍스트 생성
    const contextHash = createHash('md5')
      .update(`${this.workspacePath}:${branch}`)
      .digest('hex');
    
    this.projectStoragePath = join(this.globalStoragePath, 'storage', contextHash);
    if (!existsSync(this.projectStoragePath)) {
      mkdirSync(this.projectStoragePath, { recursive: true });
    }
    this.stateFilePath = join(this.projectStoragePath, 'state.json');
  }

  /**
   * 지난 세션의 상태를 읽어옵니다.
   */
  async getLastCoverage(): Promise<number | null> {
    await this.initContext();
    await this.cleanupOldData(); // 읽기 시점에 청소 수행

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
   * 현재 상태를 원자적으로 저장합니다.
   */
  async saveCoverage(totalCoverage: number) {
    if (!this.stateFilePath) await this.initContext();

    try {
      const state = { 
        totalCoverage,
        workspacePath: this.workspacePath,
        lastAccessed: new Date().toISOString()
      };
      
      // 원자적 쓰기: 임시 파일 생성 후 이름 변경 (데이터 파손 방지)
      const tempPath = `${this.stateFilePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      const { renameSync } = require('fs');
      renameSync(tempPath, this.stateFilePath);
    } catch (e) {}
  }

  /**
   * 30일 이상 접근하지 않은 오래된 캐시 데이터를 삭제합니다. (무한 증식 방지)
   */
  private async cleanupOldData() {
    const storageRoot = join(this.globalStoragePath, 'storage');
    if (!existsSync(storageRoot)) return;

    const now = Date.now();
    const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30일

    try {
      const folders = readdirSync(storageRoot);
      for (const folder of folders) {
        const folderPath = join(storageRoot, folder);
        const statePath = join(folderPath, 'state.json');
        
        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, 'utf-8'));
          const lastAccessed = new Set([
            new Date(state.lastAccessed || 0).getTime(),
            statSync(statePath).mtimeMs
          ]);
          const maxAccessed = Math.max(...Array.from(lastAccessed));

          if (now - maxAccessed > MAX_AGE) {
            rmSync(folderPath, { recursive: true, force: true });
          }
        }
      }
    } catch (e) {
      // 청소 실패는 분석에 영향을 주지 않음
    }
  }
}
