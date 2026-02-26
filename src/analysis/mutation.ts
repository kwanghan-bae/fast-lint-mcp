import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { Lang, parse } from '@ast-grep/napi';

/**
 * 코드 변이(Mutation)를 유발할 패턴 목록입니다.
 * 논리 연산자나 불리언 값을 반대로 바꿨을 때 테스트가 이를 잡아내는지 확인합니다.
 */
const MUTATION_PATTERNS = [
  { original: '===', mutation: '!==' },
  { original: '>', mutation: '<' },
  { original: '<', mutation: '>' },
  { original: 'true', mutation: 'false' },
  { original: 'false', mutation: 'true' },
];

/**
 * 특정 파일에 대해 '경량 변이 테스트(Lightweight Mutation Test)'를 수행합니다.
 * 로직을 의도적으로 틀리게 고쳤음에도 테스트가 여전히 통과한다면, 해당 테스트 코드의 신뢰성이 낮다고 판단합니다.
 * @param filePath 변이 테스트를 적용할 파일 경로
 * @returns 변이 생존(Mutation Survived) 시 위반 사항 목록
 */
export async function runMutationTest(
  filePath: string
): Promise<{ id: string; message: string }[]> {
  const content = readFileSync(filePath, 'utf-8');
  const violations: { id: string; message: string }[] = [];

  // 각 변이 패턴을 순차적으로 적용해 봅니다.
  for (const { original, mutation } of MUTATION_PATTERNS) {
    const originalContent = content;

    // 현재 파일 본문에 변이 대상 문자열이 포함되어 있는지 확인합니다.
    if (originalContent.includes(original)) {
      // 첫 번째 발견된 위치만 교체하여 '경량' 테스트를 수행합니다.
      const mutatedContent = originalContent.replace(original, mutation);

      try {
        // 1. 변이된 코드를 파일에 직접 씁니다 (디스크 I/O 발생).
        writeFileSync(filePath, mutatedContent);

        // 2. 테스트 명령어(npm test)를 실행하여 결과를 관찰합니다.
        try {
          execSync('npm test', { stdio: 'ignore' });

          /**
           * 테스트가 성공(에러 없음)했다면 변이가 '생존(Survived)'한 것입니다.
           * 이는 테스트 코드가 해당 로직의 변화를 감지하지 못할 만큼 허술하다는 강력한 증거입니다.
           */
          violations.push({
            id: 'MUTATION_SURVIVED',
            message: `변이 테스트 실패: '${original}'를 '${mutation}'로 바꿨는데도 테스트가 통과함. 테스트 코드가 로직을 충분히 검증하지 못하고 있습니다.`,
          });
        } catch (e) {
          // 테스트가 실패했다면 변이가 '사멸(Killed)'된 것이므로, 테스트가 정상 동작함을 의미합니다.
        }
      } finally {
        // 3. 테스트 종료 후(성공/실패 무관) 원본 코드로 반드시 복구합니다.
        writeFileSync(filePath, originalContent);
      }
    }

    // 성능 최적화: 하나의 위반 사항이라도 발견되면 해당 파일에 대한 추가 변이는 생략합니다.
    if (violations.length > 0) break;
  }

  return violations;
}
