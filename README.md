# Fast-Lint-MCP 🚀 v3.7.0 (The Ultimate AI Architect)

**"AI가 만든 기술 부채를 뿌리 뽑고, 대규모 멀티모듈 아키텍처를 수호하는 지능형 품질 엔진"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 아키텍처 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. v3.7.0은 **Real-Time Turbo 엔진**과 **다국어(Polyglot) 지원**을 통해 엔터프라이즈급 프로젝트의 품질을 10초 이내에 정복합니다.

---

## ✨ 핵심 혁신 사항 (What's New in v3.0+)

### 1. ⚡ Real-Time Turbo 엔진 (Zero I/O & AST Caching)
Native Rust (`ast-grep`) 엔진의 성능을 200% 해방시켰습니다.
*   **AST Cache Manager**: 세션 내 중복 파싱을 완벽히 제거하여 대규모 프로젝트(수천 개 파일) 분석 속도를 수 분에서 **수 초**로 단축했습니다.
*   **Memory-Native Path Resolver**: 모든 파일 탐색 및 프로젝트 루트 탐색을 메모리에서 처리하여 디스크 I/O 병목을 제거했습니다.
*   **Parallel Dependency Graph**: 전 전용 코어를 풀가동하여 의존성 그래프를 병렬로 구축합니다.

### 2. 🏗️ 멀티모듈 & 계층적 분석 (Hierarchical Support)
복잡한 모노레포(NX, Turborepo, Yarn Workspaces) 환경을 완벽히 지원합니다.
*   **컨텍스트 인식 별칭(Alias)**: 분석 중인 파일에서 가장 가까운 `tsconfig.json`을 자동으로 찾아 별칭을 해소합니다.
*   **지능형 의존성 병합**: 서브 프로젝트와 루트 프로젝트의 `package.json`을 통합 분석하여 라이브러리 환각(Hallucination)을 오탐 없이 탐지합니다.

### 3. 🌐 다국어(Polyglot) 분석 엔진
이제 JavaScript/TypeScript를 넘어 더 넓은 생태계를 수호합니다.
*   **Kotlin Native Support**: Kotlin(`.kt`, `.kts`) 언어에 대한 네이티브 AST 품질 분석을 지원합니다.
*   **추상화 레이어**: 새로운 언어 프로바이더를 플러그인 형태로 즉시 추가할 수 있는 표준 파이프라인을 구축했습니다.

### 4. 🛡️ 프로젝트 성역화 (Global Storage & Hygiene)
사용자의 소중한 소스 코드를 조금도 오염시키지 않습니다.
*   **Global Storage**: 모든 상태값과 캐시는 `~/.fast-lint-mcp` 전역 저장소에 보관됩니다. 프로젝트 폴더는 100% 청정하게 유지됩니다.
*   **브랜치 격리(Isolation)**: Git 브랜치별로 품질 기준점을 독립적으로 관리하여 협업 중 발생하는 간섭을 차단했습니다.
*   **자동 위생 관리(GC)**: 30일 이상 접근하지 않은 오래된 데이터는 시스템이 스스로 삭제하여 디스크를 보호합니다.

---

## 📊 지능형 가드레일 (Smart Guardrails)

*   **Security Entropy**: 단순 키워드 매칭 대신 문자열 무작위성을 측정하여 실제 비밀번호만 정확히 탐지하고 색상 코드 등의 오탐을 제거합니다.
*   **Intelligent Coverage**: 테스트 리포트의 신선도(Freshness)를 검사하여 코드를 고치고 테스트를 누락하는 꼼수를 차단합니다.
*   **Refactoring Blueprint**: 복잡한 심볼 TOP 3를 특정하고, 코드 패턴(UI vs Logic)에 따른 **시니어급 리팩토링 가이드(Senior Advice)**를 제공합니다.
*   **Test Validity Check**: 단언문(expect, assert 등)이 없는 '가짜 테스트'를 AST 레벨에서 탐지합니다.

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

### 3. CLI 실전 분석 (외부 프로젝트 조준)
```bash
npx tsx src/index.ts --check --path /목표/프로젝트/경로
```

---

## 🛠️ 요구사항 (Prerequisites)

*   **Node.js**: v18.0.0 이상
*   **ripgrep (rg)**: 기술 부채 스캔용 (`brew install ripgrep`)
*   **Zero-Install Rust**: 별도의 Rust 설치가 필요 없습니다. (`@ast-grep/napi` 바이너리 내장)

---

## 🤖 AI 에이전트 작업 규약 (Agent Protocol v3.7.0)

1.  **[한글 주석 우선]**: 모든 주요 클래스, 함수, 멤버 변수 위에는 반드시 한글 주석을 작성하십시오. (테스트 파일 제외)
2.  **[최소 읽기]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 읽으십시오.
3.  **[품질 인증]**: 모든 작업 완료 전 반드시 `quality-check`를 호출하여 `pass: true`를 획득해야 합니다.
