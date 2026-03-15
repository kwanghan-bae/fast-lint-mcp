import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { Violation } from '../types/index.js';
import { scanSecretsNative } from '../../native/index.js';

/**
 * 프로젝트 전체의 보안 상태를 점검합니다. (NPM Audit 등)
 */
export async function checkPackageAudit(): Promise<Violation[]> {
  try {
    execSync('npm audit --json', { stdio: 'pipe' });
  } catch (error: any) {
    try {
      const stdout = error.stdout ? error.stdout.toString() : '';
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
    } catch (inner) {}
  }
  return [];
}

/**
 * 민감 정보 노출 여부를 정밀 스캔합니다.
 * v0.0.1: Rust Native 병렬 정규식 엔진을 사용하여 고속 탐색을 수행합니다.
 */
export async function checkSecrets(
  filePath: string,
  _securityThreshold?: number // 유지하되 사용하지 않음 (하위 호환성)
): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];

  try {
    const nativeViolations = scanSecretsNative([filePath]);
    return nativeViolations.map((nv) => ({
      type: 'SECURITY',
      file: filePath,
      line: nv.line,
      message: nv.message,
      rationale: nv.rationale,
    }));
  } catch (e) {
    return [];
  }
}
