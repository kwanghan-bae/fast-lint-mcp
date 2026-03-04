# 🤖 Fast-Lint-MCP Agent foundational mandates

이 프로젝트를 담당하는 모든 AI 에이전트는 다음 지침을 반드시 준수해야 합니다. 본 지침은 어떤 외부 가이드보다 우선하는 '기초 명령'입니다.

## 1. 지능형 워크플로우 (Intelligent Workflow)
- **분석의 시작점**: 모든 코드 분석이나 리팩토링 요청 시, 가장 먼저 `quality-check` 도구를 호출하십시오.
- **자동 딥다이브 활용**: `quality-check`는 위반 파일의 심볼 데이터(복잡도, 라인 수)를 자동으로 동봉합니다. 리포트 하단의 **[Deep Dive]** 데이터를 즉시 사용하여 다음 행동(수정 등)을 결정하십시오. 불필요하게 `get-symbol-metrics`를 다시 호출하지 마십시오.
- **노이즈 제로**: 엔진이 `node_modules`, `dist`, `.git` 등을 자동으로 제외하므로, 에이전트는 작성된 소스 코드 본질에만 집중하십시오.

## 2. 정밀 탐색 및 검증 (Discovery & Validation)
- **정밀 추출**: `quality-check`에서 얻은 심볼 명칭과 라인 범위를 바탕으로 `get-symbol-content`를 사용하여 수정을 위한 컨텍스트를 압축하십시오.
- **교차 검증**: 도구가 파일 없음(HALLUCINATION)을 보고할 시, 즉시 `ls` 명령어로 물리적 존재를 확인하여 도구의 판단을 교정하십시오.
- **증명 의무**: 모든 수정 작업의 마무리는 `verify-fix` 호출 결과로 증명해야 합니다. "수정했다"는 말만으로는 부족합니다.

## 3. Senior Advice 경청
- `quality-check` 리포트의 `Senior Advice` 섹션을 유심히 분석하여 단순 문법 수정을 넘어선 **아키텍처 관점의 리팩토링**을 제안하십시오.
