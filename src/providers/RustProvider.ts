import { existsSync, readFileSync } from 'fs';
import { extractSymbolsRustNative } from '../../native/index.js';
import { Violation, ViolationType } from '../types/index.js';
import { BaseQualityProvider } from './BaseQualityProvider.js';
import { READABILITY } from '../constants.js';
import { checkArchitecture } from '../analysis/import-check.js';
import { Logger } from '../utils/Logger.js';

/**
 * Rust 프로바이더
 * v6.8.0: Rust Native 파서를 사용하여 .rs 파일을 고속으로 분석합니다.
 */
export class RustProvider extends BaseQualityProvider {
  name = 'Rust';
  extensions = ['.rs'];

  async check(
    filePath: string,
    options?: {
      maxLines?: number;
      maxComplexity?: number;
    }
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    // 파일 읽기
    let content = '';
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (e) {
      return violations;
    }

    const { maxLines, maxComplexity } = this.getEffectiveLimits(false, options);

    try {
      // 1. Rust Native 엔진을 통해 심볼 및 복잡도 분석 추출
      const symbols = extractSymbolsRustNative(filePath, content);
      
      let totalComplexity = 0;
      let totalLines = content.split('\n').length;
      
      // 파일 크기 위반 체크
      this.addSizeViolation(filePath, totalLines, maxLines, false, violations);

      // 2. 개별 심볼 위반 분석
      for (const sym of symbols) {
        totalComplexity += sym.complexity;

        // 개별 함수(메서드 포함) 크기 체크
        if (sym.kind === 'function' || sym.kind === 'method') {
          if (sym.lines > READABILITY.MAX_FUNCTION_LINES) {
            violations.push({
              type: 'READABILITY',
              file: filePath,
              line: sym.line,
              message: `[READABILITY] '${sym.name}' 함수가 너무 깁니다 (${sym.lines}줄). ${READABILITY.MAX_FUNCTION_LINES}줄 이하로 분리하세요.`,
            });
          }
          
          if (sym.parameterCount > READABILITY.MAX_PARAMETER_COUNT) {
            violations.push({
              type: 'READABILITY',
              file: filePath,
              line: sym.line,
              message: `[READABILITY] '${sym.name}' 함수의 파라미터가 너무 많습니다 (${sym.parameterCount}개). ${READABILITY.MAX_PARAMETER_COUNT}개 이하로 줄이세요.`,
            });
          }
          
          if (sym.complexity > 5) {
             // 개별 복잡도 체크도 추가적으로 리포팅 가능하나, 기본은 파일 전체 복잡도를 기준으로 합니다.
          }
        }
      }

      // 파일 전체 복잡도 검증
      this.addComplexityViolation(filePath, totalComplexity, maxComplexity, false, violations);

    } catch (e) {
      Logger.warn('RustProvider', `네이티브 분석 실패 (${filePath})`, (e as Error).message);
      // Don't add violation — silent degradation is OK for native parse failures
    }

    // 아키텍처 의존성 체크 (다른 프로바이더와 동일하게 유지)
    const architectureRules = this.config.architectureRules;
    if (architectureRules && architectureRules.length > 0) {
      const archViolations = await checkArchitecture(filePath, architectureRules, process.cwd());
      violations.push(
        ...archViolations.map((av) => ({
          type: 'ARCHITECTURE' as ViolationType,
          file: filePath,
          message: av.message,
        }))
      );
    }

    return violations;
  }
}
