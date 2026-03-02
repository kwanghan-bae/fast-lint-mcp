/**
 * fast-lint-mcp 전역에서 사용하는 매직넘버 및 시스템 상수 정의 (v4.4.0)
 */

export const SYSTEM = {
  /** 분석 엔진 버전 (package.json 동기화 용) */
  VERSION_PREFIX: 'v',
  /** 기본 동시성 제어 (CPU 코어 대비 여유분) */
  CONCURRENCY_MARGIN: 1,
};

export const SECURITY = {
  /** 하드코딩된 비밀번호 감지를 위한 기본 엔트로피 임계값 */
  DEFAULT_ENTROPY_THRESHOLD: 4.0,
  /** 16진수 색상 코드 탐지를 위한 정규식 */
  HEX_COLOR_REGEX: /^(#|0x)([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/,
  /** 보안 위협이 아닌 일반적인 식별자 패턴 */
  SAFE_IDENTIFIER_REGEX: /(color|class|style|theme|name|id|type|path|identifier|key_id|key_type|save_key|offset|width|height|opacity|padding)/i,
};

export const READABILITY = {
  /** 한글 주석 탐색 최대 깊이 (위로 몇 줄까지 볼 것인가) */
  KOREAN_COMMENT_SEARCH_DEPTH: 10,
  /** 함수 주석이 필수적으로 요구되는 최소 라인 수 */
  MIN_FUNCTION_LINES_FOR_COMMENT: 10,
  /** 단일 함수 허용 최대 라인 수 (컴포넌트 포함) */
  MAX_FUNCTION_LINES: 150,
  /** 객체로 묶기를 권장하는 최대 파라미터 개수 */
  MAX_PARAMETER_COUNT: 5,
  /** 복잡한 로직 판단을 위한 주석 밀도 임계값 (라인 수) */
  DENSITY_THRESHOLD_MEDIUM: 30,
  /** 복잡한 로직 판단을 위한 주석 밀도 임계값 (라인 수, 주석 0개일 때) */
  DENSITY_THRESHOLD_HIGH: 50,
  /** 노이즈로 간주할 짧은 심볼 이름 길이 */
  NOISE_SYMBOL_LENGTH_LIMIT: 3,
};

export const COVERAGE = {
  /** 소스 수정 대비 리포트 만료 허용 시간 (밀리초, 15분) */
  STALE_BUFFER_MS: 900000,
  /** 모노레포 리포트 재귀 탐색 최대 깊이 */
  RECURSIVE_SEARCH_DEPTH: 5,
  /** 리포트에 표시할 취약 파일(Low Coverage) 최대 개수 */
  TOP_VULNERABLE_FILES_COUNT: 5,
  /** 인사이트 섹션에 표시할 파일 개수 */
  INSIGHT_FILES_COUNT: 3,
};

export const PERFORMANCE = {
  /** 분석 루프 중간에 이벤트 루프에 양보하는 주기 (파일 개수 단위) */
  EVENT_LOOP_YIELD_INTERVAL: 10,
};
