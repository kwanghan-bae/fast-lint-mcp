import { existsSync, readFileSync } from 'fs';
import { runUltimateAnalysisNative, ReviewOptions } from '../../native/index.js';
import { Violation } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';
import { READABILITY } from '../constants.js';
import { checkTestValidity } from '../analysis/test-check.js';
import { runMutationTest } from '../analysis/mutation.js';
import { checkArchitecture, extractImportsFromFile } from '../analysis/import-check.js';
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
    const isTestFile = this.isTestFile(filePath);

    if (isTestFile) this.validateTestReliability(filePath, violations);

    try {
      const result = this.executeNativeAnalysis(filePath, isTestFile);
      this.mapNativeViolations(filePath, result.violations, violations);
      this.validateMetrics(filePath, result, options, violations);
    } catch (e) {
      // 분석 실패 시 건너뜀
    }

    await this.checkAdditionalRules(filePath, violations);
    const cache = AstCacheManager.getInstance();
    if (cache && typeof cache.clear === 'function') {
      cache.clear();
    }

    return violations;
  }

  /** Native 엔진을 사용하여 통합 분석을 실행합니다. */
  private executeNativeAnalysis(filePath: string, isTestFile: boolean) {
    const content = readFileSync(filePath, 'utf-8');
    const imports = extractImportsFromFile(content);
    const reviewOptions = this.getReviewOptions();
    const externalExports = this.semantic
      ? this.semantic.getAllExportedSymbols().map((s) => s.name)
      : [];

    return runUltimateAnalysisNative(
      filePath,
      isTestFile,
      reviewOptions,
      externalExports,
      imports
    );
  }

  /** 파일의 라인 수와 복잡도 메트릭을 검증합니다. */
  private validateMetrics(filePath: string, result: any, options: any, violations: Violation[]) {
    const isDataFile = result.line_count > 50 && result.complexity / result.line_count < 0.1;
    const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile, options);

    this.validateSize(filePath, result.line_count, maxLines, isDataFile, violations);
    this.validateComplexity(filePath, result.complexity, maxComplexity, isDataFile, violations);
  }

  /** 테스트 파일 여부 판별 */
  private isTestFile(filePath: string): boolean {
    return (
      filePath.match(/\.(test|spec)\.[tj]sx?$/) !== null ||
      filePath.includes('/tests/') ||
      filePath.includes('/__tests__/')
    );
  }

  /** 테스트 코드의 신뢰성(Assertion 유무 등)을 검증합니다. */
  private validateTestReliability(filePath: string, violations: Violation[]) {
    const testResult = checkTestValidity(filePath);
    if (!testResult.isValid) {
      violations.push({
        type: 'READABILITY',
        file: filePath,
        message: `[테스트 신뢰성] ${testResult.message}`,
      });
    }
  }

  /** Native 엔진에 전달할 분석 옵션을 구성합니다. */
  private getReviewOptions(): ReviewOptions {
    return {
      maxFunctionLines: READABILITY.MAX_FUNCTION_LINES,
      maxParameterCount: READABILITY.MAX_PARAMETER_COUNT,
      densityThresholdMedium: READABILITY.DENSITY_THRESHOLD_MEDIUM,
      densityThresholdHigh: READABILITY.DENSITY_THRESHOLD_HIGH,
      minFunctionLinesForComment: READABILITY.MIN_FUNCTION_LINES_FOR_COMMENT,
    };
  }

  /** Native 분석 결과를 프로젝트 표준 Violation 형식으로 변환합니다. */
  private mapNativeViolations(filePath: string, nativeViolations: any[], violations: Violation[]) {
    violations.push(
      ...nativeViolations.map((v) => ({
        type: v.type as any,
        file: filePath,
        line: v.line || 1,
        rationale: v.rationale || undefined,
        message: v.message,
      }))
    );
  }

  /** 파일 크기(라인 수)가 기준을 초과하는지 검증합니다. */
  private validateSize(
    filePath: string,
    lineCount: number,
    maxLines: number,
    isDataFile: boolean,
    violations: Violation[]
  ) {
    if (!isDataFile && lineCount > maxLines) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: lineCount,
        limit: maxLines,
        message: `단일 로직 파일이 너무 큽니다 (${lineCount}줄).`,
      });
    }
  }

  /** 코드 복잡도를 검증하고 시니어 개발자 조언(Advice)을 추가합니다. */
  private validateComplexity(
    filePath: string,
    complexity: number,
    maxComplexity: number,
    isDataFile: boolean,
    violations: Violation[]
  ) {
    if (isDataFile || complexity <= maxComplexity) return;

    const advice = this.generateComplexityAdvice(filePath);
    const existingViolation = violations.find((v) => v.type === 'COMPLEXITY');

    if (existingViolation) {
      existingViolation.message = `${existingViolation.message}\n\n* Senior Advice: ${advice}`;
    } else {
      violations.push({
        type: 'COMPLEXITY',
        file: filePath,
        value: complexity,
        limit: maxComplexity,
        message: `전체 복잡도(${complexity})가 기준을 초과했습니다. \n\n* Senior Advice: ${advice}`,
      });
    }
  }

  /** AST 패턴 분석을 통해 복잡도 해결을 위한 구체적인 가이드를 생성합니다. */
  private generateComplexityAdvice(filePath: string): string {
    const cache = AstCacheManager.getInstance();
    const root = cache.getRootNode(filePath);
    const symbols = cache.getSymbols(filePath);
    
    if (!root) return '코드 복잡도가 기준을 초과했습니다. 로직을 더 작은 함수나 클래스로 분리하세요.';

    // 1. 거대 함수 여부 판별 (단일 함수가 전체 복잡도의 50% 이상 차지하는지)
    const totalComplexity = symbols.reduce((acc, s) => acc + s.complexity, 0);
    const giantSymbol = symbols.find(s => s.complexity > 10 && s.complexity > totalComplexity * 0.5);

    if (giantSymbol) {
      return `[거대 함수 발견] '${giantSymbol.name}' 함수의 복잡도가 너무 높습니다. 이 함수 내부의 조건문이나 반복문을 별도의 작은 함수로 추출(Extract Method)하여 책임을 분산시키세요.`;
    }

    // 2. 함수 과다 여부 판별
    if (symbols.length > 15) {
      return `[함수 과다 존재] 파일 내에 너무 많은 함수(${symbols.length}개)가 정의되어 있어 관리 복잡도가 높습니다. 서로 연관된 기능들을 새로운 클래스나 모듈로 분리(Extract Class/Module)하는 것을 권장합니다.`;
    }

    const hasUIPatterns = UI_AST_PATTERNS.some((p) => root.findAll(p).length > 0);
    const hasLogicPatterns = LOGIC_AST_PATTERNS.some((p) => root.findAll(p).length > 0);

    if (hasUIPatterns && !hasLogicPatterns) {
      return '이 컴포넌트에는 UI 렌더링과 복잡한 상태 관리가 혼재되어 있습니다. Business Logic을 Custom Hook으로 추출하거나, Presentational Component로 UI를 분리하세요.';
    }
    if (hasLogicPatterns && !hasUIPatterns) {
      return '이 파일에는 고도의 연산 로직이 포함되어 있습니다. 서비스 레이어나 순수 함수 기반의 유틸리티 라이브러리로 로직을 캡슐화하는 것이 좋겠습니다.';
    }
    if (hasUIPatterns && hasLogicPatterns) {
      return '렌더링 코드와 복잡한 계산 로직이 강하게 결합되어 있습니다. 유지보수를 위해 렌더링부와 로직부를 엄격히 분리(SOC: Separation of Concerns)하세요.';
    }
    return '코드 복잡도가 기준을 초과했습니다. 로직을 더 작은 함수나 클래스로 분리하세요.';
  }

  /** 아키텍처 의존성 및 뮤테이션 테스트 등 추가 규칙을 검사합니다. */
  private async checkAdditionalRules(filePath: string, violations: Violation[]) {
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
  }

  /**
   * 발견된 위반 사항들에 대해 자동으로 수정을 시도합니다. (Self-Healing)
   * 에이전트가 코드를 수정하기 전 안전한 가이드라인을 제공합니다.
   */
  override async fix(files: string[], workspacePath: string) {
    return runSelfHealing(files, workspacePath);
  }
}
