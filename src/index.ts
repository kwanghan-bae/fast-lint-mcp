import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AnalysisService } from './service/AnalysisService.js';
import { StateManager } from './state.js';
import { ConfigService } from './config.js';
import { SemanticService } from './service/SemanticService.js';
import { AgentWorkflow } from './agent/workflow.js';
import { formatReport, formatCLITable } from './utils/AnalysisUtils.js';
import { join, dirname } from 'path';
import { existsSync, statSync, readFileSync } from 'fs';
import { SYSTEM, VERSION } from './constants.js';

/** MCP 서버 인스턴스 생성 함수 */
function createServer() {
  return new Server(
    {
      name: 'fast-lint-mcp',
      version: VERSION.replace('v', ''),
    },
    {
      capabilities: {
        tools: {}, // 도구 기능 활성화
      },
    }
  );
}

let server: Server;

/** MCP 서버 인스턴스 설정 및 초기화 */
function initializeServer() {
  if (server) return server;
  
  server = createServer();

  // 1. 도구 목록 조회 핸들러
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(),
  }));

  // 2. 도구 실행 핸들러
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(request.params.name, request.params.arguments);
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
  
  return server;
}

import { toolHandlers } from './agent/handlers.js';

/** 리소스/도구 인스턴스 캐싱을 위한 내부 변수 */
let analyzerSvc: AnalysisService | null = null;
let semanticSvc: SemanticService | null = null;

/** 지연 로딩을 통해 AnalysisService 인스턴스를 가져옵니다. */
function getAnalyzer(workspacePath: string) {
  if (!analyzerSvc) {
    const state = new StateManager(workspacePath);
    const config = new ConfigService(workspacePath);
    analyzerSvc = new AnalysisService(state, config, getSemantic());
  }
  return analyzerSvc;
}

/** 지연 로딩을 통해 SemanticService 인스턴스를 가져옵니다. */
function getSemantic() {
  if (!semanticSvc) {
    semanticSvc = new SemanticService();
  }
  return semanticSvc;
}

/** 에이전트에게 제공할 MCP 도구 목록을 정의합니다. */
function getToolDefinitions() {
  const commonSchema = {
    type: 'object',
    properties: {
      filePath: { type: 'string' },
      symbolName: { type: 'string' },
    },
    required: ['filePath', 'symbolName'],
  };

  return [
    {
      name: 'quality-check',
      description: `Performs a comprehensive code quality check. AUTOMATICALLY includes Deep-Dive metrics for problematic symbols. ZERO CONFIG REQUIRED - works instantly with built-in Senior Defaults. (${VERSION} Evolution)`,
      inputSchema: {
        type: 'object',
        properties: {
          maxLines: { type: 'number' },
          maxComplexity: { type: 'number' },
          incremental: { type: 'boolean' },
          forceFullScan: { type: 'boolean' },
          forceRefresh: { type: 'boolean' },
          targetPath: { type: 'string' },
          excludePattern: { type: 'string' },
          coveragePath: { type: 'string' },
        },
      },
    },
    { name: 'guide', description: 'Provides the SOP for agents.', inputSchema: { type: 'object', properties: {} } },
    {
      name: 'get-symbol-metrics',
      description: 'Analyzes complexity and line counts.',
      inputSchema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] },
    },
    { name: 'get-symbol-content', description: 'Reads symbol source code.', inputSchema: commonSchema },
    { name: 'analyze-impact', description: 'Tracks affected files and tests.', inputSchema: commonSchema },
    { name: 'find-references', description: 'Finds all references.', inputSchema: { type: 'object', properties: { symbolName: { type: 'string' } }, required: ['symbolName'] } },
    { name: 'go-to-definition', description: 'Locates exact definition.', inputSchema: { type: 'object', properties: { symbolName: { type: 'string' } }, required: ['symbolName'] } },
    { name: 'find-dead-code', description: 'Identifies unused exports.', inputSchema: { type: 'object', properties: {} } },
    { name: 'verify-fix', description: 'Verifies if code passes tests.', inputSchema: { type: 'object', properties: { testCommand: { type: 'string' } } } },
  ];
}

/** 에이전트의 도구 호출을 처리하는 핵심 로직입니다. */
async function handleToolCall(name: string, args: any) {
  const workspace = args?.targetPath || process.env.FAST_LINT_WORKSPACE || process.cwd();
  // 동적으로 설정한 workspace 경로로 프로세스의 작업 디렉토리를 변경합니다.
  process.chdir(workspace);
  const semanticSvc = getSemantic();

  const handler = toolHandlers[name];
  if (handler) {
    return await handler(args, semanticSvc, workspace, getAnalyzer);
  }

  throw new Error(`알 수 없는 도구: ${name}`);
}

/** MCP 서버의 메인 실행 루프입니다. (v6.0.1) */
export async function main() {
  const server = initializeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fast-Lint-MCP Server running on stdio');
}

// 직접 실행 시에만 main 호출 (CLI 진입점과 분리)
if (
  process.argv[1] &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('src/index.ts'))
) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { formatReport };
