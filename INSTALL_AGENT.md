# 🤖 AI 에이전트 지능형 활용 및 설치 가이드 (v3.5)

이 문서는 AI 코딩 에이전트(Antigravity, Cursor, Claude Code 등)가 `fast-lint-mcp`를 통해 **설정 파일 하나 없이(Zero-Config)** 정밀 분석과 리팩토링을 수행하도록 돕는 공식 가이드입니다.

---

## ⚡ 공통 설치 (Prerequisites)

먼저 로컬 환경에 프로젝트를 설치하고 빌드합니다.
```bash
git clone https://github.com/your-username/fast-lint-mcp.git ~/fast-lint-mcp
cd ~/fast-lint-mcp
npm install
npm run build
```
*중요: 설치 후 `pwd` 명령어로 확인한 **절대 경로**를 아래 설정에서 사용하십시오.*

---

## 1. Google Antigravity 🪐 (Agent-First IDE)
Antigravity는 에이전트의 자율성을 극대화하기 위해 `autoApprove` 설정이 필수입니다.

### ✅ 최적화 설정 (`~/.gemini/antigravity/mcp_config.json`)
**v5.3.0 업데이트**: 이 도구는 **Zero-Config** 엔진입니다. `.fast-lintrc.json` 파일을 만들 필요가 전혀 없습니다. (경로 `/Users/joel/Desktop/git/fast-lint-mcp` 부분은 실제 설치 경로로 수정하십시오.)

```json
{
  "mcpServers": {
    "fast-lint-mcp": {
      "command": "node",
      "args": ["/Users/joel/Desktop/git/fast-lint-mcp/dist/index.js"],
      "autoApprove": [
        "quality-check",
        "get-symbol-metrics",
        "get-symbol-content",
        "find-references",
        "analyze-impact",
        "verify-fix"
      ]
    }
  }
}
```
*효과: 분석 및 읽기 도구를 자동 승인하면 에이전트가 사용자 방해 없이 수초 내에 전체 아키텍처를 파악합니다.*

---

## 🧠 에이전트 지능형 워크플로우 (SOP) - [v3.5 Pure Zero-Config]

에이전트는 분석 시 다음의 **'순수성 유지'** 및 **'지능형 탐색'** 규칙을 준수하십시오.

### Step 1: 지능형 종합 진단 (Intelligent Diagnosis)
- **Tool**: `quality-check`
- **Zero Pollution**: 이 프로젝트에는 설정 파일(.fast-lintrc.json)을 생성하지 마십시오. 엔진은 내장된 시니어급 기본값으로 완벽하게 작동합니다.
- **Action**: 에이전트는 즉시 프로젝트 전체 진단을 수행하십시오. 엔진이 `node_modules`, `dist` 등을 자동으로 제외하므로 노이즈 걱정이 없습니다.

### Step 2: 자동 Deep Dive 활용
- **Feature**: `quality-check` 리포트 하단의 **[🔍 Deep Dive]** 섹션에서 문제 함수의 상세 지표(복잡도 등)를 즉시 확인하십시오. 별도의 도구 호출 없이 다음 단계로 넘어갈 수 있습니다.

### Step 3: 정밀 추출 및 영향 분석
- **Tools**: `get-symbol-content`, `analyze-impact`
- **Action**: 정제된 심볼 데이터를 바탕으로 필요한 로직만 추출하고, 수정 전 반드시 부수 효과를 파악하십시오.

### Step 4: 시스템적 증명 (Validation)
- **Tool**: `verify-fix`
- **Action**: 수정을 마친 후에는 반드시 이 도구를 호출하여 성공을 증명하십시오.

---

## 🚀 에이전트 주입용 시스템 프롬프트 (System Instruction)
이 내용을 에이전트의 **Agent Instructions**나 **.cursorrules**에 복사해 넣으세요.

```text
[Fast-Lint-MCP Zero-Config Workflow v3.5]
1. (Zero-Pollution) 이 프로젝트에는 설정 파일을 생성하지 마라. 엔진의 내장 기본값(Senior Defaults)을 신뢰하라.
2. (진단) 분석 요청 시 `quality-check`를 최우선 호출하고, 하단의 [Deep Dive] 섹션 데이터를 즉시 활용하라.
3. (압축) 코드 탐색 시 `get-symbol-content`를 우선 사용하여 필요한 로직만 정밀하게 추출하라.
4. (경로 신뢰) 도구가 파일 경로 오류(HALLUCINATION)를 보고하면, 반드시 `ls` 명령어로 물리적 존재를 교차 검증하라.
5. (검증) 모든 작업의 마무리는 `verify-fix` 호출 결과로 증명하라.
```

---

## ✅ 설치 검증 (Verification)
에이전트에게 이렇게 질문하여 피드백 반영 여부를 확인하세요:
> "이 프로젝트의 품질을 진단하고(`quality-check`), 가이드(`guide`)를 호출해 너의 분석 전략을 나에게 설명해줘."
