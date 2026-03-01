import { BaseQualityProvider } from './BaseQualityProvider.js';
import { Violation } from '../types/index.js';
import { analyzeFile } from '../analysis/sg.js';
import { checkSecrets } from '../checkers/security.js';
import { runSemanticReview } from '../analysis/reviewer.js';

/**
 * Kotlin 언어에 특화된 품질 분석을 수행하는 프로바이더 클래스입니다. (v3.4 Polyglot)
 */
export class KotlinProvider extends BaseQualityProvider {
  name = 'Kotlin';
  public extensions = ['.kt', '.kts'];

  async check(filePath: string): Promise<Violation[]> {
    const violations: Violation[] = [];
    const customRules = this.config.customRules;

    // 1. 기본 AST 메트릭 분석 (Kotlin 지원 sg 엔진 활용)
    const metrics = await analyzeFile(filePath, customRules);
    const isDataFile = metrics.isDataFile;
    const { maxLines, maxComplexity } = this.getEffectiveLimits(isDataFile);

    if (!isDataFile && metrics.lineCount > maxLines) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: metrics.lineCount,
        limit: maxLines,
        message: `Kotlin 파일이 너무 큽니다 (${metrics.lineCount}줄). 클래스나 인터페이스를 논리적으로 분리하세요.`,
      });
    }

    if (!isDataFile && metrics.complexity > maxComplexity) {
      violations.push({
        type: 'COMPLEXITY',
        file: filePath,
        value: metrics.complexity,
        limit: maxComplexity,
        message: `Kotlin 함수의 복잡도(${metrics.complexity})가 너무 높습니다. 가독성을 위해 리팩토링이 필요합니다.`,
      });
    }

    // 2. 보안 스캔
    const secretViolations = await checkSecrets(filePath);
    violations.push(...secretViolations);

    // 3. 정성적 리뷰 (Kotlin AST 구조 지원)
    const reviewViolations = await runSemanticReview(filePath, isDataFile);
    violations.push(...reviewViolations);

    return violations;
  }
}
