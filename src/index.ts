import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { QualityDB } from './db.js';
import { ConfigService } from './config.js';
import { AnalysisService } from './service/AnalysisService.js';
import { SemanticService } from './service/SemanticService.js';
import { formatReport } from './utils/AnalysisUtils.js';
import { join } from 'path';

const server = new Server(
  {
    name: 'fast-lint-mcp',
    version: '2.0.0', // Major Update
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 의존성 초기화 (지연 로딩)
let db: QualityDB;
let config: ConfigService;
let analyzer: AnalysisService;
let semantic: SemanticService;

function getAnalyzer() {
  if (!analyzer) {
    db = new QualityDB();
    config = new ConfigService();
    analyzer = new AnalysisService(db, config);
  }
  return analyzer;
}

function getSemantic() {
    if (!semantic) {
        semantic = new SemanticService();
    }
    return semantic;
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
      {
        name: 'get-symbol-metrics',
        description: '[Token Saver] 파일 내 함수/클래스 단위의 복잡도와 라인 수를 분석합니다. 파일 전체를 읽기 전에 이 도구를 사용하여 수정할 심볼을 특정하세요.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: '분석할 파일의 경로 (상대 경로)' }
          },
          required: ['filePath']
        }
      },
      {
        name: 'get-symbol-content',
        description: '[Token Saver] 파일 전체가 아닌 특정 심볼(함수, 클래스)의 코드 내용만 읽습니다. 필요한 부분만 읽어 컨텍스트 낭비를 막으세요.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: '파일 경로' },
                symbolName: { type: 'string', description: '읽을 함수 또는 클래스 이름 (예: myFunc, MyClass.method)' }
            },
            required: ['filePath', 'symbolName']
        }
      },
      {
        name: 'find-dead-code',
        description: '[Cleanup] 프로젝트 내에서 사용되지 않는 Export된 함수나 변수를 찾아냅니다. 기술 부채를 줄일 때 사용하세요.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
      },
      {
        name: 'analyze-impact',
        description: '[Safety] 심볼 수정 시 영향을 받는 파일과 테스트 케이스를 추적합니다. 리팩토링 전/후에 사용하여 사이드 이펙트를 방지하세요.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: '수정 대상 파일 경로' },
                symbolName: { type: 'string', description: '수정할 심볼 이름' }
            },
            required: ['filePath', 'symbolName']
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'quality-check': {
        const report = await getAnalyzer().runAllChecks();
        const formattedText = formatReport(report);
        return { content: [{ type: 'text', text: formattedText }] };
      }

      case 'get-symbol-metrics': {
        const filePath = join(process.cwd(), String(args?.filePath));
        const metrics = getSemantic().getSymbolMetrics(filePath);
        return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
      }

      case 'get-symbol-content': {
          const filePath = join(process.cwd(), String(args?.filePath));
          const content = getSemantic().getSymbolContent(filePath, String(args?.symbolName));
          if (!content) {
               return { content: [{ type: 'text', text: `Symbol '${args?.symbolName}' not found in ${args?.filePath}` }], isError: true };
          }
          return { content: [{ type: 'text', text: content }] };
      }

      case 'find-dead-code': {
          const deadCodes = getSemantic().findDeadCode();
          if (deadCodes.length === 0) {
              return { content: [{ type: 'text', text: '미사용 코드가 발견되지 않았습니다. (Great Job!)' }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify(deadCodes, null, 2) }] };
      }

      case 'analyze-impact': {
          const filePath = join(process.cwd(), String(args?.filePath));
          const impact = getSemantic().analyzeImpact(filePath, String(args?.symbolName));
          return { content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

  } catch (error) {
    console.error(`Error during tool execution (${request.params.name}):`, error);
    return {
      content: [
        {
          type: 'text',
          text: `오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
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

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}

export { formatReport };
