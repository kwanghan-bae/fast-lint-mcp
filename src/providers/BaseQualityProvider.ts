import { Violation, QualityProvider } from '../types/index.js';
import { ConfigService } from '../config.js';

/**
 * 언어별 품질 검사 프로바이더의 베이스 클래스입니다.
 * 향후 새로운 언어 추가 시 이를 상속받아 구현합니다.
 */
export abstract class BaseQualityProvider implements QualityProvider {
  abstract name: string;
  abstract extensions: string[];

  constructor(protected config: ConfigService) {}

  /**
   * 파일의 품질을 분석합니다.
   * @param filePath 분석할 파일 경로
   */
  abstract check(filePath: string): Promise<Violation[]>;

  /**
   * 자동 수정 기능을 수행합니다. (선택 사항)
   */
  async fix(
    files: string[],
    workspacePath: string
  ): Promise<{ fixedCount: number; messages: string[] }> {
    return { fixedCount: 0, messages: [] };
  }
}
