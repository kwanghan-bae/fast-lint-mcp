# 🤖 AI Agent Setup Guide

> **코딩 에이전트(Claude Desktop, Gemini CLI 등)를 위한 자동 설치 가이드입니다.**

이 문서를 에이전트에게 보여주면, 에이전트가 스스로 `Fast-Lint-MCP`를 설치하고 환경 설정을 완료할 수 있습니다.

---

## ⚡ 원라이너 설치 (One-Liner Install)

에이전트에게 아래 명령어를 실행하도록 지시하세요. 이 명령어는 프로젝트를 클론하고, 빌드하며, MCP 서버 설정을 자동으로 추가합니다.

```bash
# 1. 필수 도구 설치 (macOS 기준)
brew install node jq ripgrep fd ast-grep

# 2. 프로젝트 설치 및 설정 (경로는 상황에 맞게 수정 가능)
git clone https://github.com/your-username/fast-lint-mcp.git ~/fast-lint-mcp && 
cd ~/fast-lint-mcp && 
npm install && 
npm run build && 
chmod +x scripts/setup_mcp.sh && 
./scripts/setup_mcp.sh
```

---

## 🔧 수동 설정 (Manual Configuration)

자동 스크립트가 실패할 경우, 아래 단계를 따르세요.

### 1. 빌드 확인
```bash
cd ~/fast-lint-mcp
npm run build
# dist/index.js 파일이 생성되었는지 확인
ls -l dist/index.js
```

### 2. MCP 설정 파일 수정
`~/Library/Application Support/Claude/claude_desktop_config.json` 파일을 열고 아래 내용을 추가하세요.

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
*(주의: `/Users/username` 부분은 실제 사용자 홈 디렉토리 경로로 변경해야 합니다.)*

---

## ✅ 설치 검증 (Verification)

설치가 완료되면 Claude Desktop을 재시작하고, 에이전트에게 다음 질문을 던져보세요:

> "현재 프로젝트의 코드 품질을 분석해줘."

에이전트가 `fast-lint` 서버의 `quality-check` 도구를 호출하여 리포트를 생성한다면 성공입니다! 🎉
