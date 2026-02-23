# Fast-Lint-MCP (QualityGate) 🚀 v2.0

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v2.0에서는 **Semantic Analysis(ts-morph)** 엔진을 도입하여 에이전트의 토큰 소모를 90% 이상 줄이는 정밀 분석 도구와 전용 **Skill**을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

### 1. 🔍 세만틱 분석 엔진 (Semantic Guardian) - v2.0 NEW!
단순 텍스트 검색을 넘어 TypeScript Compiler API(`ts-morph`)를 통해 코드의 의미를 파악합니다.
*   **정밀 메트릭 (`get-symbol-metrics`)**: 파일 전체가 아닌 함수/클래스 단위로 복잡도와 라인 수를 측정합니다.
*   **최소 읽기 (`get-symbol-content`)**: 수정이 필요한 특정 함수의 코드만 추출하여 읽습니다. (토큰 절약 핵심)
*   **영향도 추적 (`analyze-impact`)**: 특정 심볼 수정 시 영향을 받는 파일과 관련 테스트 케이스를 즉시 분석합니다.
*   **미사용 코드 제거 (`find-dead-code`)**: 프로젝트 전체에서 호출되지 않는 Export 심볼을 찾아 기술 부채를 정리합니다.

### 2. 🛡️ AI 에이전트 품질 게이트 (Agent Quality Gate)
에이전트의 오작동과 환각을 잡아내는 최종 품질 관문입니다.
*   **환각 및 가짜 로직 차단**: 존재하지 않는 경로 참조나 하드코딩된 '가짜 구현'을 AST 수준에서 탐지합니다.
*   **테스트 커버리지 강제**: 전체 커버리지가 **80% 미만**이거나 이전 세션보다 하락하면 작업을 반려합니다.
*   **보안 및 변이 테스트**: 민감 정보 스캔 및 가짜 테스트 적발(Mutation Testing) 기능을 제공합니다.

### 3. ⚡ 고성능 정적 분석
*   **JS/TS, Python** 지원: `@ast-grep/napi`를 사용하여 파일당 **10ms 이내**의 속도로 분석합니다.
*   **증분 분석 (Incremental Scan)**: `git diff`를 활용하여 변경된 파일만 선별 분석하여 에이전트 응답 속도를 높입니다.

---

## 🧠 에이전트 전용 Skill (Semantic Guardian)

v2.0은 Gemini CLI용 전용 스킬을 포함합니다. 이를 통해 에이전트는 **"최소 토큰 작업 전략"**을 스스로 학습하고 실행합니다.

### 스킬 등록 방법
```bash
# Gemini CLI 글로벌 스킬로 등록 (심볼릭 링크)
gemini skills link .gemini/skills/semantic-guardian
```

---

## 🚀 설치 및 실행 (Setup)

### 1. 의존성 설치 및 빌드
```bash
npm install
npm run build
```

### 2. MCP 서버 등록 (Gemini CLI 예시)
```bash
gemini mcp add -s user --trust fast-lint-mcp node /절대경로/to/fast-lint-mcp/dist/index.js
```

---

## 🛠️ 요구사항 (Prerequisites)

*   **Node.js**: v18.0.0 이상
*   **ripgrep (rg)**: 기술 부채 스캔용 (`brew install ripgrep`)
*   **ast-grep (sg)**: AST 분석 엔진 (`brew install ast-grep`)
*   **ts-morph**: v2.0 세만틱 분석용 (기본 포함)

---

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v2.0)

이 프로젝트에서 작업하는 에이전트는 **Semantic Guardian** 스킬에 정의된 아래 SOP를 준수해야 합니다.

1.  **[정밀 탐색]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오. (토큰 절약)
2.  **[영향 분석]**: 공통 모듈 수정 전 반드시 `analyze-impact`를 실행하여 사이드 이펙트를 확인하십시오.
3.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.
4.  **[부채 제거]**: 주기적으로 `find-dead-code`를 실행하여 미사용 코드를 정리하십시오.

**"이제 당신의 AI 에이전트는 단순한 코더를 넘어, 프로젝트의 구조를 이해하고 품질을 책임지는 전문가(Guardian)로 활동합니다."**
