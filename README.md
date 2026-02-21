# Fast-Lint-MCP (QualityGate) 🚀

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. 고성능 Rust 기반 도구와 Native AST 분석을 결합하여 대규모 프로젝트에서도 즉각적인 피드백을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

### 1. ⚡ 다국어 고성능 Native AST 분석
*   **JS/TS, Python** 등 다양한 언어를 하나의 인터페이스로 분석합니다.
*   외부 CLI 호출 오버헤드를 제거하고 **`@ast-grep/napi`** 네이티브 바인딩을 사용하여 파일당 **10ms 이내**의 분석 속도를 보장합니다.
*   단순 텍스트 매칭이 아닌 구문 구조(AST)를 분석하여 함수/클래스의 정확한 복잡도를 계산합니다.

### 2. 🛡️ AI 에이전트 품질 게이트 (Agent Quality Gate)
이 MCP는 에이전트의 오작동과 환각을 잡아내는 **최종 품질 관문**입니다.
*   **환각 탐지 (Hallucination Guard)**: 존재하지 않는 라이브러리나 API, 파일 경로를 '있는 척' 사용하는 환각을 실시간 차단합니다.
*   **가짜 구현 탐지 (Semantic Audit)**: 로직 없이 결과값만 하드코딩하거나(`return true;`), 파라미터를 사용하지 않는 '가짜 로직'을 탐지합니다.
*   **테스트 커버리지 80% 강제**: 전체 커버리지가 **80% 미만**이거나 이전보다 하락하면 작업을 즉시 반려합니다.
*   **보안 감사 (Security Shield)**: `npm audit` 취약점 및 소스 코드 내 하드코딩된 Secret(API Key 등)을 자동으로 스캔합니다.
*   **변이 테스트 (Mutation Integrity)**: 코드의 논리 기호를 일시적으로 변형하여, 테스트가 실제 로직을 제대로 검증하는지 확인합니다. (가짜 테스트 적발)
*   **시니어 어드바이스 (Senior Advice)**: 코드의 가독성, 중첩도, 디자인 패턴을 분석하여 LLM 수준의 정성적 개선 가이드를 제공합니다.
*   **자가 치유 (Self-Healing)**: ESLint, Prettier, **Ruff**를 연동하여 사소한 스타일 위반 사항은 분석 과정에서 자동으로 수정합니다.

### 3. 🔄 범용 및 증분 분석 (Universal & Incremental Scan)
*   **Zero-Config**: 프로젝트에 설정 파일이 없어도 내장된 **Guardian Standard Rules**를 적용하여 즉시 작동합니다.
*   **스마트 리졸버**: 프로젝트 로컬 린터가 없으면 MCP 내장 엔진을 자동으로 찾아 사용하는 Fail-proof 구조입니다.
*   프로젝트 전체를 매번 스캔하는 대신, `git status` 및 `diff`를 활용하여 **변경된 파일만** 선별 분석합니다.
*   프로젝트 전체를 매번 스캔하는 대신, `git status` 및 `diff`를 활용하여 **변경된 파일만** 선별 분석합니다.
*   에이전트가 코드를 수정할 때마다 즉각적인 피드백을 'Zero-Latency'에 가깝게 제공합니다.

### 3. 🧩 지능형 아키텍처 진단
*   **순환 참조 탐지 (Circular Dependency)**: 모듈 간의 복잡한 의존성 구조를 파악하고 순환 참조가 발생한 경로를 즉시 보고합니다.
*   **미사용 파일 추적 (Orphan File)**: 어떤 파일에서도 참조되지 않는 '죽은 코드'를 찾아내어 삭제를 유도합니다.

### 4. 🛠️ 커스텀 룰 엔진 (Custom Rule Engine)
*   팀의 컨벤션이나 특정 안티 패턴을 방지하기 위해 사용자 정의 AST 패턴을 등록할 수 있습니다.
*   `.fast-lintrc.json` 설정을 통해 프로젝트별로 품질 기준을 유연하게 조정합니다.

### 5. 🗄️ SQLite 기반 품질 이력 관리
*   과거 세션의 품질 지표(커버리지, 라인 수 등)를 추적합니다.
*   이전 세션보다 지표가 악화될 경우(예: 테스트 커버리지 하락) 작업을 거부(REJECT) 신호를 보냅니다.

---

## 🛠️ 요구사항 (Prerequisites)

Fast-Lint-MCP는 최적의 성능을 위해 아래 도구들이 `PATH`에 설치되어 있어야 합니다.

*   **Node.js**: v18.0.0 이상
*   **ripgrep (rg)**: 기술 부채 스캔용 (`brew install ripgrep`)
*   **fd-find (fd)**: 파일 탐색 보조 (`brew install fd`)
*   **ast-grep (sg)**: AST 분석 엔진 (`brew install ast-grep`)
*   **Ruff (선택)**: Python 프로젝트 분석 및 자동 수정용 (`pip install ruff`)

---

## 🚀 설치 및 실행 (Setup)

### 1. 의존성 설치 및 빌드
```bash
npm install
npm run build
```

### 2. MCP 서버 등록 (Claude Desktop 예시)
`~/Library/Application Support/Claude/claude_desktop_config.json` 파일에 아래 설정을 추가하세요.

```json
{
  "mcpServers": {
    "fast-lint-mcp": {
      "command": "node",
      "args": ["/절대경로/to/fast-lint-mcp/dist/index.js"]
    }
  }
}
```

또는 Gemini CLI 사용 시:
`gemini mcp add -s user --trust fast-lint-mcp node /절대경로/to/fast-lint-mcp/dist/index.js`

---

## ⚙️ 설정 가이드 (Configuration)

프로젝트 루트에 `.fast-lintrc.json` 파일을 생성하여 품질 기준을 설정할 수 있습니다.

```json
{
  "incremental": true,
  "rules": {
    "maxLineCount": 300,
    "maxComplexity": 15,
    "minCoverage": 80,
    "techDebtLimit": 10
  }
}
```

---

## 📊 응답 구조 (Response Schema)

AI 에이전트는 서버의 `quality-check` 도구를 호출하여 아래와 같은 통합 리포트를 수신합니다.

```json
{
  "pass": false,
  "violations": [
    {
      "type": "HALLUCINATION",
      "file": "src/service.ts",
      "message": "[환각 경고] 존재하지 않는 파일 참조: ./missing-file"
    },
    {
      "type": "SECURITY",
      "file": "src/config.ts",
      "message": "[AWS_KEY] AWS Access Key 발견! 민감 정보는 환경 변수로 관리하세요."
    }
  ],
  "suggestion": "위 위반 사항들을 수정한 후 다시 인증을 요청하세요.\n\n[Self-Healing Result]\nESLint를 통해 스타일 위반 사항을 자동으로 수정했습니다."
}
```

---

## 🏗️ 아키텍처 개요 (Architecture)

본 프로젝트는 다국어 확장성과 유지보수성을 위해 **프로바이더 기반 아키텍처**를 따릅니다.

*   **`QualityProvider`**: 언어별(JS, Python 등) 품질 검사 및 자동 수정 로직을 캡슐화한 인터페이스.
    *   `JavascriptProvider`: ESLint, Prettier, AST-Grep 연동.
    *   `PythonProvider`: Ruff 연동.
*   **`AnalysisService`**: 등록된 프로바이더들을 관리하고 증분 분석 및 전체 품질 관문을 통제하는 핵심 서비스.
*   **`ConfigService`**: `Zod`를 이용한 설정 파일 검증 및 로드.
*   **`QualityDB`**: `better-sqlite3`를 활용한 품질 데이터 영속화.
*   **`Checkers/Analysis`**: 각 도구별(ast-grep, ripgrep, glob, fixer) 분석 기능 모듈화.

---

## 🧪 테스트 (Testing)

```bash
# 전체 단위 및 통합 테스트 실행
npm test
```

---

## 📄 라이선스 (License)
MIT License.

---

## 🤖 AI 에이전트 작업 규약 (Agent Protocol)

이 프로젝트에서 작업하는 모든 AI 에이전트는 아래의 워크플로우를 반드시 준수해야 합니다.

1.  **[사전 분석]**: 작업을 시작하기 전 **`fast-lint-mcp` 서버의 `quality-check` 도구**를 호출하여 현재 코드의 품질 기준(Baseline)을 확인합니다.
2.  **[품질 인증 필수]**: 작업을 마치고 사용자에게 보고하기 전, 반드시 **`fast-lint-mcp` 서버의 `quality-check` 도구**를 호출해야 합니다.
3.  **[자가 수정]**: 만약 `pass: false`가 반환된다면(환각 발생, 커버리지 80% 미달 등), 사용자에게 보고하지 말고 **스스로 코드를 수정하고 테스트를 보강**하여 다시 인증을 요청해야 합니다.
4.  **[최종 보고]**: 오직 `pass: true` 사인을 받은 경우에만 사용자에게 작업을 완료했다고 보고할 수 있습니다. 

**"품질은 타협의 대상이 아니며, 에이전트의 신뢰성은 `quality-check` 관문을 통과함으로써 증명됩니다."**
