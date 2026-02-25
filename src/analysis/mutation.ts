import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { Lang, parse } from '@ast-grep/napi';

/**
 * 코드 변이(Mutation) 패턴 정의
 */
const MUTATION_PATTERNS = [
  { original: '===', mutation: '!==' },
  { original: '>', mutation: '<' },
  { original: '<', mutation: '>' },
  { original: 'true', mutation: 'false' },
  { original: 'false', mutation: 'true' },
];

/**
 * 특정 파일에 대해 '경량 변이 테스트'를 수행합니다.
 * 로직을 살짝 바꿨는데도 테스트가 통과하면, 해당 테스트는 가짜일 가능성이 높음.
 */
export async function runMutationTest(
  filePath: string
): Promise<{ id: string; message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: { id: string; message: string }[] = [];

  // 변이 가능한 지점 찾기
  for (const { original, mutation } of MUTATION_PATTERNS) {
    // 1. 원본 내용 백업
    const originalContent = content;

    // 2. 변이 적용 (단순 문자열 치환 대신 AST 기반으로 할 수도 있지만, 경량화를 위해 첫 번째 매칭만 교체 시도)
    if (originalContent.includes(original)) {
      const mutatedContent = originalContent.replace(original, mutation);

      try {
        // 3. 변이된 코드 쓰기
        writeFileSync(filePath, mutatedContent);

        // 4. 테스트 실행 (특정 파일에 관련된 테스트만 실행하는 것이 이상적임)
        // 여기서는 vitest를 사용하여 전체 테스트 중 하나라도 실패하는지 확인
        try {
          execSync('npm test', { stdio: 'ignore' });
          // 만약 여기서 에러가 발생하지 않았다면, 변이된 코드인데도 테스트가 통과(Survive)했다는 뜻!
          violations.push({
            id: 'MUTATION_SURVIVED',
            message: `변이 테스트 실패: '${original}'를 '${mutation}'로 바꿨는데도 테스트가 통과함. 테스트가 로직을 검증하지 못하고 있습니다.`,
          });
        } catch (e) {
          // 테스트가 실패했다면, 변이를 감지했다는 뜻이므로 '성공' (Killed)
        }
      } finally {
        // 5. 원복
        writeFileSync(filePath, originalContent);
      }
    }

    // 성능을 위해 파일당 1~2개의 변이만 수행하도록 제한할 수 있음
    if (violations.length > 0) break;
  }

  return violations;
}
