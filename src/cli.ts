#!/usr/bin/env node
import { main as runMcpServer } from './index.js';
import { AnalysisService } from './service/AnalysisService.js';
import { StateManager } from './state.js';
import { ConfigService } from './config.js';
import { SemanticService } from './service/SemanticService.js';
import { formatCLITable } from './utils/AnalysisUtils.js';
import { VERSION } from './constants.js';

/**
 * fast-lint-mcp의 경량 CLI 진입점입니다. (v6.0.1)
 * 외부 의존성 없이 npx 실행을 최적화합니다.
 */
async function run() {
  const args = process.argv.slice(2);

  // 1. 도움말 출력
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Fast-Lint-MCP ${VERSION} - AI-native Quality Gate

Usage:
  npx fast-lint-mcp [command] [options]

Commands:
  (default)           Run as MCP Server for AI Agent interaction
  check               Run a one-time quality diagnosis

Options:
  -p, --path <path>   Workspace path to analyze (default: current directory)
  -f, --full          Run full analysis instead of incremental
  -v, --version       Show version
  -h, --help          Show this help
    `);
    return;
  }

  // 2. 버전 출력
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    return;
  }

  // 3. 품질 검사 모드
  if (args[0] === 'check') {
    const pathIdx = args.indexOf('--path') > -1 ? args.indexOf('--path') : args.indexOf('-p');
    const workspacePath = pathIdx > -1 ? args[pathIdx + 1] : process.cwd();
    const isFull = args.includes('--full') || args.includes('-f');

    console.log(`🚀 Fast-Lint-MCP ${VERSION} - 프로젝트 진단을 시작합니다...`);

    try {
      const stateManager = new StateManager(workspacePath);
      const config = new ConfigService(workspacePath);
      const semantic = new SemanticService();

      // 심볼 인덱싱 초기화 (v6.0 필수)
      await semantic.ensureInitialized(true, workspacePath);

      const analyzer = new AnalysisService(stateManager, config, semantic);
      const report = await analyzer.runAllChecks({
        incremental: !isFull,
        forceFullScan: isFull,
      });

      console.log(formatCLITable(report));
      if (!report.pass) {
        process.exit(1);
      }
    } catch (error) {
      console.error(
        `❌ 진단 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  // 4. MCP 서버 모드 (Default)
  await runMcpServer();
}

run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
