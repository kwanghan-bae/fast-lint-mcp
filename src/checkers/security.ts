import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { Violation } from '../types/index.js';

/**
 * 소스 코드 내에 실수로 포함될 수 있는 민감 정보(API Key, Secret, Token 등)를 탐지하기 위한 정규식 패턴 목록입니다.
 */
const SECRET_PATTERNS = [
  { id: 'AWS_KEY', pattern: /AKIA[0-9A-Z]{16}/, message: 'AWS Access Key가 노출되었습니다!' },
  {
    id: 'GENERIC_SECRET',
    pattern: /(password|secret|token|key|api_key|auth_token)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i,
    message: '하드코딩된 비밀번호나 토큰이 발견되었습니다!',
  },
  { id: 'JWT_TOKEN', pattern: /eyJ[a-zA-Z0-9._\-]{10,}/, message: 'JWT 토큰이 노출되었습니다!' },
];

/**
 * 파일의 텍스트 내용을 스캔하여 하드코딩된 보안 비밀 정보가 있는지 검사합니다.
 * @param filePath 분석할 파일 경로
 * @returns 보안 위반 사항 목록
 */
export async function checkSecrets(filePath: string): Promise<Violation[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: Violation[] = [];

  for (const { id, pattern, message } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({
        type: 'SECURITY',
        file: filePath,
        message: `[${id}] ${message} 민감 정보는 환경 변수(.env)나 Secret Manager로 관리하세요.`,
      });
    }
  }

  return violations;
}

/**
 * 'npm audit' 명령어를 실행하여 현재 프로젝트에서 사용하는 라이브러리들의 알려진 보안 취약점을 점검합니다.
 * 특히 High 및 Critical 등급의 취약점이 발견되면 위반 사항으로 보고합니다.
 * @returns 패키지 보안 위반 사항 목록
 */
export async function checkPackageAudit(): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    // JSON 형식으로 보안 감사 결과 추출
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8' });
    const auditData = JSON.parse(auditOutput);

    const vulnerabilities = auditData.metadata?.vulnerabilities || {};
    const totalHigh = (vulnerabilities.high || 0) + (vulnerabilities.critical || 0);

    if (totalHigh > 0) {
      violations.push({
        type: 'SECURITY',
        message: `중대한 패키지 보안 취약점이 발견되었습니다: High/Critical 등급 총 ${totalHigh}건. 'npm audit fix' 명령어로 패키지를 업데이트하세요.`,
      });
    }
  } catch (error) {
    /**
     * npm audit은 취약점이 하나라도 있으면 종료 코드를 1(에러)로 반환합니다.
     * 따라서 catch 블록에서 표준 출력(stdout)을 파싱하여 실제 취약점 정보를 획득합니다.
     */
    try {
      if (error instanceof Error && 'stdout' in error) {
        const auditData = JSON.parse((error as any).stdout);
        const vulnerabilities = auditData.metadata?.vulnerabilities || {};
        const totalHigh = (vulnerabilities.high || 0) + (vulnerabilities.critical || 0);

        if (totalHigh > 0) {
          violations.push({
            type: 'SECURITY',
            message: `중대한 패키지 보안 취약점이 발견되었습니다: High/Critical 등급 총 ${totalHigh}건. 'npm audit fix' 명령어로 패키지를 업데이트하세요.`,
          });
        }
      }
    } catch (e) {
      // 결과 파싱 자체에 실패한 경우 경고만 출력하고 조용히 넘어갑니다.
      console.warn('Warning: npm audit 결과를 파싱하는 데 실패했습니다.');
    }
  }

  return violations;
}
