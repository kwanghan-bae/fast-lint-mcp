# Gemini CLI Skill Registration Guide 🛡️ v3.7.0

이 문서는 `fast-lint-mcp` v3.7.0의 하이퍼-속도 엔진과 지능형 아키텍처 가이드를 Gemini CLI에서 극대화하기 위해, **Semantic Guardian** 스킬을 등록하고 활용하는 방법을 설명합니다.

---

## 1. Skill 등록 방법 (Registration)

현재 프로젝트에 포함된 v3.7.0 최신 스킬을 Gemini CLI의 글로벌 환경에 등록합니다.

### 🔗 심볼릭 링크(Symbolic Link) 등록 (권장)
```bash
# 프로젝트 루트 디렉토리에서 실행
gemini skills link .gemini/skills/semantic-guardian
```

---

## 2. v3.7.0 에이전트 지능형 전략 (Agent Intelligence)

스킬이 등록되면 에이전트는 다음과 같은 **"시니어급 자율 판단"** 워크플로우를 수행합니다:

1.  **Refactoring Blueprint 분석**:
    *   `quality-check` 결과에 포함된 **TOP 3 복잡도 심볼**과 **Senior Advice**를 최우선으로 검토합니다.
    *   단순히 "고치세요"가 아닌, "UI Manager로 분리하세요"와 같은 구체적인 아키텍처 전략을 수립합니다.
2.  **Stateless Context Awareness**:
    *   `~/.fast-lint-mcp` 전역 저장소를 통해 브랜치별로 격리된 품질 기준을 이해합니다.
    *   브랜치 작업 시 이전 커버리지 이력을 자동으로 인지하여 품질 하락(Regression)을 스스로 방지합니다.
3.  **Intelligent Coverage Verification**:
    *   코드를 수정한 후 반드시 테스트를 실행하여 커버리지 리포트를 갱신합니다.
    *   도구의 **신선도 검사(Freshness Check)**에 걸리지 않도록 `verify-fix`와 연동하여 최신 리포트 상태를 유지합니다.
4.  **Multi-Module Precision**:
    *   계층적 `tsconfig.json` 탐색 능력을 활용하여, 서브 모듈 내에서도 정확한 별칭(Alias)을 사용하여 코드를 작성합니다.

---

## 🛠️ v3.7.0 핵심 도구 (Modern Toolset)

에이전트가 사용하는 최신 품질 도구들입니다:
*   **`quality-check`**: Real-Time Turbo 엔진 기반의 고속 전체 품질 검사 및 리팩토링 블루프린트 제공.
*   **`get-symbol-metrics`**: 함수/클래스 단위의 정밀 메트릭을 추출하여 수정할 '범인' 심볼을 특정.
*   **`test-check (Internal)`**: 단언문 없는 '가짜 테스트'를 감지하여 테스트 코드의 진정성 확보.
*   **`path-alias resolution`**: 멀티모듈 환경에서도 환각 없는 정확한 임포트 구문 생성.

**"이제 당신의 AI 에이전트는 단순한 코더를 넘어, 10초 이내에 프로젝트 전체 아키텍처를 파악하고 품질 가이드라인을 수호하는 수호신(Guardian)으로 활동하게 됩니다."**
