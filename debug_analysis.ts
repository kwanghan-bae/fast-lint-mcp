import { StateManager } from './src/state.js';
import { ConfigService } from './src/config.js';
import { AnalysisService } from './src/service/AnalysisService.js';
import { SemanticService } from './src/service/SemanticService.js';
import chalk from 'chalk';
import { formatCLITable } from './src/utils/AnalysisUtils.js';

/**
 * Fast-Lint-MCP 도구 자체의 품질을 분석하기 위한 자가 분석 스크립트입니다.
 * 외부 라이브러리 의존성 없이 핵심 서비스를 직접 구동하여 품질 리포트를 생성합니다.
 */
async function runSelfAnalysis() {
  /** 품질 상태 관리자 초기화 (싱글톤) */
  const state = new StateManager();
  /** 설정 서비스 초기화 */
  const config = new ConfigService();
  /** 시맨틱 분석 서비스 초기화 */
  const semantic = new SemanticService();
  /** 메인 분석 엔진 초기화 */
  const analyzer = new AnalysisService(state, config, semantic);

  console.log(chalk.cyan('🚀 Fast-Lint-MCP 셀프 품질 분석 시작...'));

  try {
    const report = await analyzer.runAllChecks();
    console.log(formatCLITable(report));

    if (report.pass) {
      console.log(chalk.green('\n✅ 자기 자신에 대한 품질 검증을 통과했습니다!'));
    } else {
      console.log(chalk.red('\n❌ 자기 분석 결과 위반 사항이 발견되었습니다. 조치가 필요합니다.'));
    }
  } catch (error) {
    console.error(chalk.red('❌ 분석 도중 치명적 오류 발생:'), error);
  }
}

// 스크립트 실행
runSelfAnalysis();
