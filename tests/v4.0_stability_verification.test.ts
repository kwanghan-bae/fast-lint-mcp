import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkFakeLogic } from '../src/analysis/import-check.js';
import { countTechDebt } from '../src/analysis/rg.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('v4.0 Stability & Precision Verification', () => {
  const testDir = join(process.cwd(), 'temp_v40_verify');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('[FAKE_LOGIC] if문이나 콜백 내부에서만 사용되는 파라미터를 정상으로 인지해야 한다', async () => {
    const filePath = join(testDir, 'logic.ts');
    const code = `
      export function deleteAccount(req, res) {
        // 파라미터 req를 if문 안에서만 사용 (과거 오탐 사례)
        if (req && req.user) {
          const id = req.user.id;
          return res.status(200).send(id);
        }
        
        // 파라미터 list를 콜백 안에서만 사용
        const list = [1, 2, 3];
        list.forEach(item => {
          console.log(item);
        });

        return res.status(400).send("Error");
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkFakeLogic(filePath);
    
    // AST 기반 추적으로 if문 내부 참조를 찾아내어 위반이 없어야 함
    expect(violations.length).toBe(0);
  });

  it('[TECH_DEBT] 제외 디렉토리 내의 TODO는 카운트하지 않아야 한다 (grep 일치성)', async () => {
    // 1. 정상 소스 파일에 TODO 2개 생성
    writeFileSync(join(testDir, 'source.ts'), '// TODO: real task 1\n// FIXME: real task 2');
    
    // 2. 제외 대상 폴더(.git, build) 생성 및 TODO 주입
    const gitDir = join(testDir, '.git');
    const buildDir = join(testDir, 'build');
    mkdirSync(gitDir);
    mkdirSync(buildDir);
    
    writeFileSync(join(gitDir, 'config'), '# TODO: internal git config');
    writeFileSync(join(buildDir, 'bundle.js'), '// TODO: minified build todo');

    // 3. 기술 부채 스캔 실행 (ignorePatterns에 testDir 내의 특수 경로 주입)
    const count = await countTechDebt(testDir, []);
    
    // 4. 결과는 오직 source.ts의 2개여야 함
    expect(count).toBe(2);
  });
});
