import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { Violation } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

const SECRET_PATTERNS = [
  {
    name: 'AWS',
    regex: /AKIA[0-9A-Z]{16}/,
    message: 'AWS Access Key가 코드에 노출되어 있습니다.',
  },
  {
    name: 'JWT',
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    message: 'JWT 토큰이 코드에 노출되어 있습니다.',
  },
  {
    name: 'Secret',
    regex: /(?:password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i,
    message: '민감 정보(Password/Secret/Token)가 코드에 노출되어 있습니다.',
  },
];

/**
 * 파일 내 하드코딩된 비밀 정보를 탐지합니다.
 */
export async function checkSecrets(filePath: string): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(lines[i])) {
        violations.push({
          type: 'SECURITY',
          file: filePath,
          line: i + 1,
          message: pattern.message,
          rationale: `${pattern.name} 패턴이 감지되었습니다.`,
        });
      }
    }
  }

  return violations;
}

/**
 * 프로젝트 전체의 보안 상태를 점검합니다. (NPM Audit 등)
 */
export async function checkPackageAudit(): Promise<Violation[]> {
  try {
    execSync('npm audit --json', { stdio: 'pipe' });
  } catch (error: unknown) {
    const execError = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
    try {
      const stdout = execError.stdout ? execError.stdout.toString() : '';
      if (!stdout) return [];

      const audit = JSON.parse(stdout);
      const vuln = audit.metadata?.vulnerabilities || {};
      const low = vuln.low || 0;
      const moderate = vuln.moderate || 0;
      const high = vuln.high || 0;
      const critical = vuln.critical || 0;
      const total = low + moderate + high + critical;

      if (total > 0) {
        return [
          {
            type: 'SECURITY',
            file: 'package.json',
            message: `의존성 취약점이 발견되었습니다. (${total}건: 고위험 ${high + critical}건)`,
            rationale: 'npm audit 실행 결과 취약한 패키지가 포함되어 있습니다.',
          },
        ];
      }
    } catch (inner) {
      Logger.warn('Security', 'npm audit 결과 파싱 실패', (inner as Error).message);
    }
  }
  return [];
}
