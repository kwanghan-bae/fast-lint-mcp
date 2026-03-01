import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSemanticReview } from '../src/analysis/reviewer.js';
import { checkFakeLogic } from '../src/analysis/import-check.js';
import { checkStructuralIntegrity } from '../src/utils/AnalysisUtils.js';
import { DependencyGraph } from '../src/utils/DependencyGraph.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('v3.8 최종 고도화 스위트 (지능형 센서 및 아키텍처 검증)', () => {
  const testDir = join(process.cwd(), 'temp_v38');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('[1. AST/DTO] 데코레이터 하위 식별자를 무시하고 실제 필드명을 추출해야 한다', async () => {
    const filePath = join(testDir, 'CreateUser.dto.ts');
    const code = `
      export class CreateUserDto {
        @IsInt()
        @Min(1)
        public userAge: number;
      }
    `;
    writeFileSync(filePath, code);
    const violations = await runSemanticReview(filePath);
    
    // IsInt나 Min이 아닌 'userAge'를 찾아야 하며, (DTO) 표기가 있어야 함
    const fieldViolation = violations.find(v => v.message.includes('필드 (DTO/Entity) [userAge]'));
    if (!fieldViolation) {
      console.error('Actual violations:', violations.map(v => v.message));
    }
    expect(fieldViolation).toBeDefined();
    expect(violations.some(v => v.message.includes('[IsInt]'))).toBe(false);
  });

  it('[2. Test-as-Spec] 테스트 블록을 모듈 할당이 아닌 전용 용어로 리포팅해야 한다', async () => {
    const filePath = join(testDir, 'user.test.ts');
    const code = `
      describe('UserService', () => {
        beforeEach(() => {});
        it('should return user', () => {});
      });
    `;
    writeFileSync(filePath, code);
    const violations = await runSemanticReview(filePath);
    
    // describe는 테스트 스위트로 식별되어 의도 중심 주석을 요구해야 함
    const suiteViolation = violations.find(v => v.message.includes('테스트 스위트(Suite) [describe]'));
    expect(suiteViolation).toBeDefined();
    expect(suiteViolation?.message).toContain('의도(Intent)나 Mocking 구조를 설명하는 한글 주석');
  });

  it('[3. Data-Flow] 깊은 속성 접근 및 구조 분해 할당을 FAKE_LOGIC에서 정상 사용으로 판별해야 한다', async () => {
    const filePath = join(testDir, 'Controller.ts');
    const code = `
      function deepAccess(req, res) {
        console.log(req.user.id); // 깊은 접근
        return res.send(200);
      }
      function destructured({ body }, response) {
        const { id, name } = body; // 구조 분해
        return response.send(id);
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkFakeLogic(filePath);
    
    // 두 함수 모두 파라미터를 실질적으로 사용했으므로 FAKE_LOGIC 위반이 없어야 함
    expect(violations.length).toBe(0);
  });

  it('[5. Architecture] forwardRef가 포함된 순환 참조는 TECH_DEBT로 하향 조정되어야 한다', async () => {
    // 1. 임시 파일 생성
    const fileA = join(testDir, 'A.ts');
    const fileB = join(testDir, 'B.ts');
    writeFileSync(fileA, "import { B } from './B'; forwardRef(() => B);");
    writeFileSync(fileB, "import { A } from './A';");

    // 2. 가짜 의존성 그래프 구성 (A <-> B 순환)
    const dg = new DependencyGraph(testDir);
    dg['importMap'].set(fileA, [fileB]);
    dg['importMap'].set(fileB, [fileA]);

    const violations = checkStructuralIntegrity(dg);
    
    // TECH_DEBT로 강등되었는지 확인
    const cycleViolation = violations.find(v => v.message.includes('순환 참조가 발견되었으나'));
    expect(cycleViolation).toBeDefined();
    expect(cycleViolation?.type).toBe('TECH_DEBT');
  });

  it('[5. Architecture] Service가 Controller를 참조하면 Layer 위반으로 처리해야 한다', async () => {
    const serviceFile = join(testDir, 'auth.service.ts');
    const controllerFile = join(testDir, 'auth.controller.ts');
    
    const dg = new DependencyGraph(testDir);
    // Service -> Controller 역방향 참조 발생
    dg['importMap'].set(serviceFile, [controllerFile]);
    
    const violations = checkStructuralIntegrity(dg);
    
    const layerViolation = violations.find(v => v.rationale === 'Layer 위반: Service -> Controller');
    expect(layerViolation).toBeDefined();
    expect(layerViolation?.type).toBe('ARCHITECTURE');
  });
});
