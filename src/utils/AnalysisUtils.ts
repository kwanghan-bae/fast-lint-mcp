import { Violation } from '../types/index.js';
import chalk from 'chalk';
import { DependencyGraph } from './DependencyGraph.js';
import Table from 'cli-table3';

/**
 * 분석 결과를 가독성 좋은 Markdown 형식으로 변환합니다. (MCP/AI 친화적)
 */
export function formatReport(report: any): string {
  let output = '';

  const statusIcon = report.pass ? '✅' : '❌';
  const statusText = report.pass ? 'PASS' : 'FAIL';

  output += `### ${statusIcon} 프로젝트 품질 인증 결과: ${statusText}\n\n`;

  if (report.violations.length > 0) {
    output += `| Type | File | Message |\n`;
    output += `| :--- | :--- | :--- |\n`;

    report.violations.forEach((v: Violation) => {
      const safeMessage = v.message.replace(/\|/g, '\\|');
      const fileName = v.file || '-';
      output += `| **${v.type}** | \`${fileName}\` | ${safeMessage} |\n`;
    });
  } else {
    output += `\n> 🎉 **발견된 위반 사항이 없습니다. 완벽합니다!**\n`;
  }

  if (report.suggestion) {
    output += `\n#### 💡 Suggestions\n${report.suggestion}\n`;
  }

  return output;
}

/**
 * 기존 CLI용 테이블 출력 (개발자 직접 실행용)
 */
export function formatCLITable(report: any): string {
  let output = '';

  const statusIcon = report.pass ? '✅' : '❌';
  const statusText = report.pass ? chalk.green.bold('PASS') : chalk.red.bold('FAIL');

  output += `\n${statusIcon} 프로젝트 품질 인증 결과: ${statusText}\n`;
  output += `------------------------------------------\n`;

  if (report.violations.length > 0) {
    const table = new Table({
      head: [chalk.cyan('Type'), chalk.cyan('File'), chalk.cyan('Message')],
      colWidths: [15, 30, 50],
      wordWrap: true,
    });

    report.violations.forEach((v: any) => {
      table.push([chalk.yellow(v.type), v.file || '-', v.message]);
    });

    output += table.toString() + '\n';
  } else {
    output += chalk.green('\n🎉 발견된 위반 사항이 없습니다. 완벽합니다!\n');
  }

  if (report.suggestion) {
    output += `\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`;
  }

  return output;
}

export async function checkStructuralIntegrity(depGraph?: DependencyGraph): Promise<Violation[]> {
  const violations: Violation[] = [];
  if (!depGraph) return [];
  return violations;
}
