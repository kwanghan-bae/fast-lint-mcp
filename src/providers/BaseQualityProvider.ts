import { Violation, QualityProvider } from '../types/index.js';
import { ConfigService } from '../config.js';

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
   */
  constructor(protected config: ConfigService) {}

  /**
   * 대상 파일에 대해 정적 분석을 수행하여 품질 위반 사항을 찾아냅니다.
   * 각 언어별 프로바이더에서 구체적인 분석 로직을 구현해야 합니다.
   * @param filePath 분석할 파일의 경로
   * @returns 발견된 위반 사항(Violation) 배열
   */
  abstract check(filePath: string): Promise<Violation[]>;

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
