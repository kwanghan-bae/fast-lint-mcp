import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { Violation } from '../types/index.js';

/**
 * 소스 코드 내에 실수로 포함될 수 있는 민감 정보 탐지 패턴입니다.
 */
const SECRET_PATTERNS = [
  { id: 'AWS_KEY', pattern: /AKIA[0-9A-Z]{16}/, message: 'AWS Access Key가 노출되었습니다!' },
  {
    id: 'GENERIC_SECRET',
    pattern: /(password|secret|token|key|api_key|auth_token)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i,
    message: '하드코딩된 비밀번호나 토큰이 발견되었습니다!',
  },
  { id: 'JWT_TOKEN', pattern: /eyJ[a-zA-Z0-9\._\-]{10,}/, message: 'JWT 토큰이 노출되었습니다!' },
];

/**
 * 프로젝트의 npm 의존성 취약점을 스캔합니다.
 */
export async function checkPackageAudit(): Promise<Violation[]> {
  try {
    const output = execSync('npm audit --json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const audit = JSON.parse(output);
    const highAlerts =
      (audit.metadata?.vulnerabilities?.high || 0) +
      (audit.metadata?.vulnerabilities?.critical || 0);
    if (highAlerts > 0)
      return [
        {
          type: 'SECURITY',
          message: `취약한 패키지 발견 (High/Critical: ${highAlerts}건).`,
          rationale: 'NPM Audit 엔진 결과',
        },
      ];
  } catch (e: any) {
    try {
      const audit = JSON.parse(e.stdout || '{}');
      const highAlerts =
        (audit.metadata?.vulnerabilities?.high || 0) +
        (audit.metadata?.vulnerabilities?.critical || 0);
      if (highAlerts > 0)
        return [
          {
            type: 'SECURITY',
            message: `취약한 패키지 발견 (High/Critical: ${highAlerts}건).`,
            rationale: 'NPM Audit 엔진 결과',
          },
        ];
    } catch (inner) {}
  }
  return [];
}

/**
 * 민감 정보 노출 여부를 정밀 스캔합니다.
 */
export async function checkSecrets(
  filePath: string,
  _securityThreshold?: number // 유지하되 사용하지 않음 (하위 호환성)
): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];

  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf-8');

  // 1. 정규식 기반 정밀 매칭
  SECRET_PATTERNS.forEach((p) => {
    if (p.pattern.test(content)) {
      violations.push({
        type: 'SECURITY',
        file: filePath,
        message: p.message,
        rationale: `패턴 일치: ${p.id}`,
      });
    }
  });

  return violations;
}
