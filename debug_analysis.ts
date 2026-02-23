import { QualityDB } from './src/db.js';
import { ConfigService } from './src/config.js';
import { AnalysisService } from './src/service/AnalysisService.js';
import chalk from 'chalk';
import Table from 'cli-table3';

async function runSelfAnalysis() {
  const db = new QualityDB();
  const config = new ConfigService();
  const analyzer = new AnalysisService(db, config);

  console.log('🚀 Fast-Lint-MCP 셀프 분석 시작...');
  
  try {
    const report = await analyzer.runAllChecks();
    
    const statusIcon = report.pass ? '✅' : '❌';
    const statusText = report.pass ? chalk.green.bold('PASS') : chalk.red.bold('FAIL');

    process.stdout.write(`\n${statusIcon} 프로젝트 품질 인증 결과: ${statusText}\n`);
    process.stdout.write(`------------------------------------------\n`);

    if (report.violations.length > 0) {
      const table = new Table({
        head: [chalk.cyan('Type'), chalk.cyan('File'), chalk.cyan('Message')],
        colWidths: [15, 30, 50],
        wordWrap: true,
      });

      report.violations.forEach((v: any) => {
        table.push([chalk.yellow(v.type), v.file || '-', v.message]);
      });

      console.log(table.toString());
    } else {
      process.stdout.write(chalk.green('\n🎉 발견된 위반 사항이 없습니다. 완벽합니다!\n'));
    }

    process.stdout.write(`\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`);
  } catch (error) {
    console.error('분석 중 오류 발생:', error);
  }
}

runSelfAnalysis();
