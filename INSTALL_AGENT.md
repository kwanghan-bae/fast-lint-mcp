# 🤖 AI 에이전트 지능형 활용 가이드 (v6.0)

이 문서는 AI 코딩 에이전트가 `fast-lint-mcp`를 **환각 판사(Hallucination Judge)**로 삼아 무결한 코드를 작성하도록 돕는 가이드입니다.

---
## ⚡ 로컬 실행 및 검증 (Local Development)

아직 npm에 배포되지 않은 상태이므로, 로컬에서 다음 명령어로 기능을 검증하거나 에이전트와 연동하십시오.

### 1. 1회성 진단 실행
```bash
# 프로젝트 루트에서
npx . check
```

### 2. 배포된 것처럼 시스템에 등록 (권장)
```bash
npm link
# 이제 어디서든 아래 명령어로 실행 가능합니다.
fast-lint-mcp check
```

---

## 1. Google Antigravity & IDE 설정
MCP 서버 연동 시 로컬 빌드 경로를 직접 지정하는 것이 가장 안정적입니다.

### ✅ MCP 서버 설정 (`mcp_config.json`)
```json
{
  "mcpServers": {
    "fast-lint-mcp": {
      "command": "node",
      "args": ["/Users/joel/Desktop/git/fast-lint-mcp/dist/cli.js"],
...
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

---

## 🧠 에이전트 핵심 행동 지침 (SOP v6.0)

모든 에이전트는 **진단 - 추출 - 수정 - 재진단**의 무한 루프를 준수해야 합니다.

### Step 1: 결정론적 진단 (The Judge)
- **Tool**: `quality-check`
- **Role**: 당신이 작성한 코드에 존재하지 않는 API 호출(환각)이 있는지 판결을 받으십시오. 
- **Rule**: `HALLUCINATION` 위반 발생 시, 당신의 지능을 과신하지 말고 즉시 `go-to-definition`으로 실재를 확인하십시오.

### Step 2: 자가 수정 및 재검증 (Self-Correction)
- **Action**: 위반 사항을 수정한 후, **반드시 다시 `quality-check`를 호출**하여 판사의 승인(PASS)을 받으십시오.
- **Goal**: 리포트 결과가 `PASS`가 되기 전까지 당신의 작업은 끝난 것이 아닙니다.

---

## 🚀 에이전트 전용 시스템 프롬프트
이 내용을 에이전트 설정에 주입하여 '무결성 본능'을 강화하십시오.

```text
[Fast-Lint-MCP v6.0 Judge Mandates]
1. (판사 준수) `quality-check` 리포트는 당신의 실수를 감시하는 절대적인 기준이다.
2. (환각 차단) `HALLUCINATION` 탐지 시 즉시 실재하는 API 시그니처를 재확인하고 자가 수정하라.
3. (증명 의무) 모든 수정의 끝은 `quality-check` PASS 결과로 사용자에게 증명하라.
4. (순수성) 프로젝트 오염(설정 파일 생성)을 절대 금지하라.
```

---

## ✅ 설치 검증 (Verification)
에이전트에게 이렇게 질문하여 v6.0 지능을 확인하세요:
> "가이드(`guide`)를 호출하여 너의 새로운 임무를 숙지하고, 현재 프로젝트에 내가 모르는 환각(Hallucination)이 있는지 결정론적으로 진단해줘."
