import { describe, it, expect } from 'vitest';
import { resolveModulePath } from '../src/utils/PathResolver.js';
import { normalize, join } from 'path';

describe('v4.9 Path Resolution Precision (Fuzzy & Index)', () => {
  const workspacePath = '/root/project';
  const currentDir = join(workspacePath, 'src/services');
  
  // 가상의 프로젝트 파일 셋 (normalize 적용)
  const allFiles = [
    join(workspacePath, 'src/services/auth.service.ts'),
    join(workspacePath, 'src/utils/index.ts'),
    join(workspacePath, 'src/game/GameState.tsx'),
    join(workspacePath, 'src/common/types.d.ts'),
    join(workspacePath, 'package.json'),
  ].map(f => normalize(f));

  it('확장자가 생략된 파일 경로를 정확히 해소해야 한다 (auth.service -> .ts)', () => {
    const result = resolveModulePath(
      currentDir,
      './auth.service',
      allFiles,
      workspacePath,
      join(currentDir, 'caller.ts')
    );
    expect(result).toBe(normalize(join(workspacePath, 'src/services/auth.service.ts')));
  });

  it('디렉토리명만 입력된 경우 index.ts를 찾아야 한다 (utils -> utils/index.ts)', () => {
    const result = resolveModulePath(
      currentDir,
      '../utils',
      allFiles,
      workspacePath,
      join(currentDir, 'caller.ts')
    );
    expect(result).toBe(normalize(join(workspacePath, 'src/utils/index.ts')));
  });

  it('v4.9 신규 로직: 워크스페이스 내에서 끝자리 일치로 파일을 찾아야 한다 (Fuzzy Matching)', () => {
    // ../game/GameState 라고 임포트했으나 실제로는 다른 깊이에 있을 때
    const result = resolveModulePath(
      currentDir,
      '../game/GameState',
      allFiles,
      workspacePath,
      join(currentDir, 'caller.ts')
    );
    expect(result).toBe(normalize(join(workspacePath, 'src/game/GameState.tsx')));
  });

  it('d.ts 타입 정의 파일도 우선순위에 따라 찾아야 한다', () => {
    const result = resolveModulePath(
      currentDir,
      '../common/types',
      allFiles,
      workspacePath,
      join(currentDir, 'caller.ts')
    );
    expect(result).toBe(normalize(join(workspacePath, 'src/common/types.d.ts')));
  });

  it('존재하지 않는 경로는 정확히 null을 반환하여 환각을 방지해야 한다', () => {
    const result = resolveModulePath(
      currentDir,
      './non-existent',
      allFiles,
      workspacePath,
      join(currentDir, 'caller.ts')
    );
    expect(result).toBeNull();
  });
});
