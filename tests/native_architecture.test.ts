import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkArchitecture } from '../src/analysis/import-check.js';
import { ArchitectureRule } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('Architecture Check (Native Migration)', () => {
  const testDir = join(tmpdir(), 'fast-lint-arch-test-' + Date.now());

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should detect architecture violation from domain to ui (Red Step)', async () => {
    // 1. 테스트 환경 구성
    const domainFile = join(testDir, 'src/domain/UserService.ts');
    const uiFile = join(testDir, 'src/ui/UserButton.tsx');

    mkdirSync(join(testDir, 'src/domain'), { recursive: true });
    mkdirSync(join(testDir, 'src/ui'), { recursive: true });

    writeFileSync(uiFile, 'export const UserButton = () => <button>User</button>;');
    // domain -> ui 참조 (위반)
    writeFileSync(
      domainFile,
      "import { UserButton } from '../ui/UserButton.js';\nexport class UserService {}"
    );

    const rules: ArchitectureRule[] = [
      {
        from: 'src/domain/**',
        to: 'src/ui/**',
        message: 'Domain layer should not depend on UI layer',
      },
    ];

    // 2. 실행
    const violations = await checkArchitecture(domainFile, rules, testDir);

    // 3. 검증 (현재는 JS로 구현되어 있어 통과하겠지만, 우리는 이 로직이 Rust로 옮겨졌을 때도 동일하게 작동함을 보장해야 함)
    // 지금은 이 테스트를 통해 현재 동작을 확인하고, 이후 Rust 구현으로 교체했을 때 여전히 통과하는지 확인합니다.
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toBe('ARCHITECTURE_VIOLATION');
    expect(violations[0].message).toBe('Domain layer should not depend on UI layer');
  });
});
