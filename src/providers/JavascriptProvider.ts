import { readFileSync, existsSync } from 'fs';
import { analyzeFile } from '../analysis/sg.js';
import { checkHallucination, checkFakeLogic, checkArchitecture } from '../analysis/import-check.js';
import { checkSecrets } from '../checkers/security.js';
import { runMutationTest } from '../analysis/mutation.js';
import { runSemanticReview } from '../analysis/reviewer.js';
import { runSelfHealing } from '../checkers/fixer.js';
import { Violation } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';

/**
 * JavaScript 및 TypeScript 언어에 특화된 품질 분석을 수행하는 프로바이더 클래스입니다.
 * AST 파싱, 환각 탐지, 가짜 로직 검사, 보안 스캔 등 다양한 정적 분석 도구를 통합하여 실행합니다.
 */
export class JavascriptProvider extends BaseQualityProvider {
  // 프로바이더 이름 정의
  name = 'Javascript/TypeScript';
  // 분석 가능한 파일 확장자 정의
  extensions = ['.ts', '.js', '.tsx', '.jsx'];

  /**
   * 지정된 파일에 대해 종합적인 품질 검사를 수행합니다.
   * @param filePath 분석할 파일 경로
   * @returns 발견된 위반 사항들의 배열
   */
  async check(filePath: string): Promise<Violation[]> {
    const violations: Violation[] = [];
    const rules = this.config.rules;
    const customRules = this.config.customRules;

    // 1. 기본 AST 메트릭 분석: 파일 크기, 복잡도 및 사용자 정의 규칙을 검사합니다.
    const metrics = await analyzeFile(filePath, customRules);

    // 파일의 전체 라인 수가 설정된 기준을 초과하는지 확인
    if (metrics.lineCount > rules.maxLineCount) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: metrics.lineCount,
        limit: rules.maxLineCount,
        message: `단일 파일이 너무 큽니다 (${metrics.lineCount}줄). 파일 분리 및 모듈화를 고려하세요.`,
      });
    }
    // 함수나 클래스의 복잡도가 기준을 초과하는지 확인
    if (metrics.complexity > rules.maxComplexity) {
      violations.push({
        type: 'COMPLEXITY',
        file: filePath,
        value: metrics.complexity,
        limit: rules.maxComplexity,
        message: `함수/클래스의 복잡도(${metrics.complexity})가 너무 높습니다. 로직을 단순화하거나 분리하세요.`,
      });
    }

    // 2. AI 환각(Hallucination) 체크: 존재하지 않는 파일이나 라이브러리 임포트를 탐지합니다.
    const hallucinationViolations = await checkHallucination(filePath);
    hallucinationViolations.forEach((hv) => {
      violations.push({
        type: 'HALLUCINATION',
        file: filePath,
        message: `[환각 경고] ${hv.message}`,
      });
    });

    // 3. 가짜 구현(Fake Logic) 체크: 파라미터를 무시한 채 고정된 값을 반환하는 등의 의심스러운 로직을 찾습니다.
    const fakeLogicViolations = await checkFakeLogic(filePath);
    fakeLogicViolations.forEach((fv) => {
      violations.push({ type: 'FAKE_LOGIC', file: filePath, message: `[논리 의심] ${fv.message}` });
    });

    // 4. 아키텍처 가드레일 체크: 레이어 간 의존성 방향 규칙 위반 여부를 검사합니다.
    const architectureRules = this.config.architectureRules;
    if (architectureRules && architectureRules.length > 0) {
      const archViolations = await checkArchitecture(filePath, architectureRules);
      archViolations.forEach((av) => {
        violations.push({
          type: 'ARCHITECTURE',
          file: filePath,
          message: `[아키텍처 위반] ${av.message}`,
        });
      });
    }

    // 5. 보안(Secret) 스캔: 하드코딩된 API Key나 토큰 노출 여부를 검사합니다.
    const secretViolations = await checkSecrets(filePath);
    violations.push(...secretViolations);

    // 6. 시맨틱 코드 리뷰: 중첩 깊이, 파라미터 개수, 한글 주석 준수 여부 등 가독성 규칙을 검사합니다.
    const reviewViolations = await runSemanticReview(filePath);
    violations.push(...reviewViolations);

    // 7. 변이 테스트(Mutation Test): 테스트 코드의 견고함을 검증합니다 (설정 시에만 실행).
    if (this.config.enableMutationTest) {
      const mutationViolations = await runMutationTest(filePath);
      mutationViolations.forEach((mv) => {
        violations.push({
          type: 'MUTATION_SURVIVED',
          file: filePath,
          message: `[테스트 신뢰성 의심] ${mv.message}`,
        });
      });
    }

    // 사용자 정의 규칙(Custom Rules) 위반 사항 추가
    metrics.customViolations?.forEach((cv) => {
      violations.push({ type: 'CUSTOM', file: filePath, message: `[${cv.id}] ${cv.message}` });
    });

    return violations;
  }

  /**
   * 발견된 사소한 오류들에 대해 자가 치유(Self-Healing) 프로세스를 실행합니다.
   * ESLint 및 Prettier를 호출하여 자동으로 수정 가능한 항목들을 처리합니다.
   */
  override async fix(files: string[], workspacePath: string) {
    return runSelfHealing(files, workspacePath);
  }
}
