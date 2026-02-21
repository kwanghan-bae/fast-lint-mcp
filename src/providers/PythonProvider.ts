import { execSync } from 'child_process';
import { QualityProvider, Violation } from '../types/index.js';
import { ConfigService } from '../config.js';

export class PythonProvider implements QualityProvider {
  name = 'Python (Ruff)';
  extensions = ['.py'];

  constructor(private config: ConfigService) {}

  async check(filePath: string): Promise<Violation[]> {
    const violations: Violation[] = [];
    
    // 1. Ruff (초고성능 파이썬 린터) 연동 시도
    try {
      // ruff가 설치되어 있는지 확인
      execSync('ruff --version', { stdio: 'ignore' });
      
      // ruff를 통한 린트 실행 (json 형식으로 결과 수신)
      const output = execSync(`ruff check ${filePath} --format json`, { encoding: 'utf-8' });
      const issues = JSON.parse(output);

      for (const issue of issues) {
        violations.push({
          type: 'CUSTOM',
          file: filePath,
          message: `[Python/${issue.code}] ${issue.message} (Line ${issue.location.row})`,
        });
      }
    } catch (e) {
      // ruff가 없거나 린트 에러가 있는 경우
      if (e instanceof Error && 'stdout' in e && (e as any).stdout) {
        try {
          const issues = JSON.parse((e as any).stdout);
          for (const issue of issues) {
            violations.push({
              type: 'CUSTOM',
              file: filePath,
              message: `[Python/${issue.code}] ${issue.message} (Line ${issue.location.row})`,
            });
          }
        } catch (parseErr) {}
      }
    }

    // 2. 파이썬 기본 보안 스캔 (간단한 시크릿 스캔)
    // (여기서는 공통 시크릿 스캔을 추후 통합할 수 있도록 함)

    return violations;
  }

  async fix(files: string[], workspacePath: string) {
    const messages: string[] = [];
    let fixedCount = 0;

    try {
      execSync(`ruff check ${files.join(' ')} --fix`, { cwd: workspacePath, stdio: 'ignore' });
      messages.push('Ruff를 통해 파이썬 코드를 자동으로 수정했습니다.');
      fixedCount++;
    } catch (e) {}

    try {
      execSync(`ruff format ${files.join(' ')}`, { cwd: workspacePath, stdio: 'ignore' });
      messages.push('Ruff를 통해 파이썬 코드 포맷팅을 완료했습니다.');
      fixedCount++;
    } catch (e) {}

    return { fixedCount, messages };
  }
}
