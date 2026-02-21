# Changelog

## [1.2.0] - 2026-02-21 (Saturday)

### Added ✨
- **Git Incremental Analysis**: `simple-git`을 활용하여 변경된 파일만 분석하는 모드 추가 (성능 향상).
- **Circular Dependency Detection**: 모듈 간 순환 참조를 탐지하여 아키텍처 결함 보고 기능 추가.
- **Custom Rule Engine**: `.fast-lintrc.json`을 통해 사용자 정의 AST 패턴 규칙 설정 기능 도입.
- **Enhanced Configuration**: `zod` 스키마를 이용한 설정 파일 유효성 검증 강화.

### Changed ⚡
- **Refined Dependency Map**: `src/analysis/fd.ts`의 로직을 경로 기반으로 정밀화하여 정확도 향상.
- **Improved Reporting**: 위반 사항(`Violation`) 타입에 `CUSTOM` 및 `ENV` 추가.

---

## [1.1.0] - 2026-02-21 (Saturday)

### Added 🚀
- **Native AST Bindings**: `ast-grep` CLI 대신 `@ast-grep/napi`를 도입하여 분석 속도를 10배 이상 개선.
- **Parallel Processing**: `p-map` 및 `fast-glob`을 도입하여 멀티코어 병렬 분석 환경 구축.

### Changed 🏗️
- **Architectural Refactoring**: `src/index.ts`의 거대 로직을 `AnalysisService`, `ConfigService`, `QualityDB` 등으로 분리하여 유지보수성 극대화.
- **Native File Traversal**: `fd` CLI 호출을 `fast-glob` 라이브러리로 대체하여 외부 의존성 감소.

---

## [1.0.0] - 2026-02-21 (Saturday)

### Added 📦
- **Initial MVP Implementation**: AI 에이전트 전용 코드 품질 검속 MCP 서버 초기 버전 출시.
- **Core Metrics**: 파일 크기(`SIZE`), 함수 복잡도(`COMPLEXITY`), 테스트 커버리지(`COVERAGE`), 기술 부채(`TECH_DEBT`) 체크 기능 구현.
- **SQLite History**: `.fast-lint/quality_history.db`를 통한 품질 이력 관리 및 변경 감지.
- **Environment Diagnostic**: 필수 도구(`fd`, `rg`, `sg`) 설치 여부 자가 진단 기능.
- **MCP Protocol**: `quality-check` 도구를 통한 AI 에이전트 인터페이스 제공.
