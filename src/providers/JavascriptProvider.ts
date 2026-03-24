import { existsSync } from 'fs';
import { runUltimateAnalysisNative, ReviewOptions } from '../../native/index.js';
import { Violation } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';
import { READABILITY } from '../constants.js';
import { checkTestValidity } from '../analysis/test-check.js';
import { runMutationTest } from '../analysis/mutation.js';
import { checkArchitecture } from '../analysis/import-check.js';
import { AstCacheManager } from '../utils/AstCacheManager.js';
import { runSelfHealing } from '../checkers/fixer.js';

// AST 패턴 정의 (v3.0 Semantic)
const UI_AST_PATTERNS = [
  'use$A($$$)', // Hooks
  '< $A $$$ />', // JSX
  'createElement($$$)',
  'render($$$)',
];

const LOGIC_AST_PATTERNS = [
  'Math.$A($$$)',
  'new Map($$$)',
  'new Set($$$)',
  'crypto.$A($$$)',
  'fetch($$$)',
];

/**
 * JavaScript 및 TypeScript 언어에 특화된 품질 분석을 수행하는 프로바이더 클래스입니다.
 * v6.6.0: 모든 핵심 분석 파이프라인을 Rust Native 단일 호출로 통합했습니다 (FFI 오버헤드 제로화).
 */
export class JavascriptProvider extends BaseQualityProvider {
  name = 'Javascript/TypeScript';
  extensions = ['.ts', '.js', '.tsx', '.jsx'];

  async check(
    filePath: string,
    options?: {
      maxLines?: number;
      maxComplexity?: number;
    }
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    // 테스트 파일 여부 판별
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

    const reviewOptions: ReviewOptions = {
      maxFunctionLines: READABILITY.MAX_FUNCTION_LINES,
      maxParameterCount: READABILITY.MAX_PARAMETER_COUNT,
      densityThresholdMedium: READABILITY.DENSITY_THRESHOLD_MEDIUM,
      densityThresholdHigh: READABILITY.DENSITY_THRESHOLD_HIGH,
      minFunctionLinesForComment: READABILITY.MIN_FUNCTION_LINES_FOR_COMMENT,
    };

    const externalExports = this.semantic
      ? this.semantic.getAllExportedSymbols().map((s) => s.name)
      : [];

    try {
      // v0.0.1: Native 통합 분석 실행
      const result = runUltimateAnalysisNative(
        filePath,
        Boolean(isTestFile),
        reviewOptions,
        externalExports
      );

      violations.push(
        ...result.violations.map((v) => ({
          type: v.type as any,
          file: filePath,
          line: v.line || 1,
          rationale: v.rationale || undefined,
          message: v.message,
        }))
      );

      const isDataFile = result.lineCount > 50 && result.complexity / result.lineCount < 0.1;
      const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile, options);

      if (!isDataFile && result.lineCount > maxLines) {
        violations.push({
          type: 'SIZE',
          file: filePath,
          value: result.lineCount,
          limit: maxLines,
          message: `단일 로직 파일이 너무 큽니다 (${result.lineCount}줄).`,
        });
      }

      // 복잡도 위반에 대한 상세 Advice 추가 (JS fallback for rich messaging)
      if (!isDataFile && result.complexity > maxComplexity) {
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

        // Native 결과에 Advice 추가
        const compV = violations.find((v) => v.type === 'COMPLEXITY');
        if (compV) {
          compV.message = `${compV.message}\n\n* Senior Advice: ${advice}`;
        } else {
          violations.push({
            type: 'COMPLEXITY',
            file: filePath,
            value: result.complexity,
            limit: maxComplexity,
            message: `전체 복잡도(${result.complexity})가 기준을 초과했습니다. \n\n* Senior Advice: ${advice}`,
          });
        }
      }
    } catch (e) {
      // Fallback
    }

    const architectureRules = this.config.architectureRules;
    if (architectureRules && architectureRules.length > 0) {
      const archViolations = await checkArchitecture(filePath, architectureRules, process.cwd());
      violations.push(
        ...archViolations.map((av) => ({
          type: 'ARCHITECTURE' as any,
          file: filePath,
          message: av.message,
        }))
      );
    }

    if (this.config.enableMutationTest) {
      violations.push(...(await runMutationTest(filePath)));
    }

    // v3.7.1: 분석 완료 후 캐시 초기화 (환각 방어 및 메모리 효율화)
    AstCacheManager.getInstance().clear();

    return violations;
  }

  override async fix(files: string[], workspacePath: string) {
    return runSelfHealing(files, workspacePath);
  }
}
