# Fast-Lint-MCP (QualityGate) 🚀 v2.1

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v2.1에서는 **Pure Native Rust (ast-grep)** 엔진으로의 완전한 전환과 **Korean First (한글 주석 우선)** 가독성 규칙을 도입하여 품질 관리 수준을 한 단계 더 높였습니다.

---

## ✨ 주요 기능 (Key Features)

### 1. 🔍 고성능 네이티브 분석 엔진 (Native-Powered) - v2.1 UP!
기존의 무거운 TypeScript Compiler (ts-morph)를 완전히 제거하고, 100% **Native Rust (ast-grep)** 기반으로 전환했습니다.
*   **초고속 분석**: 대규모 프로젝트에서도 수천 개의 파일을 **1초 미만**에 분석하는 압도적인 성능을 제공합니다.
*   **정밀 심볼 분석**: 클래스, 함수, 변수 등의 구조적 관계를 AST 레벨에서 정확하게 파악합니다.
*   **최소 토큰 전략 (`get-symbol-content`)**: 필요한 심볼의 코드만 추출하여 읽음으로써 AI 모델의 컨텍스트 사용량을 획기적으로 절약합니다.

### 2. 🇰🇷 가독성 및 주석 규칙 (Korean First) - v2.1 NEW!
AI 에이전트가 생성하는 코드의 가독성을 보장하기 위해 한국어 주석 작성을 강제합니다.
*   **주요 구성 요소 한글 주석 필수**: 모든 클래스(`class`) 및 함수(`function`) 선언 상단에 한글 주석이 없으면 품질 인증이 실패합니다.
*   **비지역 변수 설명 강제**: 클래스 멤버 변수와 전역 변수(상수) 위에 해당 용도를 설명하는 한글 주석을 달아야 합니다.
*   **영문 주석 금지**: 일정 길이 이상의 로직에서 영문 주석만 존재하는 경우 한글화를 권고합니다.

### 3. 📊 시각적 품질 리포트 (Pretty Reports) - v2.1 NEW!
MCP 클라이언트(Gemini, Claude 등)에서 보기 좋게 렌더링되는 **Markdown 기반의 유려한 리포트**를 제공합니다.
*   **Markdown 테이블 적용**: 위반 사항을 깔끔한 표 형식으로 정리하여 가독성을 높였습니다.
*   **상세 가이드**: 단순한 에러 표시를 넘어, 구체적인 리팩토링 방향을 제안합니다.

### 4. 🤖 자율형 자가 치유 (Self-Healing Loop)
에이전트가 코드를 수정하고 스스로 검증하는 루프를 제공합니다.
*   **검증 자동화 (`verify-fix`)**: 수정 후 자동으로 테스트를 실행하고, 실패 시 에러 로그를 분석하여 자가 재수정을 수행합니다.
*   **테스트 커버리지 가드**: 커버리지 파일 누락이나 수치 하락을 엄격하게 감지하여 품질 저하를 원천 차단합니다.

---

## ⚡ Built-in High Performance

Fast-Lint-MCP는 성능 최적화에 진심입니다.
*   **Zero-Install Performance**: 별도의 Rust 컴파일러 없이 `npm install` 만으로 즉시 작동하는 사전 빌드된 고성능 바이너리가 포함되어 있습니다.
*   **스마트 증분 분석**: Git 상태를 추적하여 변경된 파일과 그에 연관된 의존 모듈들만 선별적으로 분석합니다.

---

## 🧠 에이전트 전용 Skill (Semantic Guardian)

v2.1은 Gemini CLI용 최신 스킬을 포함합니다. 이를 통해 에이전트는 **"한글 주석 작성 원칙"**과 **"최소 토큰 작업 전략"**을 완벽히 이해하고 실행합니다.

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
*   **fd-find (fd)**: 고속 파일 탐색용 (`brew install fd`)
*   **Zero-Install Rust**: 별도의 Rust 설치가 필요 없습니다. (`@ast-grep/napi` 바이너리 내장)

---

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v2.1)

1.  **[한글 주석 우선]**: 모든 주요 클래스, 함수, 멤버 변수 위에는 반드시 한글 주석을 작성하십시오.
2.  **[최소 읽기]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오.
3.  **[자가 검증]**: 코드 수정 후 반드시 `verify-fix`를 실행하여 테스트 통과 여부를 확인하십시오.
4.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.
