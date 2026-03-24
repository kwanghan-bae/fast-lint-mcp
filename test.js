import { AnalysisService } from './dist/service/AnalysisService.js';
import { StateManager } from './dist/state.js';
import { ConfigService } from './dist/config.js';
import { SemanticService } from './dist/service/SemanticService.js';

// run 함수는 내부 로직을 처리합니다.
async function run() {
  process.env.FAST_LINT_WORKSPACE = '/Users/joel/Desktop/git/midas';
  process.chdir('/Users/joel/Desktop/git/midas');

  const stateManager = new StateManager();
  const config = new ConfigService();
  const semantic = new SemanticService(stateManager, config);
  const analysisService = new AnalysisService(stateManager, config, semantic);
  const report = await analysisService.runAllChecks({ incremental: false });
  console.log(JSON.stringify(report, null, 2));
}

run().catch(console.error);
