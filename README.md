# Fast-Lint-MCP (QualityGate) 🚀 v2.1.2

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v2.1.2에서는 **ast-grep 배치 처리(Batching)** 기술을 도입하여 Rust 네이티브 엔진의 성능을 극한까지 끌어올렸습니다.

---

## ✨ 주요 기능 (Key Features)

### 1. ⚡ 초고속 Rust 배치 처리 아키텍처 - v2.1.2 UP!
Native Rust (`ast-grep`) 엔진의 성능을 100% 활용하도록 설계를 최적화했습니다.
*   **의존성 분석 통합**: 수십 개의 임포트 패턴을 단 하나의 규칙으로 통합하여 파일당 스캔 횟수를 최소화했습니다.
*   **미사용 코드 탐지 최적화**: 각 의존성 파일을 단 한 번만 파싱하고 내부의 모든 심볼 사용 여부를 동시에 판별하는 배치 처리 방식을 도입하여, 대규모 프로젝트 분석 속도를 획기적으로 개선했습니다.
*   **Zero-Cache 신뢰성**: 성능이 비약적으로 향상되어 캐시 없이도 실시간 분석이 가능하며, 언제나 최신 규칙이 즉각 반영됩니다.

### 2. 🇰🇷 Korean First 가독성 및 주석 규칙
AI 에이전트가 생성하는 코드의 가독성을 보장하기 위해 한국어 주석 작성을 강력히 강제합니다.
*   **맥락 인식 규칙 (Context-aware)**: 테스트 파일 및 디렉토리는 주석 강제 대상에서 제외하여 실무적인 편의성을 높였습니다.
*   **스코프 정밀 분석**: 전역 심볼과 지역 변수를 정확히 구분하여, 실제로 관리가 필요한 코드에 대해서만 주석을 요구합니다.
*   **범용 선언 지원**: ESM 및 CommonJS(Node.js) 패턴을 모두 지원합니다.

### 3. 📊 시각적 품질 리포트 (Pretty Reports)
MCP 클라이언트에서 보기 좋게 렌더링되는 **Markdown 기반의 유려한 리포트**를 제공합니다.
*   **투명한 분석 통계**: 리포트 하단에 서버 버전과 분석 근거(Git staging 등)를 명시합니다.
*   **상세 가이드**: 시니어 개발자의 관점에서 구체적인 리팩토링 방향을 제안합니다.

---

## ⚡ Built-in High Performance

Fast-Lint-MCP는 성능 최적화에 진심입니다.
*   **Zero-Install Performance**: 별도의 Rust 컴파일러 없이 즉시 작동하는 고성능 바이너리가 포함되어 있습니다.
*   **스마트 증분 분석**: 변경 사항 및 역의존성을 추적하여 꼭 필요한 범위만 정밀 분석합니다.

---

## 🧠 에이전트 전용 Skill (Semantic Guardian)

Gemini CLI용 전용 스킬을 통해 에이전트는 **"한글 주석 작성 원칙"**과 **"최소 토큰 작업 전략"**을 완벽히 이해하고 실행합니다.

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

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v2.1.2)

1.  **[한글 주석 우선]**: 모든 주요 클래스, 함수, 멤버 변수 위에는 반드시 한글 주석을 작성하십시오. (테스트 파일 제외)
2.  **[최소 읽기]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오.
3.  **[자가 검증]**: 코드 수정 후 반드시 `verify-fix`를 실행하여 테스트 통과 여부를 확인하십시오.
4.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.
