import { readFileSync, existsSync } from 'fs';
import { analyzeFile } from '../analysis/sg.js';
import { checkHallucination, checkFakeLogic, checkArchitecture } from '../analysis/import-check.js';
import { checkSecrets } from '../checkers/security.js';
import { runMutationTest } from '../analysis/mutation.js';
import { runSemanticReview, verifyAPIContracts } from '../analysis/reviewer.js';
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
 * v6.1.2: 테스트 파일에 대한 컨텍스트 인식 분석 강화.
 */
export class JavascriptProvider extends BaseQualityProvider {
  // 프로바이더 이름 정의
  name = 'Javascript/TypeScript';
  // 분석 가능한 파일 확장자 정의
  extensions = ['.ts', '.js', '.tsx', '.jsx'];

  /**
   * 지정된 파일에 대해 종합적인 품질 검사를 수행합니다.
   */
  async check(
    filePath: string,
    options?: {
      securityThreshold?: number;
      maxLines?: number;
      maxComplexity?: number;
    }
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
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

    // 1. 기본 AST 메트릭 분석
    const metrics = await analyzeFile(filePath, customRules);
    const isDataFile = metrics.isDataFile;
    const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile, options);

    if (!isDataFile && metrics.lineCount > maxLines) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: metrics.lineCount,
        limit: maxLines,
        rationale: `동적 임계값: ${maxLines}줄 (isDataFile: ${isDataFile})`,
        message: `단일 로직 파일이 너무 큽니다 (${metrics.lineCount}줄). 에이전트의 환각을 방지하기 위해 파일을 작게 분리하세요.`,
      });
    }

    if (!isDataFile && metrics.complexity > maxComplexity) {
      const validSymbols = metrics.topComplexSymbols.filter((s) => s.name.length > 3);

      if (validSymbols.length > 0) {
        const blueprint = validSymbols
          .map((s) => {
            const ratio =
              metrics.complexity > 0 ? ((s.complexity / metrics.complexity) * 100).toFixed(0) : '0';
            return `- [${s.kind}] ${s.name} (Complexity: ${s.complexity} [${ratio}%], L${s.line}-L${s.endLine})`;
          })
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
          rationale: `복잡도: ${metrics.complexity} (임계값: ${maxComplexity})`,
          message: `전체 복잡도(${metrics.complexity})가 기준을 초과했습니다. \n\n[Refactoring Blueprint]\n${blueprint}\n\n* Senior Advice: ${advice}`,
        });
      }
    }

    // 2. AI 환각(Hallucination) 체크
    const hallucinationViolations =
      (await checkHallucination(filePath, this.config.workspacePath, this.config.exclude)) || [];
    hallucinationViolations.forEach((hv: any) => {
      violations.push({
        type: 'HALLUCINATION',
        file: filePath,
        line: hv.line,
        rationale: `임포트 소스 분석 결과`,
        message: `[환각 경고] ${hv.message}`,
      });
    });

    // 2.1 결정론적 API 계약 검증 (v6.1.2: 테스트 파일 컨텍스트 전달)
    const root = AstCacheManager.getInstance().getRootNode(filePath);
    if (root && this.semantic) {
      const exportedSymbols = this.semantic.getAllExportedSymbols();
      const apiViolations = await verifyAPIContracts(
        root,
        filePath,
        exportedSymbols,
        Boolean(isTestFile)
      );
      violations.push(...apiViolations);
    }

    // 3. 가짜 구현(Fake Logic) 체크
    // v6.1.2: 테스트 파일은 의도적인 가짜 로직이 많으므로 스킵합니다.
    if (!isTestFile) {
      const fakeLogicViolations = (await checkFakeLogic(filePath)) || [];
      fakeLogicViolations.forEach((fv: any) => {
        violations.push({
          type: 'FAKE_LOGIC',
          file: filePath,
          line: fv.line,
          rationale: `심볼 타입 분석 및 파라미터 사용 추적`,
          message: `[논리 의심] ${fv.message}`,
        });
      });
    }

    // 4. 아키텍처 가드레일 체크
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

    // 5. 보안(Secret) 스캔
    // v6.1.2: 테스트 파일은 보안 임계값을 완화합니다 (4.0 -> 5.0).
    const effectiveSecurityThreshold = isTestFile ? 5.0 : options?.securityThreshold;
    const secretViolations = await checkSecrets(filePath, effectiveSecurityThreshold);
    violations.push(...secretViolations);

    // 6. 시맨틱 코드 리뷰
    const reviewViolations = await runSemanticReview(filePath, isDataFile);
    violations.push(...reviewViolations);

    // 7. 변이 테스트(Mutation Test)
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
   */
  override async fix(files: string[], workspacePath: string) {
    return runSelfHealing(files, workspacePath);
  }
}
