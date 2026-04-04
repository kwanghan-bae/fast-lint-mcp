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
import { generateComplexityAdvice } from './ComplexityAdvisor.js';

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
      console.warn(`[JavascriptProvider] 네이티브 분석 실패 (${filePath}):`, (e as Error).message);
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
    let lines: string[] | null = null;

    violations.push(
      ...nativeViolations.map((v) => {
        const violation: Violation = {
          type: v.type as any,
          file: filePath,
          line: v.line || 1,
          rationale: v.rationale || undefined,
          message: v.message,
        };

        // v3.9.2: READABILITY (주석 누락) 위반 시 Auto-Fix 패치 제안(fixSuggestion) 생성
        if (violation.type === 'READABILITY' && violation.message.includes('주석이 없습니다')) {
          try {
            if (!lines) lines = readFileSync(filePath, 'utf-8').split('\n');
            const targetLine = lines[(violation.line || 1) - 1];
            if (targetLine) {
              const indentMatch = targetLine.match(/^(\s*)/);
              const indent = indentMatch ? indentMatch[1] : '';
              
              // 추출된 심볼명 찾기
              const symbolMatch = violation.message.match(/\[(.*?)\]에 한글 주석이/);
              const symbolName = symbolMatch ? symbolMatch[1] : '해당 심볼';

              violation.fixSuggestion = {
                old_string: targetLine,
                new_string: `${indent}/**\n${indent} * [작성 필요] ${symbolName}의 역할과 목적을 한글로 설명하세요.\n${indent} */\n${targetLine}`
              };
            }
          } catch (e) {
            console.warn('[JavascriptProvider] fixSuggestion 생성 실패:', (e as Error).message);
          }
        }

        return violation;
      })
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

    const advice = generateComplexityAdvice(filePath);
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
