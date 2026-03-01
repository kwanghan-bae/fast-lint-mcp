import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StateManager } from './state.js';
import { ConfigService } from './config.js';
import { AnalysisService } from './service/AnalysisService.js';
import { SemanticService } from './service/SemanticService.js';
import { AgentWorkflow } from './agent/workflow.js';
import { formatReport, formatCLITable } from './utils/AnalysisUtils.js';
import { join } from 'path';

/**
 * Fast-Lint-MCP 서버의 엔트리 포인트입니다.
 * v3.7.2: 도구 핸들러 고도화 및 가독성 최적화
 */

/** MCP 서버 인스턴스 설정 및 초기화 */
const server = new Server(
  {
    name: 'fast-lint-mcp',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {}, // 도구 기능 활성화
    },
  }
);

/** 품질 검사 세션 간의 상태 관리자 (싱글톤) */
let stateManager: StateManager;
/** 프로젝트 설정 로드 및 관리 서비스 (싱글톤) */
let config: ConfigService;
/** 메인 품질 분석 서비스 (싱글톤) */
let analyzer: AnalysisService;
/** 심볼 추적 및 시맨틱 분석 서비스 (싱글톤) */
let semantic: SemanticService;
/** 자율형 코드 수정 에이전트 (싱글톤) */
let agent: AgentWorkflow;

/**
 * AnalysisService 인스턴스를 지연 로딩(Lazy Loading) 방식으로 제공합니다.
 */
function getAnalyzer() {
  if (!analyzer) {
    stateManager = new StateManager();
    config = new ConfigService();
    analyzer = new AnalysisService(stateManager, config, getSemantic());
  }
  return analyzer;
}

/**
 * SemanticService 인스턴스를 싱글톤으로 제공합니다.
 */
function getSemantic() {
  if (!semantic) semantic = new SemanticService();
  return semantic;
}

/**
 * AgentWorkflow 인스턴스를 싱글톤으로 제공합니다.
 */
function getAgent() {
  if (!agent) agent = new AgentWorkflow();
  return agent;
}

/**
 * 지원 가능한 MCP 도구 목록을 정의합니다.
 */
function getToolDefinitions() {
  return [
    {
      name: 'quality-check',
      description:
        'Performs a comprehensive code quality check across the entire project. (v3.7 Turbo)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get-symbol-metrics',
      description: 'Analyzes complexity and line counts of functions/classes within a file.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
      },
    },
    {
      name: 'get-symbol-content',
      description: 'Reads the source code content of a specific symbol.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' }, symbolName: { type: 'string' } },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'find-dead-code',
      description: 'Identifies exported functions or variables that are not used.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'analyze-impact',
      description: 'Tracks files and test cases affected by a symbol modification.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' }, symbolName: { type: 'string' } },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'find-references',
      description: 'Finds all references of a specific symbol.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' }, symbolName: { type: 'string' } },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'go-to-definition',
      description: 'Locates the exact definition of a specific symbol.',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' }, symbolName: { type: 'string' } },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'verify-fix',
      description: 'Verifies if the modified code correctly passes tests.',
      inputSchema: {
        type: 'object',
        properties: { testCommand: { type: 'string', default: 'npm test' } },
      },
    },
  ];
}

/**
 * MCP 도구 목록 요청을 처리합니다.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getToolDefinitions() };
});

/**
 * MCP 도구 호출 요청을 처리합니다.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleToolCall(name, args);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `오류 발생: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * 개별 도구 호출에 대한 실제 로직을 수행합니다.
 */
async function handleToolCall(name: string, args: any) {
  const workspace = process.cwd();
  const semanticSvc = getSemantic();

  switch (name) {
    case 'quality-check': {
      const report = await getAnalyzer().runAllChecks();
      return { content: [{ type: 'text', text: formatReport(report) }] };
    }
    case 'get-symbol-metrics': {
      const metrics = semanticSvc.getSymbolMetrics(join(workspace, String(args?.filePath)));
      return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
    }
    case 'get-symbol-content': {
      const content = semanticSvc.getSymbolContent(
        join(workspace, String(args?.filePath)),
        String(args?.symbolName)
      );
      return content
        ? { content: [{ type: 'text', text: content }] }
        : { content: [{ type: 'text', text: 'Symbol not found' }], isError: true };
    }
    case 'find-dead-code': {
      const dead = await semanticSvc.findDeadCode();
      return {
        content: [
          {
            type: 'text',
            text: dead.length ? JSON.stringify(dead, null, 2) : 'No dead code found!',
          },
        ],
      };
    }
    case 'analyze-impact': {
      const impact = semanticSvc.analyzeImpact(
        join(workspace, String(args?.filePath)),
        String(args?.symbolName)
      );
      return { content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }] };
    }
    case 'find-references': {
      const refs = semanticSvc.findReferences(
        join(workspace, String(args?.filePath)),
        String(args?.symbolName)
      );
      return { content: [{ type: 'text', text: JSON.stringify(refs, null, 2) }] };
    }
    case 'go-to-definition': {
      const def = semanticSvc.goToDefinition(
        join(workspace, String(args?.filePath)),
        String(args?.symbolName)
      );
      return def
        ? { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] }
        : { content: [{ type: 'text', text: 'Definition not found' }], isError: true };
    }
    case 'verify-fix': {
      const result = getAgent().verify(String(args?.testCommand || 'npm test'));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * 서버를 시작하거나 CLI 분석 모드로 진입합니다.
 */
async function main() {
  const targetDirIdx = process.argv.indexOf('--path');
  const targetDir = targetDirIdx !== -1 ? process.argv[targetDirIdx + 1] : process.cwd();

  if (process.argv.includes('--check')) {
    const sMgr = new StateManager(targetDir);
    const cfg = new ConfigService(targetDir);
    const analyzerSvc = new AnalysisService(sMgr, cfg, getSemantic());
    console.error(`Running quality check for: ${targetDir}...`);
    const report = await analyzerSvc.runAllChecks();
    console.log(formatCLITable(report));
    process.exit(report.pass ? 0 : 1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fast-Lint-MCP Server running on stdio');
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { formatReport };
