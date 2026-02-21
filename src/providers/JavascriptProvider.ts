import { readFileSync } from 'fs';
import { analyzeFile } from '../analysis/sg.js';
import { checkHallucination, checkFakeLogic } from '../analysis/import-check.js';
import { checkSecrets } from '../checkers/security.js';
import { runMutationTest } from '../analysis/mutation.js';
import { runSemanticReview } from '../analysis/reviewer.js';
import { runSelfHealing } from '../checkers/fixer.js';
import { QualityProvider, Violation } from '../types/index.js';
import { ConfigService } from '../config.js';

export class JavascriptProvider implements QualityProvider {
  name = 'Javascript/TypeScript';
  extensions = ['.ts', '.js', '.tsx', '.jsx'];

  constructor(private config: ConfigService) {}

  async check(filePath: string): Promise<Violation[]> {
    const violations: Violation[] = [];
    const rules = this.config.rules;
    const customRules = this.config.customRules;

    // 1. AST 분석 (사이즈, 복잡도, 커스텀 룰)
    const metrics = await analyzeFile(filePath, customRules);
    
    if (metrics.lineCount > rules.maxLineCount) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: metrics.lineCount,
        limit: rules.maxLineCount,
        message: `단일 파일 ${rules.maxLineCount}줄 초과: 파일 분리 필요`,
      });
    }
    if (metrics.complexity > rules.maxComplexity) {
      violations.push({
        type: 'COMPLEXITY',
        file: filePath,
        value: metrics.complexity,
        limit: rules.maxComplexity,
        message: `함수/클래스 복잡도가 임계값(${rules.maxComplexity})을 초과했습니다.`,
      });
    }

    // 2. 환각(Hallucination) 체크
    const hallucinationViolations = await checkHallucination(filePath);
    hallucinationViolations.forEach(hv => {
      violations.push({ type: 'HALLUCINATION', file: filePath, message: `[환각 경고] ${hv.message}` });
    });

    // 3. 가짜 구현(Fake Logic) 체크
    const fakeLogicViolations = await checkFakeLogic(filePath);
    fakeLogicViolations.forEach(fv => {
      violations.push({ type: 'FAKE_LOGIC', file: filePath, message: `[논리 의심] ${fv.message}` });
    });

    // 4. 보안(Secret) 스캔
    const secretViolations = await checkSecrets(filePath);
    violations.push(...secretViolations);

    // 5. 정성적 코드 리뷰 (READABILITY)
    const reviewViolations = await runSemanticReview(filePath);
    violations.push(...reviewViolations);

    // 6. 변이 테스트 (테스트 파일이 아닌 경우에만)
    if (!filePath.endsWith('.test.ts') && !filePath.endsWith('.spec.ts')) {
      const mutationViolations = await runMutationTest(filePath);
      mutationViolations.forEach(mv => {
        violations.push({ type: 'MUTATION_SURVIVED', file: filePath, message: `[가짜 테스트 의심] ${mv.message}` });
      });
    }

    metrics.customViolations?.forEach(cv => {
      violations.push({ type: 'CUSTOM', file: filePath, message: `[${cv.id}] ${cv.message}` });
    });

    return violations;
  }

  async fix(files: string[], workspacePath: string) {
    return runSelfHealing(files, workspacePath);
  }
}
