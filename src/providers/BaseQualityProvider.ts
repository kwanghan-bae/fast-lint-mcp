import { Violation, QualityProvider } from '../types/index.js';
import { BatchResult } from '../../native/index.js';
import { ConfigService } from '../config.js';
import { SemanticService } from '../service/SemanticService.js';

/**
 * 언어별 품질 검사 프로바이더의 기반(Base)이 되는 추상 클래스입니다.
 * 새로운 프로그래밍 언어 분석기를 추가할 때 이 클래스를 상속받아 공통 인터페이스를 구현합니다.
 */
export abstract class BaseQualityProvider implements QualityProvider {
  /**
   * 프로바이더의 식별 이름 (예: 'Javascript/Typescript')
   */
  abstract name: string;

  /**
   * 이 프로바이더가 처리할 수 있는 파일 확장자 목록 (예: ['.ts', '.js'])
   */
  abstract extensions: string[];

  /**
   * BaseQualityProvider 인스턴스를 생성합니다.
   * @param config 프로젝트 설정 서비스 (하위 클래스에서 공유하여 사용)
   * @param semantic 심볼 분석 및 의존성 추적 서비스 (선택 사항)
   */
  constructor(
    protected config: ConfigService,
    protected semantic?: SemanticService
  ) {}

  /**
   * 파일 크기 위반 사항을 검사하고 violations 배열에 추가합니다.
   */
  protected addSizeViolation(
    filePath: string,
    lineCount: number,
    maxLines: number,
    isDataFile: boolean,
    violations: Violation[]
  ): void {
    if (!isDataFile && lineCount > maxLines) {
      violations.push({
        type: 'SIZE',
        file: filePath,
        value: lineCount,
        limit: maxLines,
        message: `파일이 ${lineCount}줄로 기준(${maxLines})을 초과합니다.`,
      });
    }
  }

  /**
   * 코드 복잡도 위반 사항을 검사하고 violations 배열에 추가합니다.
   */
  protected addComplexityViolation(
    filePath: string,
    complexity: number,
    maxComplexity: number,
    isDataFile: boolean,
    violations: Violation[]
  ): void {
    if (!isDataFile && complexity > maxComplexity) {
      violations.push({
        type: 'COMPLEXITY',
        file: filePath,
        value: complexity,
        limit: maxComplexity,
        message: `복잡도(${complexity})가 기준(${maxComplexity})을 초과합니다.`,
      });
    }
  }

  /**
   * 데이터 파일 여부 및 런타임 옵션에 따라 실질적인 임계값을 계산합니다. (v3.8)
   */
  protected getEffectiveLimits(
    isDataFile: boolean,
    options?: { maxLines?: number; maxComplexity?: number }
  ) {
    const rules = this.config.rules;
    return {
      maxLines: isDataFile ? Infinity : (options?.maxLines ?? rules.maxLineCount),
      maxComplexity: isDataFile ? Infinity : (options?.maxComplexity ?? rules.maxComplexity),
    };
  }

  /**
   * 대상 파일에 대해 정적 분석을 수행하여 품질 위반 사항을 찾아냅니다.
   */
  abstract check(
    filePath: string,
    options?: {
      securityThreshold?: number;
      maxLines?: number;
      maxComplexity?: number;
      batchResult?: BatchResult;
    }
  ): Promise<Violation[]>;

  /**
   * 발견된 오류를 자동으로 수정하는 자가 치유(Self-Healing) 프로세스를 실행합니다.
   * 기본 구현은 아무 작업도 수행하지 않으며, 필요한 프로바이더에서 오버라이드하여 구현합니다.
   * @param files 수정할 파일 목록
   * @param workspacePath 프로젝트 루트 경로
   * @returns 수정 결과 정보 (수정 건수 및 안내 메시지)
   */
  async fix(
    files: string[],
    workspacePath: string
  ): Promise<{ fixedCount: number; messages: string[] }> {
    // 기본적으로는 자동 수정을 지원하지 않음
    return { fixedCount: 0, messages: [] };
  }
}
