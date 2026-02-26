/**
 * 프로젝트 내에서 공통으로 사용되는 핵심 타입 및 인터페이스 정의입니다.
 */

/**
 * 품질 위반 사항의 종류를 정의합니다.
 */
export type ViolationType =
  | 'SIZE' // 파일 크기 초과
  | 'COMPLEXITY' // 복잡도 초과
  | 'COVERAGE' // 테스트 커버리지 미달
  | 'TECH_DEBT' // 기술 부채(TODO) 과다
  | 'HALLUCINATION' // AI 환각 (존재하지 않는 참조)
  | 'FAKE_LOGIC' // 가짜 로직 구현 의심
  | 'ARCHITECTURE' // 아키텍처 규칙 위반 (의존성 방향 등)
  | 'SECURITY' // 보안 취약점 (Secret 노출 등)
  | 'READABILITY' // 가독성 저해 및 주석 누락
  | 'MUTATION_SURVIVED' // 변이 테스트 실패 (가짜 테스트 의심)
  | 'CUSTOM' // 사용자 정의 규칙 위반
  | 'ENV'; // 환경 설정 오류

/**
 * 개별 코드 품질 위반 사항에 대한 상세 정보를 담는 인터페이스입니다.
 */
export interface Violation {
  type: ViolationType; // 위반 종류
  file?: string; // 위반이 발생한 파일 경로
  message: string; // 위반 내용에 대한 상세 설명
  value?: any; // 현재 측정값 (선택 사항)
  limit?: any; // 허용되는 기준값 (선택 사항)
  id?: string; // 규칙 식별자 (선택 사항)
}

/**
 * 전체 품질 분석 결과 리포트의 구조를 정의합니다.
 */
export interface QualityReport {
  pass: boolean; // 품질 기준 통과 여부
  violations: Violation[]; // 발견된 위반 사항 목록
  suggestion?: string; // 개선을 위한 종합 조치 가이드
}

/**
 * 언어별 분석 프로바이더가 구현해야 할 공통 인터페이스입니다.
 */
export interface QualityProvider {
  name: string; // 프로바이더 이름 (예: 'Javascript')
  extensions: string[]; // 처리 가능한 파일 확장자 목록

  /**
   * 지정된 파일의 품질을 분석합니다.
   */
  check(filePath: string): Promise<Violation[]>;

  /**
   * (선택 사항) 발견된 오류에 대한 자동 수정 기능을 수행합니다.
   */
  fix?(files: string[], workspacePath: string): Promise<{ fixedCount: number; messages: string[] }>;
}
