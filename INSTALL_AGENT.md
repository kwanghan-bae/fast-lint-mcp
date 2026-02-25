# 🤖 AI Agent Setup Guide (v2.0)

이 문서는 다양한 AI 코딩 에이전트(Claude Code, Cursor, GitHub Copilot, Gemini CLI, Antigravity, OpenCode)에 `Fast-Lint-MCP`를 연동하기 위한 공식 가이드입니다. 

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

## 1. Claude Code (CLI) 📥
Claude Code는 전용 MCP 관리 명령어를 제공합니다.

### ✅ 자동 설정 (추천)
에이전트에게 다음 명령어를 실행하도록 하세요:
```bash
claude mcp add fast-lint -- node /절대경로/to/fast-lint-mcp/dist/index.js
```

### ✅ 수동 설정 (`~/.claude.json`)
```json
{
  "mcpServers": {
    "fast-lint": {
      "command": "node",
      "args": ["/Users/username/fast-lint-mcp/dist/index.js"]
    }
  }
}
```

---

## 2. Cursor IDE 🚀
Cursor는 GUI와 설정 파일을 통해 MCP를 지원합니다. (v0.45.x 이상 권장)

### ✅ GUI 설정
1. `Cursor Settings (Cmd+Shift+J)` -> `Features` -> `MCP Servers`로 이동합니다.
2. `+ Add New MCP Server`를 클릭합니다.
   - **Name**: `fast-lint`
   - **Type**: `command`
   - **Command**: `node /절대경로/to/fast-lint-mcp/dist/index.js`

### ✅ 수동 설정 (`~/.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "fast-lint": {
      "command": "node",
      "args": ["/Users/username/fast-lint-mcp/dist/index.js"]
    }
  }
}
```

---

## 3. GitHub Copilot (VS Code) 🐙
최신 VS Code(1.99+)와 Copilot Chat Agent 모드에서 MCP를 지원합니다.

### ✅ 워크스페이스 설정 (`.vscode/mcp.json`)
프로젝트 루트에 파일을 생성하면 Copilot이 자동으로 인식합니다.
```json
{
  "servers": {
    "fast-lint": {
      "command": "node",
      "args": ["/Users/username/fast-lint-mcp/dist/index.js"]
    }
  }
}
```
*설정 후 Copilot Chat 상단의 모드를 **"Agent"**로 변경하고 도구 아이콘에서 `fast-lint`를 활성화하세요.*

---

## 4. Gemini CLI 🛡️
Gemini CLI는 신뢰 설정을 포함한 전용 등록 명령어를 사용합니다.

### ✅ 등록 명령어
```bash
gemini mcp add -s user --trust fast-lint node /절대경로/to/fast-lint-mcp/dist/index.js
```

---

## 5. Google Antigravity 🪐
에이전트 중심 AI IDE인 Antigravity는 전용 설정 파일을 사용합니다.

### ✅ 수동 설정 (`~/.gemini/antigravity/mcp_config.json`)
파일을 열고 아래 내용을 추가하거나, 에이전트에게 설정을 요청하세요.
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

## 6. OpenCode (TUI/Desktop) 💻
오픈 소스 AI 코딩 에이전트인 OpenCode는 프로젝트 루트 설정을 권장합니다.

### ✅ 프로젝트 설정 (`opencode.json`)
프로젝트 루트에 파일을 생성합니다.
```json
{
  "mcp": {
    "fast-lint": {
      "type": "local",
      "command": ["node", "/절대경로/to/fast-lint-mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

---

## 🧠 에이전트 핵심 SOP (준수 사항)

모든 에이전트는 `fast-lint-mcp`를 사용할 때 다음 규칙을 지켜야 합니다:

1.  **[정밀 탐색]**: `read_file` 대신 `get-symbol-metrics`와 `get-symbol-content`를 우선 사용하세요. (토큰 절약)
2.  **[관계 파악]**: 수정 전 `find-references`와 `analyze-impact`로 영향 범위를 확인하세요.
3.  **[자가 검증]**: 코드 수정 후 반드시 `verify-fix`를 실행하여 테스트 통과를 확인하세요.
4.  **[Zero-Install Rust]**: 별도의 Rust 설치 없이도 내장된 네이티브 엔진(`@ast-grep/napi`)이 고속으로 작동함을 인지하세요.

---

## ✅ 설치 검증 (Verification)

설치가 완료되면 에이전트에게 다음 질문을 던져보세요:
> "현재 프로젝트의 코드 품질을 분석하고, 새로 추가된 find-references 도구를 호출할 수 있는지 확인해줘."

성공적으로 도구를 호출한다면 지능형 품질 가디언이 활성화된 것입니다! 🎉
