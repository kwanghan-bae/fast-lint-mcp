import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { Violation } from '../types/index.js';

/**
 * 소스 코드 내 민감 정보(API Key, Secret 등)를 스캔합니다.
 */
const SECRET_PATTERNS = [
  { id: 'AWS_KEY', pattern: /AKIA[0-9A-Z]{16}/, message: 'AWS Access Key 발견!' },
  {
    id: 'GENERIC_SECRET',
    pattern: /(password|secret|token|key|api_key|auth_token)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i,
    message: '하드코딩된 비밀번호/토크 발견!',
  },
  { id: 'JWT_TOKEN', pattern: /eyJ[a-zA-Z0-9._\-]{10,}/, message: 'JWT 토큰 발견!' },
];

export async function checkSecrets(filePath: string): Promise<Violation[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: Violation[] = [];

  for (const { id, pattern, message } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      violations.push({
        type: 'SECURITY',
        file: filePath,
        message: `[${id}] ${message} 민감 정보는 환경 변수로 관리하세요.`,
      });
    }
  }

  return violations;
}

/**
 * npm audit을 통해 패키지 취약점을 점검합니다.
 */
export async function checkPackageAudit(): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8' });
    const auditData = JSON.parse(auditOutput);

    const vulnerabilities = auditData.metadata?.vulnerabilities || {};
    const totalHigh = (vulnerabilities.high || 0) + (vulnerabilities.critical || 0);

    if (totalHigh > 0) {
      violations.push({
        type: 'SECURITY',
        message: `보안 취약점 발견: High/Critical급 ${totalHigh}건. 'npm audit fix'를 실행하세요.`,
      });
    }
  } catch (error) {
    // npm audit은 취약점이 있을 때 비제로 종료 코드를 반환하므로 에러로 처리됨
    try {
      if (error instanceof Error && 'stdout' in error) {
        const auditData = JSON.parse((error as any).stdout);
        const vulnerabilities = auditData.metadata?.vulnerabilities || {};
        const totalHigh = (vulnerabilities.high || 0) + (vulnerabilities.critical || 0);

        if (totalHigh > 0) {
          violations.push({
            type: 'SECURITY',
            message: `보안 취약점 발견: High/Critical급 ${totalHigh}건. 'npm audit fix'를 실행하세요.`,
          });
        }
      }
    } catch (e) {
      console.warn('Warning: Failed to parse npm audit output.');
    }
  }

  return violations;
}
