import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSemanticReview } from '../src/analysis/reviewer.js';
import { checkSecrets } from '../src/checkers/security.js';
import { checkHallucination, checkFakeLogic } from '../src/analysis/import-check.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('v3.7 정밀 검증 스위트 (9대 버그 해결 실증)', () => {
  const testDir = join(process.cwd(), 'temp_verification');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('[보안] 엔트로피가 4.0 미만인 일반 문자열(ClassSelectScene 등)은 탐지되지 않아야 한다', async () => {
    const filePath = join(testDir, 'ClassSelectScene.ts');
    const code = `
      export class ClassSelectScene extends Phaser.Scene {
        create() {
          const sceneKey = "ClassSelectScene"; // 엔트로피 약 3.0 (과거 오탐 사례)
          console.log(sceneKey);
        }
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkSecrets(filePath);
    expect(violations.length).toBe(0);
  });
  it('[가독성] game, app 등 자주 쓰이는 명칭이나 10줄 미만의 짧은 함수는 주석 요구에서 제외되어야 한다', async () => {
    const filePath = join(testDir, 'SmallFunction.ts');
    const code = `
      export function game() {
        const x = 1;
        const y = 2;
        return x + y;
      }
    `;
    writeFileSync(filePath, code);
    const violations = await runSemanticReview(filePath);
    
    // game이라는 이름의 짧은 함수는 READABILITY 위반이 없어야 함
    const commentViolation = violations.find(v => v.message.includes('한글 주석을 추가'));
    expect(commentViolation).toBeUndefined();
  });

  it('[가독성] 100줄 내외의 파일(50줄 초과)은 길이가 너무 길다는 경고를 받지 않아야 한다', async () => {
    const filePath = join(testDir, 'PhaserGame.tsx');
    const lines = ['export function PhaserGame() {', '  // UI 렌더링 로직'];
    for (let i = 0; i < 80; i++) lines.push(`  console.log("Rendering line ${i}");`);
    lines.push('  return <div>Game View</div>;', '}');
    writeFileSync(filePath, lines.join('\n'));

    const violations = await runSemanticReview(filePath);
    const lengthViolation = violations.find(v => v.message.includes('길이가 너무 깁니다'));
    expect(lengthViolation).toBeUndefined();
  });

  it('[의존성] 상위 디렉토리의 package.json에 정의된 라이브러리는 HALLUCINATION으로 오탐되지 않아야 한다', async () => {
    // 1. 루트 package.json 시뮬레이션
    const rootPkg = join(testDir, 'package.json');
    writeFileSync(rootPkg, JSON.stringify({ dependencies: { '@nestjs/common': '^10.0.0' } }));

    // 2. 하위 디렉토리 파일
    const subDir = join(testDir, 'backend-node');
    if (!existsSync(subDir)) mkdirSync(subDir);
    const subFile = join(subDir, 'app.controller.ts');
    writeFileSync(subFile, "import { Controller, Get } from '@nestjs/common';\n@Controller() export class AppController {}");

    // 3. 검사 수행 (워크스페이스 루트를 testDir로 가정)
    const violations = await checkHallucination(subFile, testDir);
    const libHallucination = violations.find(v => v.id === 'HALLUCINATION_LIB');
    
    // @nestjs/common이 루트에 있으므로 환각 경고가 없어야 함
    expect(libHallucination).toBeUndefined();
  });

  it('[논리] useEffect 의존성 배열 및 구조 분해 할당 파라미터는 FAKE_LOGIC으로 오탐되지 않아야 한다', async () => {
    const filePath = join(testDir, 'MyComponent.ts');
    const code = `
      export function useCustomHook({ data, id }) {
        useEffect(() => {
          if (id) {
            console.log('Data changed:', data);
          }
        }, [data, id]); // 파라미터를 useEffect 내부에서 사용 중
        return { data, id };
      }
    `;
    writeFileSync(filePath, code);
    const violations = await checkFakeLogic(filePath);
    
    // id와 data가 사용되고 있으므로 FAKE_LOGIC 경고가 없어야 함
    expect(violations.length).toBe(0);
  });

  it('[주석] 이미 작성된 한글 JSDoc 주석은 무시되지 않아야 한다 (최대 10줄 탐색)', async () => {
    const filePath = join(testDir, 'CommentTest.ts');
    const code = `
      /**
       * 이 클래스는 품질 인증 도구의
       * 주석 인식 기능을 테스트하기 위해
       * 작성된 샘플 클래스입니다.
       * (한글 주석 포함됨)
       */
      export class CommentTest {
        constructor() {}
      }
    `;
    writeFileSync(filePath, code);
    const violations = await runSemanticReview(filePath);
    
    // 한글 주석이 있으므로 READABILITY 경고가 없어야 함
    const commentViolation = violations.find(v => v.message.includes('한글 주석을 추가'));
    expect(commentViolation).toBeUndefined();
  });

  it('[리포트] 모든 위반 사항에는 정확한 라인 번호가 포함되어야 한다', async () => {
    const filePath = join(testDir, 'LineNumTest.ts');
    const code = [
      '// Line 1',
      '// Line 2',
      'function test($a, $b, $c, $d, $e, $f) {', // Line 3: 파라미터 5개 이상
      '  return $a;',
      '}'
    ].join('\n');
    writeFileSync(filePath, code);
    
    const violations = await runSemanticReview(filePath);
    const paramViolation = violations.find(v => v.message.includes('파라미터'));
    
    expect(paramViolation).toBeDefined();
    expect(paramViolation?.line).toBe(3); // 정확히 3번 라인이어야 함
  });
});
