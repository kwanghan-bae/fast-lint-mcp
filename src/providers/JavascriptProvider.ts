import { readFileSync, existsSync } from 'fs';
import { analyzeFile } from '../analysis/sg.js';
import { checkHallucination, checkFakeLogic, checkArchitecture } from '../analysis/import-check.js';
import { checkSecrets } from '../checkers/security.js';
import { runMutationTest } from '../analysis/mutation.js';
import { runSemanticReview } from '../analysis/reviewer.js';
import { runSelfHealing } from '../checkers/fixer.js';
import { Violation } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';
import { checkTestValidity } from '../analysis/test-check.js';

// AST 패턴 정의 (v3.0 Semantic)
/** UI 렌더링 및 프레임워크 관련 AST 패턴 목록 */
const UI_AST_PATTERNS = [
  'use$A($$$)', // Hooks
  '< $A $$$ />', // JSX
  'createElement($$$)',
  'render($$$)',
];

/** 고도의 비즈니스 로직 및 연산 관련 AST 패턴 목록 */
const LOGIC_AST_PATTERNS = [
  'Math.$A($$$)',
  'new Map($$$)',
  'new Set($$$)',
  'crypto.$A($$$)',
  'fetch($$$)',
];

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

    // 테스트 파일 여부 판별 (v3.0)
    const isTestFile =
      filePath.match(/\.(test|spec)\.[tj]sx?$/) ||
      filePath.includes('/tests/') ||
      filePath.includes('/__tests__/');

    if (isTestFile) {
      const testResult = checkTestValidity(filePath);
      if (!testResult.isValid) {
        violations.push({
          type: 'READABILITY',
          file: filePath,
          message: `[테스트 신뢰성] ${testResult.message}`,
        });
      }
    }

    // 1. 기본 AST 메트릭 분석: 파일 크기, 복잡도 및 성격(Data vs Logic)을 검사합니다.
    const metrics = await analyzeFile(filePath, customRules);
    const isDataFile = metrics.isDataFile;

    // 데이터 파일 여부에 따른 임계치 자동 계산 (v3.0 Common)
    const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile);

    if (!isDataFile && metrics.lineCount > maxLines) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: metrics.lineCount,
        limit: maxLines,
        message: `단일 로직 파일이 너무 큽니다 (${metrics.lineCount}줄). 에이전트의 환각을 방지하기 위해 파일을 작게 분리하세요.`,
      });
    }

    if (!isDataFile && metrics.complexity > maxComplexity) {
      // 이름이 너무 짧은(3자 이하) 심볼은 내부 구현이거나 미니파이된 코드일 확률이 높으므로 제외
      const validSymbols = metrics.topComplexSymbols.filter((s) => s.name.length > 3);

      if (validSymbols.length > 0) {
        const blueprint = validSymbols
          .map((s) => `- [${s.kind}] ${s.name} (Complexity: ${s.complexity}, L${s.line})`)
          .join('\n');

        const root = AstCacheManager.getInstance().getRootNode(filePath);
        let hasUIPatterns = false;
        let hasLogicPatterns = false;

        if (root) {
          hasUIPatterns = UI_AST_PATTERNS.some((p) => root.findAll(p).length > 0);
          hasLogicPatterns = LOGIC_AST_PATTERNS.some((p) => root.findAll(p).length > 0);
        }

        let advice =
          '코드 복잡도가 기준을 초과했습니다. 로직을 더 작은 함수나 클래스로 분리하세요.';
        if (hasUIPatterns && !hasLogicPatterns) {
          advice =
            '이 컴포넌트에는 UI 렌더링과 복잡한 상태 관리가 혼재되어 있습니다. Business Logic을 Custom Hook으로 추출하거나, Presentational Component로 UI를 분리하세요.';
        } else if (hasLogicPatterns && !hasUIPatterns) {
          advice =
            '이 파일에는 고도의 연산 로직이 포함되어 있습니다. 서비스 레이어나 순수 함수 기반의 유틸리티 라이브러리로 로직을 캡슐화하는 것이 좋겠습니다.';
        } else if (hasUIPatterns && hasLogicPatterns) {
          advice =
            '렌더링 코드와 복잡한 계산 로직이 강하게 결합되어 있습니다. 유지보수를 위해 렌더링부와 로직부를 엄격히 분리(SOC: Separation of Concerns)하세요.';
        }

        violations.push({
          type: 'COMPLEXITY',
          file: filePath,
          value: metrics.complexity,
          limit: maxComplexity,
          message: `전체 복잡도(${metrics.complexity})가 기준을 초과했습니다. \n\n[Refactoring Blueprint]\n${blueprint}\n\n* Senior Advice: ${advice}`,
        });
      }
    }

    // 2. AI 환각(Hallucination) 체크: 존재하지 않는 파일이나 라이브러리 임포트를 탐지합니다.
    const hallucinationViolations = await checkHallucination(
      filePath,
      process.cwd(),
      this.config.exclude
    );
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
      const archViolations = await checkArchitecture(
        filePath,
        architectureRules,
        process.cwd(),
        this.config.exclude
      );
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
    // 데이터 파일인 경우 노이즈를 줄이기 위해 세맨틱 리뷰를 스킵합니다. (v2.2.1)
    const reviewViolations = await runSemanticReview(filePath, isDataFile);
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
