# 🤖 AI 에이전트 지능형 활용 및 설치 가이드 (v3.0)

이 문서는 AI 코딩 에이전트(Antigravity, Cursor, Claude Code, Gemini CLI 등)가 `fast-lint-mcp`를 **자율적이고 효율적으로** 활용하도록 하기 위한 고급 가이드입니다.

---

## ⚡ 공통 설치 (Prerequisites)

먼저 로컬 환경에 프로젝트를 설치하고 빌드합니다.
```bash
git clone https://github.com/your-username/fast-lint-mcp.git ~/fast-lint-mcp
cd ~/fast-lint-mcp
npm install
npm run build
```

---

## 1. Google Antigravity 🪐 (에이전트 중심 IDE)
Antigravity는 에이전트가 스스로 판단하고 행동하는 IDE입니다. 병목을 줄이기 위해 `autoApprove` 설정이 필수적입니다.

### ✅ 최적화 설정 (`~/.gemini/antigravity/mcp_config.json`)
아래와 같이 `autoApprove` 배열을 추가하여 에이전트가 중단 없이 분석을 수행하게 하세요.

```json
{
  "mcpServers": {
    "fast-lint": {
      "command": "node",
      "args": ["/절대경로/to/fast-lint-mcp/dist/index.js"],
      "autoApprove": [
        "get-symbol-metrics",
        "get-symbol-content",
        "find-references",
        "analyze-impact",
        "verify-fix",
        "quality-check"
      ]
    }
  }
}
```
*Tip: 분석 및 검증 도구를 자동 승인하면 에이전트가 사용자 개입 없이 자율적으로 코드의 문제점을 파악하고 수정 성공 여부를 확인할 수 있습니다.*

---

## 2. Cursor IDE 🚀
Cursor는 `.cursorrules` 파일을 통해 에이전트의 페르소나와 도구 사용 방식을 제어할 수 있습니다.

### ✅ 워크스페이스 최적화 (`.cursorrules`)
프로젝트 루트에 아래 내용을 추가하여 에이전트의 '품질 관리 능력'을 극대화하세요.
```markdown
[Fast-Lint-MCP 사용 지침]
- 전체 코드를 읽는 대신 `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 정밀하게 읽어라.
- 코드 수정 전, 반드시 `analyze-impact`를 호출하여 연관된 파일이나 테스트 코드에 미칠 영향을 먼저 파악하라.
- 수정한 후에는 내장된 `verify-fix`와 `quality-check`를 호출하여 시스템적으로 성공 여부를 증명하라.
```

---

## 3. Claude Code (CLI) 📥
Claude Code는 전용 MCP 관리 명령어를 제공합니다.

### ✅ 등록 명령어
```bash
claude mcp add fast-lint -- node /절대경로/to/fast-lint-mcp/dist/index.js
```

---

## 🧠 에이전트 핵심 행동 지침 (SOP)

모든 에이전트는 `fast-lint-mcp`를 사용할 때 다음 **3단계 워크플로우**를 준수해야 최상의 성능을 냅니다.

### Phase 1: 정밀 탐색 (Surgical Discovery)
- **Problem**: 큰 파일을 `read_file`로 전부 읽으면 토큰이 낭비되고 에이전트가 길을 잃습니다.
- **Solution**: `get-symbol-metrics`로 구조를 파악하고, 수정이 필요한 특정 함수나 클래스만 `get-symbol-content`로 읽어 컨텍스트를 압축하세요.

### Phase 2: 영향 분석 (Impact Analysis)
- **Problem**: 코드 수정 후 예상치 못한 곳에서 버그가 발생합니다.
- **Solution**: 수정 전에 `find-references`로 사용처를 모두 찾고, `analyze-impact`를 실행하여 어떤 테스트 파일이 영향을 받는지 미리 확인한 뒤 계획을 세우세요.

### Phase 3: 시스템 검증 (Systematic Validation)
- **Problem**: "수정했습니다"라는 말만 믿고 실제로는 빌드가 깨지는 경우가 많습니다.
- **Solution**: 수정 후 반드시 `verify-fix`를 호출하여 테스트 통과를 증명하고, `quality-check`로 복잡도나 보안 이슈가 추가되지 않았는지 최종 확인하세요.

---

## 🛠️ 고급 환경변수 (Environment Variables)
도구의 동작을 미세 조정하려면 MCP 설정의 `env` 섹션을 활용하세요.

- `FAST_LINT_MAX_LINES`: 분석할 파일의 최대 길이 제한 (기본값: 1000)
- `FAST_LINT_DEBUG`: 상세 로그 출력 여부 (`true`/`false`)

---

## ✅ 검증 질문
에이전트가 설치를 완료했다면 다음 질문으로 지능을 테스트해보세요:
> "현재 프로젝트에서 가장 복잡도가 높은(Cyclomatic Complexity) 함수 3개를 찾아내고, 그 중 하나를 수정했을 때 어떤 파일들에 영향이 가는지 분석해줘."

성공적으로 도구를 체이닝하여 응답한다면, 당신의 에이전트는 **지능형 품질 가디언**이 된 것입니다! 🎉
