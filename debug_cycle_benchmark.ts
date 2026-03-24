import { detectCyclesNative } from './native/index.js';

// benchmark 함수는 내부 로직을 처리합니다.
function benchmark() {
  const nodeCount = 5000;
  const edgeCount = 10000;
  const importMap: Record<string, string[]> = {};

  console.log('--- 순환 참조 탐지 네이티브 엔진 성능 벤치마크 ---');
  console.log(`생성 노드 수: ${nodeCount}, 엣지 수: ${edgeCount}`);

  // 1. 가상 그래프 데이터 생성
  for (let i = 0; i < nodeCount; i++) {
    importMap[`file_${i}.ts`] = [];
  }

  // 무작위 엣지 생성
  for (let i = 0; i < edgeCount; i++) {
    const from = Math.floor(Math.random() * nodeCount);
    const to = Math.floor(Math.random() * nodeCount);
    if (from !== to) {
      importMap[`file_${from}.ts`].push(`file_${to}.ts`);
    }
  }

  // 의도적인 순환 삽입
  importMap['cycle_1.ts'] = ['cycle_2.ts'];
  importMap['cycle_2.ts'] = ['cycle_1.ts'];

  importMap['loop_1.ts'] = ['loop_2.ts'];
  importMap['loop_2.ts'] = ['loop_3.ts'];
  importMap['loop_3.ts'] = ['loop_1.ts'];

  // 2. 성능 측정
  const start = performance.now();
  const cycles = detectCyclesNative(importMap);
  const end = performance.now();

  console.log(`탐지된 순환 고리 수: ${cycles.length}`);
  console.log(`소요 시간: ${(end - start).toFixed(4)}ms`);

  const hasIntentionalCycles =
    cycles.some((c) => c.includes('cycle_1.ts')) && cycles.some((c) => c.includes('loop_1.ts'));

  if (hasIntentionalCycles) {
    console.log('✅ 검증 성공: 의도적으로 삽입한 순환 고리를 정확하고 빠르게 찾아냈습니다.');
  } else {
    console.log('❌ 검증 실패: 일부 순환 고리를 놓쳤습니다.');
  }
}

benchmark();
