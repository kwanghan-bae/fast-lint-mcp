# Fast-Lint-MCP (QualityGate) 🚀 v2.1.0

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v2.1.0에서는 **Zero-Cache (실시간 분석)** 아키텍처와 **CommonJS/ESM 통합 지원**을 통해 신뢰성과 범용성을 극대화했습니다.

---

## ✨ 주요 기능 (Key Features)

### 1. ⚡ Zero-Cache 실시간 분석 아키텍처 - v2.1.0 NEW!
기존의 SQLite 기반 캐시 시스템을 과감히 제거했습니다.
*   **신뢰성 100%**: "코드는 안 변했는데 규칙만 바뀐 경우" 캐시 때문에 예전 결과가 나오던 문제를 완벽히 해결했습니다. 이제 모든 분석은 **매 순간 실시간**으로 수행됩니다.
*   **초고속 분석**: Native Rust (`ast-grep`) 엔진의 압도적 성능 덕분에 캐시 없이도 수천 개의 파일을 **1초 미만**에 분석합니다.

### 2. 🇰🇷 Korean First 가독성 및 주석 규칙 - v2.1.0 UP!
AI 에이전트가 생성하는 코드의 가독성을 보장하기 위해 한국어 주석 작성을 강력히 강제합니다.
*   **범용 선언 지원**: ESM(`export`) 뿐만 아니라 Node.js의 **CommonJS(`module.exports`, `exports`)** 패턴까지 완벽히 인식합니다.
*   **클래스 및 멤버 전수 검사**: 클래스, 메서드, 멤버 변수(`Field`), 인터페이스, 타입 별칭에 대해 한글 주석이 없으면 품질 인증이 실패합니다.
*   **지능형 주석 탐색**: 코드와 주석 사이에 빈 줄이 있어도 위로 **최대 5줄**까지 추적하여 주석 존재 여부를 판단합니다.

### 3. 📊 시각적 품질 리포트 (Pretty Reports)
MCP 클라이언트(Gemini, Claude 등)에서 보기 좋게 렌더링되는 **Markdown 기반의 유려한 리포트**를 제공합니다.
*   **버전 및 통계 명시**: 리포트 하단에 **현재 서버 버전(v2.1.0)과 실제 분석된 파일 개수**를 표시하여 분석의 투명성을 보장합니다.
*   **상세 가이드**: 단순한 에러 표시를 넘어, 시니어 개발자의 관점에서 구체적인 리팩토링 방향을 제안합니다.

### 4. 🤖 자율형 자가 치유 (Self-Healing Loop)
에이전트가 코드를 수정하고 스스로 검증하는 루프를 제공합니다.
*   **검증 자동화 (`verify-fix`)**: 수정 후 자동으로 테스트를 실행하고, 실패 시 에러 로그를 분석하여 자가 재수정을 수행합니다.
*   **테스트 커버리지 가드**: 커버리지 파일 누락이나 수치 하락을 엄격하게 감지하여 품질 저하를 원천 차단합니다.

---

## ⚡ Built-in High Performance

Fast-Lint-MCP는 성능 최적화에 진심입니다.
*   **Zero-Install Performance**: 별도의 Rust 컴파일러 없이 `npm install` 만으로 즉시 작동하는 사전 빌드된 고성능 바이너리가 포함되어 있습니다.
*   **경로 하드코딩 제거**: `src/` 디렉토리에 국한되지 않고 프로젝트 루트부터 전체를 지능적으로 탐색합니다.

---

## 🧠 에이전트 전용 Skill (Semantic Guardian)

v2.1.0은 Gemini CLI용 최신 스킬을 포함합니다. 이를 통해 에이전트는 **"한글 주석 작성 원칙"**과 **"최소 토큰 작업 전략"**을 완벽히 이해하고 실행합니다.

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

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v2.1.0)

1.  **[한글 주석 우선]**: 모든 주요 클래스, 함수, 멤버 변수 위에는 반드시 한글 주석을 작성하십시오. (ESM/CJS 공통)
2.  **[최소 읽기]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오.
3.  **[자가 검증]**: 코드 수정 후 반드시 `verify-fix`를 실행하여 테스트 통과 여부를 확인하십시오.
4.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.
