import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// v4.3.1: 단일 소스(package.json)로부터 버전 정보 획득
let pkg = { version: '0.0.0-unknown' };
try {
  // ESM 환경에서 package.json 경로 계산
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  }
} catch (e) {
  // 무시
}

/** 프로젝트 전역 버전 상수 */
export const VERSION = `v${pkg.version}`;

/**
 * fast-lint-mcp 전역에서 사용하는 매직넘버 및 시스템 상수 정의 (v4.4.0)
 */
export const SYSTEM = {
  /** 분석 엔진 버전 (package.json 동기화 용) */
  VERSION_PREFIX: 'v',
  /** 기본 동시성 제어 (CPU 코어 대비 여유분) */
  CONCURRENCY_MARGIN: 1,
  /** 시스템 레벨에서 자동으로 제외할 디렉토리 및 파일 패턴 (v5.0.1 Multi-Language) */
  DEFAULT_IGNORE_PATTERNS: [
    // 1. 의존성 및 패키지 매니저 (Dependencies)
    '**/node_modules/**',
    '**/bower_components/**',
    '**/vendor/**', // Go, PHP 등
    '**/.gradle/**', // Java/Kotlin
    '**/.m2/**', // Maven
    '**/Pods/**', // iOS (CocoaPods)
    '**/.venv/**', // Python
    '**/venv/**', // Python
    '**/env/**', // Python

    // 2. 빌드 결과물 및 아티팩트 (Build Artifacts)
    '**/dist/**', // JS/TS
    '**/build/**', // Java/Kotlin, React Native 등
    '**/out/**', // Java/IntelliJ
    '**/target/**', // Rust, Maven
    '**/bin/**', // C#, Java, Go 등
    '**/obj/**', // C# (.NET)
    '**/.next/**', // Next.js
    '**/.nuxt/**', // Nuxt.js
    '**/.expo/**', // Expo/React Native
    '**/.cache/**', // 각종 도구 캐시
    '**/.parcel-cache/**',
    '**/.turbo/**', // Turborepo

    // 3. 버전 관리 및 IDE 메타데이터 (VCS & IDE)
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    '**/.idea/**', // JetBrains
    '**/.vscode/**', // VS Code
    '**/.settings/**', // Eclipse
    '**/*.suo', // Visual Studio
    '**/*.user', // Visual Studio

    // 4. 테스트 및 커버리지 리포트 (Test & Coverage)
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/.pytest_cache/**',
    '**/.mypy_cache/**',

    // 5. OS 및 시스템 로그 (OS & Logs)
    '**/*.log',
    '**/.DS_Store', // macOS
    '**/Thumbs.db', // Windows
    '**/tmp/**',
    '**/.temp/**',

    // 6. 언어별 컴파일된 바이너리/바이트코드 (Compiled Files)
    '**/__pycache__/**', // Python
    '**/*.pyc', // Python
    '**/*.pyo',
    '**/*.pyd',
    '**/*.class', // Java
    '**/*.o', // C/C++
    '**/*.obj', // C/C++
    '**/*.exe', // Windows Binary
    '**/*.dll', // Windows Library
  ],
};

export const SECURITY = {
  /** 하드코딩된 비밀번호 감지를 위한 기본 엔트로피 임계값 */
  DEFAULT_ENTROPY_THRESHOLD: 4.0,
  /** 16진수 색상 코드 탐지를 위한 정규식 */
  HEX_COLOR_REGEX: /^(#|0x)([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/,
  /** 보안 위협이 아닌 일반적인 식별자 패턴 */
  SAFE_IDENTIFIER_REGEX:
    /(color|class|style|theme|name|id|type|path|identifier|key_id|key_type|save_key|offset|width|height|opacity|padding|scene|screen|manager|service|provider|utils|constant|action|reducer|hook|effect|state|props|request|response|error|message|result|data|item|list|table|view|button|text|input|form|dialog|modal|toast|popup|icon|image|svg|asset|resource|font|size|weight|align|justify|flex|wrap|direction|background|border|radius|shadow|margin|zindex|index|key|value|pair|entry|node|root|parent|child|sibling|next|prev|prev_state|next_state|loading|fetching|fetching_data|fetching_status|success|failure|failed|status|status_code|code|type|kind|mode|mode_type|analysis|check|lint|guard|gate|mandate|sop|guide|init|config|setting|rules|rules_list|rules_data|rules_config|select|scene_name|class_name|select_scene|class_select|ClassSelectScene|small_function|game_view|\.js$|\.ts$|\.jsx?$|\.tsx?$|\.css$|\.json$|\.svg$|\.png$|\.jpe?g$)/i,
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
