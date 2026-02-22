import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { QualityDB } from './db.js';
import { ConfigService } from './config.js';
import { AnalysisService } from './service/AnalysisService.js';
import chalk from 'chalk';
import Table from 'cli-table3';

const server = new Server(
  {
    name: 'fast-lint-mcp',
    version: '1.2.0', // 버전 상향
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 의존성 초기화
const db = new QualityDB();
const config = new ConfigService();
const analyzer = new AnalysisService(db, config);

/**
 * 분석 결과를 가독성 좋은 테이블 형식으로 변환합니다.
 */
function formatReport(report: any): string {
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

  output += `\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`;

  return output;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'quality-check',
        description:
          '프로젝트 전체 코드 품질을 검사하고 기준 미달 시 리팩토링 가이드를 제공합니다. (High-Performance v1.2)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'quality-check') {
    throw new Error('Unknown tool');
  }

  try {
    const report = await analyzer.runAllChecks();
    const formattedText = formatReport(report);

    return {
      content: [{ type: 'text', text: formattedText }],
    };
  } catch (error) {
    console.error('Error during quality check:', error);
    return {
      content: [
        {
          type: 'text',
          text: `분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fast-Lint-MCP Server running on stdio (Performance Optimized v1.2.0)');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
