# Gemini CLI Skill Registration Guide 🛡️

이 문서는 `fast-lint-mcp` v2.0의 세만틱 분석 능력을 극대화하기 위해, Gemini CLI에 **Semantic Guardian** 스킬을 등록하고 활용하는 방법을 설명합니다.

---

## 1. Skill 등록 방법 (Registration)

현재 프로젝트에 포함된 스킬을 Gemini CLI의 글로벌 환경에 등록하여, 모든 프로젝트에서 이 전문 지식을 사용할 수 있도록 설정합니다.

### 🔗 심볼릭 링크(Symbolic Link) 등록 (권장)
현재 프로젝트의 소스 코드가 수정되면 글로벌 스킬도 즉시 업데이트되는 방식입니다.
```bash
# 프로젝트 루트 디렉토리에서 실행
gemini skills link .gemini/skills/semantic-guardian
```

### 📥 직접 설치 (Install)
스킬 파일을 글로벌 디렉토리에 복사하여 설치합니다.
```bash
gemini skills install .gemini/skills/semantic-guardian
```

---

## 2. Skill 구조 (Structure)

Gemini CLI 공식 스펙에 따라 다음과 같이 구성되어 있습니다:
- **`SKILL.md`**: AI 모델이 스킬의 용도를 판단하는 `description`(YAML)과 구체적인 행동 지침(SOP)을 담고 있습니다.
- **영문 작성 원칙**: AI 모델의 인식률을 높이기 위해 핵심 지침은 영문으로 작성되었습니다.

---

## 🧠 에이전트의 "최소 토큰 전략" (Token Saving SOP)

스킬이 등록되면 에이전트는 다음과 같은 고도화된 워크플로우를 자동으로 수행합니다:

1. **Precision Navigation**: 
   - `read_file`로 파일 전체를 읽는 대신 `get-symbol-metrics`로 구조를 파악합니다.
   - 필요한 함수 본문만 `get-symbol-content`로 읽어 컨텍스트 낭비를 최소화합니다.
2. **Safe Refactoring**: 
   - 수정 전 `analyze-impact`를 실행하여 영향 범위를 파악합니다.
   - 영향받는 특정 테스트 파일만 실행하여 불필요한 테스트 소모를 줄입니다.
3. **Continuous Cleanup**: 
   - `find-dead-code`를 통해 프로젝트 내의 기술 부채(미사용 코드)를 주기적으로 탐지합니다.

---

## 🛠️ MCP 도구 연동 (Integrated Tools)

스킬 활성화 시 에이전트가 사용하는 핵심 MCP 도구들입니다:
- `quality-check`: 전체 품질 상태 요약
- `get-symbol-metrics`: 파일 내 심볼(함수/클래스) 목록 및 복잡도
- `get-symbol-content`: 특정 심볼의 코드 내용만 읽기
- `find-dead-code`: 미사용 코드 탐지
- `analyze-impact`: 수정 시 영향 범위 추적

**"이제 당신의 AI 에이전트는 맹목적으로 코드를 읽지 않고, 정확한 좌표를 찍어 분석하는 전문가로 활동하게 됩니다."**
