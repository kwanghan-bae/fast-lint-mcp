# 🤖 AI 에이전트 지능형 활용 및 설치 가이드 (v3.4)

이 문서는 AI 코딩 에이전트가 `fast-lint-mcp`의 **자동 지능형 체이닝** 기능을 통해 최소한의 호출로 최대의 분석 성과를 내도록 돕는 가이드입니다.

---

## ⚡ 공통 설치 (Prerequisites)
(이하 생략 - 이전 버전과 동일)

---

## 🧠 에이전트 지능형 워크플로우 (SOP) - [v3.4 Auto-Chaining]

v5.1부터 엔진이 에이전트의 다음 행동을 예측하여 데이터를 선제적으로 제공합니다.

### Step 1: 지능형 종합 진단 & 자동 Deep Dive
- **Tool**: `quality-check`
- **Feature**: 위반 사항이 발견되면, 엔진이 해당 파일 내의 복잡한 함수/클래스 정보(`get-symbol-metrics`)를 **자동으로 추출하여 리포트에 첨부**합니다.
- **Action**: 에이전트는 리포트 하단의 **[🔍 Deep Dive: Problematic Symbols]** 섹션을 확인하십시오. 별도의 도구 호출 없이도 어떤 함수가 리팩토링 대상인지 즉시 알 수 있습니다.

### Step 2: 정밀 코드 추출 (Surgical Extraction)
- **Tool**: `get-symbol-content`
- **Action**: Step 1에서 제공된 심볼 명칭과 라인 범위를 바탕으로, 즉시 해당 로직을 추출하여 수정을 시작하십시오. 이제 `get-symbol-metrics`를 수동으로 호출할 필요가 거의 없습니다.

### Step 3: 파급 효과 분석 & 시스템적 증명
(이하 생략 - 이전 버전과 동일)

---

## 🚀 에이전트 주입용 시스템 프롬프트 (System Instruction)

```text
[Fast-Lint-MCP Priority Workflow v3.4]
1. (자동 딥다이브) `quality-check` 리포트 하단의 [Deep Dive] 섹션을 활용해 별도의 심볼 분석 호출 없이 즉시 문제 함수를 식별하라.
2. (압축 호출) 엔진이 선제적으로 제공한 심볼 데이터를 바탕으로 `get-symbol-content`를 즉시 실행하여 컨텍스트를 확보하라.
3. (경로 신뢰) 도구가 파일 경로 오류(HALLUCINATION)를 보고하면, 반드시 `ls` 명령어로 물리적 존재를 교차 검증하라.
4. (검증) 모든 작업의 마무리는 `verify-fix` 호출 결과로 증명하라.
```

---

## ✅ 설치 검증 (Verification)
에이전트에게 이렇게 질문해 보세요:
> "이 프로젝트의 품질을 진단해줘. 발견된 위반 사항이 있다면 리포트에 포함된 [Deep Dive] 데이터를 사용해서 리팩토링 계획을 바로 세워줘."
