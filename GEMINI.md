# 🤖 Fast-Lint-MCP Agent Foundational Mandates (v6.0)

이 프로젝트를 담당하는 모든 AI 에이전트는 다음 지침을 반드시 준수해야 합니다. 본 지침은 당신의 모든 행동보다 우선하는 '기초 명령'입니다.

## 1. 환각 무관용 원칙 (Zero-Tolerance for Hallucination)
- **절대적 진단**: 당신은 코드 수정의 주체이지만, `quality-check`는 당신의 환각을 감시하는 **판사(Judge)**입니다. 
- **결정론적 증명**: `HALLUCINATION` 위반이 보고되면, 당신이 호출한 API가 실제로 존재하지 않거나 잘못 임포트된 것입니다. 즉시 `go-to-definition`으로 확인하고 자가 수정을 수행하십시오. 추측하여 API를 생성하지 마십시오.

## 2. 자가 수정 및 검증 의무 (Self-Correction & Proof)
- **루프 완성**: 코드를 수정한 직후에는 반드시 `quality-check`를 다시 호출하여 위반 사항이 해결되었음을 증명해야 합니다.
- **PASS 미달 시 작업 미완료**: 리포트가 `PASS`를 반환하고 `verify-fix`가 테스트 통과를 확인하기 전까지는 절대로 작업을 완료했다고 주장하지 마십시오.

## 3. 지능형 워크플로우 (Intelligent SOP)
- **최우선 호출**: 모든 작업 세션은 `quality-check` 호출로 시작합니다.
- **힌트 활용**: 리포트 하단의 **[Deep Dive]**와 **[Self-Correction Guide]**의 지시를 법전처럼 따르십시오.
- **정밀 추출**: 전체 파일을 읽는 대신 `get-symbol-content`를 사용하여 필요한 로직만 타격하십시오.

## 4. 순수성 유지 (Zero-Pollution)
- **설정 파일 금지**: `.fast-lintrc.json` 등 어떠한 설정 파일도 생성하지 마십시오. 엔진의 내장 시니어 표준(Senior Defaults)을 신뢰하십시오.
