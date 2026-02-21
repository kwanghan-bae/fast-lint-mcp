# Fast-Lint-MCP (QualityGate) 🚀

**"AI가 만든 기술 부채를 AI 스스로 해결하게 만드는 지능형 품질 검속 서버"**

Fast-Lint-MCP는 AI 에이전트(Claude, Gemini 등)가 작성한 코드의 품질을 실시간으로 감시하고, 정해진 기준을 통과하지 못할 경우 리팩토링을 강제하는 **Model Context Protocol (MCP)** 서버입니다. 고성능 Rust 기반 도구와 Native AST 분석을 결합하여 대규모 프로젝트에서도 즉각적인 피드백을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

### 1. ⚡ 고성능 Native AST 분석
*   외부 CLI 호출 오버헤드를 제거하고 **`@ast-grep/napi`** 네이티브 바인딩을 사용하여 파일당 **10ms 이내**의 분석 속도를 보장합니다.
*   단순 텍스트 매칭이 아닌 구문 구조(AST)를 분석하여 함수/클래스의 정확한 복잡도를 계산합니다.

### 2. 🛡️ AI 에이전트 품질 게이트 (Agent Quality Gate)
이 MCP는 에이전트의 오작동과 환각을 잡아내는 **최종 품질 관문**입니다.
*   **환각 탐지 (Hallucination Guard)**: 존재하지 않는 라이브러리나 API, 파일 경로를 '있는 척' 사용하는 환각을 실시간 차단합니다.
*   **가짜 구현 탐지 (Semantic Audit)**: 로직 없이 결과값만 하드코딩하거나(`return true;`), 파라미터를 사용하지 않는 '가짜 로직'을 탐지합니다.
*   **테스트 커버리지 80% 강제**: 전체 커버리지가 **80% 미만**이거나 이전보다 하락하면 작업을 즉시 반려합니다.

### 3. 🔄 Git 기반 증분 분석 (Incremental Scan)
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
    "fast-lint": {
      "command": "node",
      "args": ["/절대경로/to/fast-lint-mcp/dist/index.js"]
    }
  }
}
```

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
  },
  "customRules": [
    {
      "id": "no-console",
      "pattern": "console.log($$$)",
      "message": "프로덕션 코드에는 console.log를 남기지 마세요.",
      "severity": "error"
    }
  ]
}
```

---

## 📊 응답 구조 (Response Schema)

AI 에이전트는 서버의 `quality-check` 도구를 호출하여 아래와 같은 정량적 리포트를 수신합니다.

```json
{
  "pass": false,
  "violations": [
    {
      "type": "SIZE",
      "file": "src/auth.ts",
      "value": 420,
      "limit": 300,
      "message": "단일 파일 300줄 초과: 파일 분리 필요"
    },
    {
      "type": "CUSTOM",
      "file": "src/index.ts",
      "message": "[no-console] 프로덕션 코드에는 console.log를 남기지 마세요."
    }
  ],
  "suggestion": "src/auth.ts 로직을 분리하고 console.log를 제거한 후 다시 시도하세요."
}
```

---

## 🏗️ 아키텍처 개요 (Architecture)

본 프로젝트는 유지보수성과 확장성을 위해 레이어드 아키텍처를 따릅니다.

*   **`AnalysisService`**: 증분 분석, 순환 참조 탐지, 품질 비교 로직을 통합 관리하는 핵심 서비스.
*   **`ConfigService`**: `Zod`를 이용한 설정 파일 검증 및 로드.
*   **`QualityDB`**: `better-sqlite3`를 활용한 품질 데이터 영속화.
*   **`Checkers/Analysis`**: 각 도구별(ast-grep, ripgrep, glob) 분석 기능 모듈화.

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
