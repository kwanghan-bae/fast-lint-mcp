# 🤖 AI 에이전트 지능형 활용 및 설치 가이드 (v3.2)

이 문서는 AI 코딩 에이전트(Antigravity, Cursor, Claude Code 등)가 `fast-lint-mcp`를 통해 **노이즈 없는 정밀 분석**과 **데이터 기반 리팩토링**을 수행하도록 돕는 공식 가이드입니다.

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
아래의 JSON 설정을 통해 에이전트가 승인 팝업 없이 중단 없는 분석을 수행하도록 하십시오. (경로 `/Users/joel/Desktop/git/fast-lint-mcp` 부분은 실제 설치 경로로 확인 후 수정하십시오.)

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

## 🧠 에이전트 지능형 워크플로우 (SOP)

에이전트는 분석 시 다음의 **'노이즈 제거'** 및 **'경로 검증'** 규칙을 반드시 준수해야 합니다.

### Step 1: 노이즈 없는 종합 진단 (Clean Diagnosis)
- **Tool**: `quality-check`
- **Action**: 프로젝트 전체의 복잡도와 보안 취약점을 스캔하십시오. 이때 빌드 결과물이나 외부 라이브러리가 포함되지 않도록 `exclude_pattern`을 반드시 사용해야 합니다.
- **필수 제외 패턴**: `dist/**`, `node_modules/**`, `.git/**`, `build/**`
- **Tip**: 에이전트는 작성된 소스 코드의 품질에만 집중하고, 생성된 아티팩트는 분석 대상에서 제외하십시오.

### Step 2: 정밀 타격 탐색 및 경로 교차 검증 (Surgical Discovery & Cross-Validation)
- **Tools**: `get-symbol-metrics`, `get-symbol-content`
- **Problem**: `PathResolver`가 가끔 실제 파일을 'HALLUCINATION'으로 오판할 경우(파일이 실제로는 존재하나 도구가 못 찾는 경우)가 있습니다.
- **Action**: 도구가 "파일 없음"을 보고할 경우, 즉시 쉘 명령(`ls -l [경로]`)을 통해 물리적 존재 여부를 **교차 검증**하십시오. 만약 파일이 존재한다면, 도구에게 해당 경로를 '절대 경로'로 다시 전달하여 재시도하십시오.

### Step 3: 파급 효과 분석 (Impact Analysis)
- **Tools**: `find-references`, `analyze-impact`
- **Action**: 수정을 시작하기 전, 해당 심볼을 참조하는 모든 위치를 찾고 `analyze-impact`를 통해 깨질 수 있는 테스트 케이스를 목록화하십시오.

### Step 4: Senior Advice 기반 리팩토링 및 검증 (Architecture & Validation)
- **Tool**: `verify-fix`, `quality-check`
- **Action**: `quality-check`의 결과 중 **`Senior Advice`** 섹션을 유심히 읽으십시오. 단순히 코드가 길다는 지적을 넘어, "서비스 레이어로 로직을 분리하라"는 등의 구체적 아키텍처 개선안을 사용자에게 제안하십시오. 수정한 후에는 반드시 `verify-fix`를 호출하여 성공 여부를 입증하십시오.

---

## 🚀 에이전트 주입용 시스템 프롬프트 (System Instruction)
이 내용을 에이전트의 **Agent Instructions**나 **.cursorrules**에 복사해 넣으세요.

```text
[Fast-Lint-MCP Priority Workflow v3.2]
1. (진단) 분석 요청 시 `quality-check`를 호출하되, `dist`, `node_modules`는 분석 대상에서 명시적으로 제외하라.
2. (압축) 코드 탐색 시 `get-symbol-content`를 우선 사용하여 토큰 사용량을 최소화하라.
3. (경로 신뢰) 도구가 파일 경로 오류(HALLUCINATION)를 보고하면, 반드시 `ls` 명령어로 물리적 존재를 교차 검증한 뒤 보고하라.
4. (아키텍처) `Senior Advice` 섹션을 활용해 단순 수정을 넘어선 '아키텍처 리팩토링 방향'을 제안하라.
5. (검증) 모든 작업의 마무리는 `verify-fix` 호출 결과로 증명하라.
```

---

## 🛠️ 고급 설정: 동적 파라미터 튜닝
에이전트는 상황에 따라 도구의 파라미터를 조절하여 더 정밀한 결과를 얻을 수 있습니다.
- 보안 감도가 낮거나 특정 임계값 조정이 필요하다면: `quality-check` 호출 시 `securityThreshold`나 `maxComplexity` 값을 동적으로 조절하십시오.
- 특정 파일만 깊게 보고 싶다면: `targetPath`를 특정 디렉토리로 좁혀서 호출하십시오.

---

## ✅ 설치 검증 (Verification)
에이전트에게 이렇게 질문하여 피드백 반영 여부를 확인하세요:
> "이 프로젝트에서 `dist` 폴더를 제외하고(`exclude_pattern`), 복잡도가 가장 높은 파일을 찾아 `Senior Advice`를 바탕으로 리팩토링 계획을 세워줘."
