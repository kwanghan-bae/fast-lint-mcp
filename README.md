# Fast-Lint-MCP (QualityGate) 🚀 v2.0

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v2.0에서는 **Semantic Analysis(ts-morph)** 엔진과 **Self-Healing(자가 치유)** 루프를 도입하여 에이전트의 자율성과 정확도를 극대화했습니다.

---

## ✨ 주요 기능 (Key Features)

### 1. 🔍 세만틱 분석 및 네비게이션 (The Brain) - v2.0 UP!
단순 텍스트 검색을 넘어 코드의 구조와 관계를 이해합니다.
*   **하이브리드 분석 엔진**: 고속 의존성 분석은 **Native Rust (ast-grep)**가, 정밀 심볼 분석은 **TypeScript Compiler API (ts-morph)**가 담당하여 성능과 정확도를 모두 잡았습니다.
*   **정밀 탐색 (`find-references`, `go-to-definition`)**: 특정 심볼이 어디서 사용되는지 찾고, 정의 위치로 즉시 이동합니다.
*   **최소 읽기 (`get-symbol-content`)**: 수정이 필요한 특정 함수의 코드만 추출하여 읽어 토큰을 획기적으로 절약합니다.
*   **영향도 추적 (`analyze-impact`)**: 수정 시 영향을 받는 파일과 관련 테스트 케이스를 즉시 분석합니다.

### 2. 🛡️ 아키텍처 가드레일 (The Specialist) - v2.0 NEW!
프로젝트의 구조적 무결성을 강제합니다.
*   **의존성 방향 제어**: "도메인 레이어는 인프라 레이어를 참조할 수 없다"와 같은 규칙을 설정하여 아키텍처 오염을 방지합니다.
*   **미사용 코드 탐지 (`find-dead-code`)**: 호출되지 않는 Export 심볼을 찾아 기술 부채를 정리합니다.

### 3. 🤖 자율형 자가 치유 (Self-Healing Loop) - v2.0 NEW!
에이전트가 코드를 수정하고 스스로 검증합니다.
*   **검증 자동화 (`verify-fix`)**: 수정 후 자동으로 테스트 명령어를 실행하여 성공 여부를 확인합니다.
*   **피드백 루프**: 테스트 실패 시 에러 로그를 분석하여 모델이 스스로 코드를 재수정하도록 유도합니다.

### 4. ⚡ 고성능 엔진 및 증분 분석
*   **지능형 고속 증분 분석 (Native-Powered)**: 내장된 Rust 기반 AST 엔진(`@ast-grep/napi`)을 사용하여 프로젝트 분석 시간을 1분 이상에서 **1초 미만**으로 단축했습니다.
*   **Zero-Install Performance**: 별도의 Rust 컴파일러(`cargo`) 설치 없이도 `npm install`만으로 즉시 작동하는 사전 빌드된 고성능 엔진이 기본 탑재되어 있습니다.
*   **멀티 언어 확장성**: `QualityProvider` 인터페이스를 통해 다양한 언어 분석기를 쉽게 추가할 수 있는 플러그인 구조를 갖추고 있습니다.

---

## ⚡ Built-in High Performance

Fast-Lint-MCP v2.0은 대규모 프로젝트에서도 쾌적한 환경을 제공하기 위해 최적화되었습니다.
*   **Native AST 파싱**: TypeScript Compiler API 대신 Rust 기반 파서를 사용하여 수천 개의 파일을 순식간에 분석합니다.
*   **스마트 증분 분석**: 변경된 파일과 직접적으로 연관된 의존성 그래프만 정밀하게 추적하여 불필요한 분석을 차단합니다.

---

## 🧠 에이전트 전용 Skill (Semantic Guardian)

v2.0은 Gemini CLI용 전용 스킬을 포함합니다. 이를 통해 에이전트는 **"최소 토큰 작업 전략"**과 **"자가 치유 워크플로우"**를 스스로 학습하고 실행합니다.

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

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v2.0)

이 프로젝트에서 작업하는 에이전트는 아래 SOP를 준수해야 합니다.

1.  **[정밀 탐색]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오.
2.  **[관계 파악]**: 수정 전 `find-references`와 `analyze-impact`를 통해 영향 범위를 완벽히 파악하십시오.
3.  **[자가 검증]**: 코드 수정 후 반드시 `verify-fix`를 실행하여 테스트 통과 여부를 확인하십시오.
4.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.

**"이제 당신의 AI 에이전트는 단순한 코더를 넘어, 프로젝트의 구조를 이해하고 스스로를 교정하는 전문가로 활동합니다."**
