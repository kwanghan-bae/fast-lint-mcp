import { BaseQualityProvider } from './BaseQualityProvider.js';
import { Violation } from '../types/index.js';
import { analyzeFile } from '../analysis/sg.js';
import { runSemanticReview } from '../analysis/reviewer.js';
import { checkSecrets } from '../checkers/security.js';

/**
 * Kotlin 언어에 특화된 품질 분석을 수행하는 프로바이더 클래스입니다. (v3.4 Polyglot)
 */
export class KotlinProvider extends BaseQualityProvider {
  name = 'Kotlin';
  public extensions = ['.kt', '.kts'];

  async check(
    filePath: string,
    options?: {
      maxLines?: number;
      maxComplexity?: number;
    }
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const customRules = this.config.customRules;

    // 1. 기본 AST 메트릭 분석 (Kotlin 지원 sg 엔진 활용)
    const metrics = await analyzeFile(filePath, customRules);
    const isDataFile = metrics.isDataFile;
    const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile, options);

    this.addSizeViolation(filePath, metrics.lineCount, maxLines, isDataFile, violations);
    this.addComplexityViolation(filePath, metrics.complexity, maxComplexity, isDataFile, violations);

    // 2. 정성적 리뷰 (Kotlin AST 구조 지원)
    const reviewViolations = await runSemanticReview(filePath, isDataFile);
    violations.push(...reviewViolations);

    // 3. 보안 검사 (하드코딩된 민감 정보 탐지)
    const securityViolations = await checkSecrets(filePath);
    violations.push(...securityViolations);

    return violations;
  }
}
