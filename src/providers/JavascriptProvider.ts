import { existsSync } from 'fs';
import { runUltimateAnalysisNative, ReviewOptions } from '../../native/index.js';
import { Violation } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';
import { READABILITY } from '../constants.js';
import { checkTestValidity } from '../analysis/test-check.js';
import { runMutationTest } from '../analysis/mutation.js';
import { checkArchitecture } from '../analysis/import-check.js';

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
      securityThreshold?: number;
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

    const externalExports = this.semantic ? this.semantic.getAllExportedSymbols().map(s => s.name) : [];

    try {
      // v0.0.1: Native 통합 분석 실행
      const result = runUltimateAnalysisNative(filePath, Boolean(isTestFile), reviewOptions, externalExports);
      
      violations.push(...result.violations.map(v => ({
          type: v.type as any,
          file: filePath,
          line: v.line || 1,
          rationale: v.rationale || undefined,
          message: v.message
      })));

      const isDataFile = result.line_count > 50 && result.complexity / result.line_count < 0.1;
      const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile, options);

      if (!isDataFile && result.line_count > maxLines) {
        violations.push({
          type: 'SIZE',
          file: filePath,
          value: result.line_count,
          limit: maxLines,
          message: `단일 로직 파일이 너무 큽니다 (${result.line_count}줄).`,
        });
      }

      if (!isDataFile && result.complexity > maxComplexity) {
          violations.push({
            type: 'COMPLEXITY',
            file: filePath,
            value: result.complexity,
            limit: maxComplexity,
            message: `전체 복잡도(${result.complexity})가 기준을 초과했습니다.`,
          });
      }

    } catch (e) {
      // Fallback or ignore
    }

    // 아키텍처 및 변이 테스트는 여전히 별도 호출 (오케스트레이션 유지)
    const architectureRules = this.config.architectureRules;
    if (architectureRules && architectureRules.length > 0) {
      const archViolations = await checkArchitecture(filePath, architectureRules, process.cwd(), this.config.exclude);
      violations.push(...archViolations.map(av => ({ type: 'ARCHITECTURE' as any, file: filePath, message: av.message })));
    }

    if (this.config.enableMutationTest) {
      violations.push(...await runMutationTest(filePath));
    }

    return violations;
  }

  override async fix(files: string[], workspacePath: string) {
    const { runSelfHealing } = await import('../checkers/fixer.js');
    return runSelfHealing(files, workspacePath);
  }
}
