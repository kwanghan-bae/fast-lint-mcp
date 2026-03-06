import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { Violation } from '../types/index.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';
import { SECURITY } from '../constants.js';

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

/** Shannon Entropy 계산 함수 */
function calculateEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;
  const frequencies: Record<string, number> = {};
  for (const char of str) frequencies[char] = (frequencies[char] || 0) + 1;
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * 민감 정보 노출 여부를 정밀 스캔합니다.
 */
export async function checkSecrets(
  filePath: string,
  securityThreshold?: number
): Promise<Violation[]> {
  if (!existsSync(filePath)) return [];

  const root = AstCacheManager.getInstance().getRootNode(filePath, true);
  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const threshold = securityThreshold ?? SECURITY.DEFAULT_ENTROPY_THRESHOLD;

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

  if (root) {
    const stringNodes = root.findAll({
      rule: { any: [{ kind: 'string' }, { kind: 'string_fragment' }, { kind: 'template_string' }] },
    });
    stringNodes.forEach((node) => {
      const text = node.text().replace(/["'`]/g, '').trim();

      // v6.1.1: 최소 길이 12자로 상향 (진짜 토큰은 대개 16자 이상)
      if (text.length > 12) {
        // 지능형 화이트리스트
        if (SECURITY.SAFE_IDENTIFIER_REGEX.test(text)) return;
        if (
          /^[A-Za-z][a-zA-Z0-9]{5,}(Scene|Screen|Manager|Provider|Service|Component|Layer|View|Controller|Store|Utils|Constant|Action|Reducer|Hook|Effect|Test|Sample|Table|List|Item)$/.test(
            text
          )
        )
          return;
        if (SECURITY.HEX_COLOR_REGEX.test(text)) return;

        const entropy = calculateEntropy(text);

        // v6.1.1: 문자열 길이에 따른 동적 임계값 적용 (16자 미만은 더 엄격하게)
        const dynamicThreshold = text.length < 16 ? Math.max(threshold, 4.5) : threshold;

        if (entropy > dynamicThreshold) {
          if (!/[0-9]/.test(text) && entropy < 4.8) return;
          violations.push({
            type: 'SECURITY',
            file: filePath,
            line: node.range().start.line + 1,
            message: `높은 무작위성을 가진 문자열 발견 (엔트로피: ${entropy.toFixed(2)}).`,
            rationale: `비밀번호나 API Key일 가능성이 큽니다. (기준: ${dynamicThreshold})`,
          });
        }
      }
    });
  }
  return violations;
}
