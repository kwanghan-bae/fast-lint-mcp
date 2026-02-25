# Gemini CLI Skill Registration Guide 🛡️

이 문서는 `fast-lint-mcp` v2.0의 세만틱 분석 및 자율 코딩 능력을 극대화하기 위해, Gemini CLI에 **Semantic Guardian** 스킬을 등록하고 활용하는 방법을 설명합니다.

---

## 1. Skill 등록 방법 (Registration)

현재 프로젝트에 포함된 스킬을 Gemini CLI의 글로벌 환경에 등록하여, 모든 프로젝트에서 이 전문 지식을 사용할 수 있도록 설정합니다.

### 🔗 심볼릭 링크(Symbolic Link) 등록 (권장)
현재 프로젝트의 소스 코드가 수정되면 글로벌 스킬도 즉시 업데이트되는 방식입니다.
```bash
# 프로젝트 루트 디렉토리에서 실행
gemini skills link .gemini/skills/semantic-guardian
```

---

## 2. Skill 구조 (Structure)

Gemini CLI 공식 스펙에 따라 다음과 같이 구성되어 있습니다:
- **`SKILL.md`**: AI 모델이 스킬의 용도를 판단하는 `description`(YAML)과 구체적인 행동 지침(SOP)을 담고 있습니다.
- **영문 작성 원칙**: AI 모델의 인식률을 높이기 위해 핵심 지침은 영문으로 작성되었습니다.

---

## 🧠 에이전트의 "자율 코딩 전략" (Autonomous Strategy)

스킬이 등록되면 에이전트는 다음과 같은 고도화된 워크플로우를 자동으로 수행합니다:

1. **Precision Navigation (정밀 탐색)**: 
   - `get-symbol-metrics`와 `get-symbol-content`를 사용하여 필요한 부분만 정확히 읽습니다.
   - `find-references`와 `go-to-definition`을 사용하여 코드 간의 관계를 완벽히 파악합니다.
2. **Architecture Guard (구조 보호)**: 
   - 수정 전 `architectureRules`를 확인하고, 정의된 레이어 위반 사항이 없는지 검사합니다.
3. **Self-Healing Loop (자가 치유)**: 
   - 수정 후 `verify-fix`를 실행하여 테스트 통과를 확인합니다.
   - 실패 시 에러 로그를 분석하여 자동으로 재수정 루프에 진입합니다.

---

## 🛠️ MCP 도구 연동 (Integrated Tools)

v2.0에서 강화된 에이전트 핵심 도구들입니다:
- `quality-check`: 전체 품질 상태 및 아키텍처 위반 요약
- `get-symbol-metrics` / `get-symbol-content`: 심볼 단위 정밀 분석 및 읽기
- `find-references` / `go-to-definition`: 프로젝트 전체 심볼 추적
- `analyze-impact`: 수정 시 영향 범위(테스트 포함) 추적
- `verify-fix`: 수정 코드의 자율 검증 및 자가 치유

**"이제 당신의 AI 에이전트는 단순히 코드를 짜는 수준을 넘어, 프로젝트 전체의 구조적 무결성을 지키고 스스로를 검증하는 전문가로 활동하게 됩니다."**
