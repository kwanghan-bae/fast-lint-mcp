import { DependencyGraph } from './src/utils/DependencyGraph.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, normalize } from 'path';

async function verifyGraph() {
  const testDir = join(process.cwd(), 'verify_graph_native');
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  // 1. 가상 프로젝트 구조 생성
  // utils.ts (Leaf)
  // service.ts -> utils.ts
  // controller.ts -> service.ts
  // circularA.ts -> circularB.ts
  // circularB.ts -> circularA.ts

  const utilsPath = join(testDir, 'utils.ts');
  const servicePath = join(testDir, 'service.ts');
  const controllerPath = join(testDir, 'controller.ts');
  const circAPath = join(testDir, 'circularA.ts');
  const circBPath = join(testDir, 'circularB.ts');

  writeFileSync(utilsPath, 'export const util = 1;');
  writeFileSync(servicePath, 'import { util } from "./utils";');
  writeFileSync(
    controllerPath,
    'import { service } from "./service";\nimport { util } from "./utils";'
  );
  writeFileSync(circAPath, 'import { b } from "./circularB";');
  writeFileSync(circBPath, 'import { a } from "./circularA";');

  console.log('--- 의존성 그래프 네이티브 엔진 검증 ---');
  const graph = new DependencyGraph(testDir);

  const start = Date.now();
  await graph.build();
  const duration = Date.now() - start;

  console.log(`그래프 구축 소요 시간: ${duration}ms`);

  // 2. 의존성(Dependencies) 검증
  const serviceDeps = graph.getDependencies(servicePath);
  console.log(`service.ts 의 의존성: ${serviceDeps.length}개`);
  const serviceCorrect = serviceDeps.some((d) => d.endsWith('utils.ts'));

  // 3. 역의존성(Dependents) 검증
  const utilsDeps = graph.getDependents(utilsPath);
  console.log(`utils.ts 를 참조하는 파일: ${utilsDeps.length}개`);
  const utilsCorrect =
    utilsDeps.some((d) => d.endsWith('service.ts')) &&
    utilsDeps.some((d) => d.endsWith('controller.ts'));

  // 4. 순환 참조 검증
  const cycles = graph.detectCycles();
  console.log(`검출된 순환 참조: ${cycles.length}건`);
  const cycleCorrect = cycles.length > 0;

  if (serviceCorrect && utilsCorrect && cycleCorrect) {
    console.log('✅ 검증 성공: 네이티브 엔진이 의존성 관계를 정확히 복원했습니다.');
  } else {
    console.log('❌ 검증 실패: 결과가 예상과 다릅니다.');
    console.log('- serviceCorrect:', serviceCorrect);
    console.log('- utilsCorrect:', utilsCorrect);
    console.log('- cycleCorrect:', cycleCorrect);
  }

  rmSync(testDir, { recursive: true, force: true });
}

verifyGraph().catch(console.error);
