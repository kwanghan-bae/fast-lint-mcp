import { execa } from 'execa';

/**
 * 환경 진단 결과의 구조를 정의합니다.
 */
export interface EnvCheckResult {
  pass: boolean; // 모든 필수 도구가 설치되어 있는지 여부
  missing: string[]; // 누락된 도구의 이름 목록
  suggestion?: string; // 설치 방법 안내 메시지
}

/**
 * 프로젝트 실행에 반드시 필요한 외부 CLI 도구 목록입니다.
 */
const REQUIRED_TOOLS = [
  { bin: 'fd', name: 'fd-find (fd)' }, // 고속 파일 탐색 도구
  { bin: 'rg', name: 'ripgrep (rg)' }, // 고속 텍스트 검색 도구
  { bin: 'sg', name: 'ast-grep (sg)' }, // AST 기반 코드 분석 및 변환 도구
];

/**
 * 현재 시스템 환경을 진단하여 필수 도구들의 설치 여부를 확인합니다.
 * @returns 진단 결과 객체
 */
export async function checkEnv(): Promise<EnvCheckResult> {
  const missing: string[] = [];

  // 각 도구별로 실행 파일이 PATH에 존재하는지 확인합니다.
  for (const tool of REQUIRED_TOOLS) {
    try {
      // 'which' 명령어를 사용하여 바이너리 위치를 조회합니다.
      await execa('which', [tool.bin]);
    } catch {
      // 조회가 실패하면 누락된 도구 목록에 추가합니다.
      missing.push(tool.name);
    }
  }

  // 누락된 도구가 없으면 성공 반환
  if (missing.length === 0) {
    return { pass: true, missing: [] };
  }

  // 누락된 도구들에 대한 설치 명령어 생성 (macOS brew 기준)
  const installCmd = missing
    .map((m) => {
      if (m.includes('fd')) return 'fd';
      if (m.includes('rg')) return 'ripgrep';
      if (m.includes('sg')) return 'ast-grep';
      return '';
    })
    .filter(Boolean)
    .join(' ');

  return {
    pass: false,
    missing,
    suggestion: `시스템에 필수 도구가 누락되어 분석을 시작할 수 없습니다. 다음 명령어로 설치해 주세요: brew install ${installCmd}`,
  };
}
