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
import { SYSTEM, SECURITY, VERSION } from './constants.js';

/** MCP 서버 인스턴스 설정 및 초기화 */
const server = new Server(
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
  return [
    {
      name: 'quality-check',
      description: `Performs a comprehensive code quality check. AUTOMATICALLY includes Deep-Dive metrics for problematic symbols. ZERO CONFIG REQUIRED - works instantly with built-in Senior Defaults. (${VERSION} Evolution)`,
      inputSchema: {
        type: 'object',
        properties: {
          securityThreshold: {
            type: 'number',
            description: `Minimum entropy for secret detection (default: ${SECURITY.DEFAULT_ENTROPY_THRESHOLD})`,
          },
          maxLines: {
            type: 'number',
            description: 'Maximum lines allowed in a single logic file',
          },
          maxComplexity: {
            type: 'number',
            description: 'Maximum cyclomatic complexity allowed',
          },
          incremental: {
            type: 'boolean',
            description: 'Whether to use incremental analysis based on git changes',
          },
          forceFullScan: {
            type: 'boolean',
            description: 'Force a full project scan, ignoring incremental cache and git status',
          },
          targetPath: {
            type: 'string',
            description: 'Absolute path to the project directory to analyze (optional)',
          },
          excludePattern: {
            type: 'string',
            description:
              'Optional: Glob pattern to exclude from analysis (Standard patterns like node_modules, dist are ALREADY EXCLUDED by default)',
          },
          coveragePath: {
            type: 'string',
            description:
              'Manual path to the coverage report file (optional, e.g., "coverage/lcov.info")',
          },
        },
      },
    },
    {
      name: 'guide',
      description:
        'Provides the absolute Standard Operating Procedure (SOP) for agents. ZERO-CONFIG required.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get-symbol-metrics',
      description:
        'Analyzes complexity and line counts of functions/classes within a file. (Tip: Already included in quality-check deep-dive for problematic files)',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
      },
    },
    {
      name: 'get-symbol-content',
      description:
        'Reads the source code content of a specific symbol (function/class) within a file.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          symbolName: { type: 'string' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'analyze-impact',
      description: 'Tracks files and test cases affected by a symbol modification.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          symbolName: { type: 'string' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'find-references',
      description: 'Finds all references of a specific symbol.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          symbolName: { type: 'string' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'go-to-definition',
      description: 'Locates the exact definition of a specific symbol.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          symbolName: { type: 'string' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'find-dead-code',
      description: 'Identifies exported functions or variables that are not used.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'verify-fix',
      description: 'Verifies if the modified code correctly passes tests.',
      inputSchema: {
        type: 'object',
        properties: {
          testCommand: {
            type: 'string',
            description: "Custom test command (default: 'npm test')",
          },
        },
      },
    },
  ];
}

/** 에이전트의 도구 호출을 처리하는 핵심 로직입니다. */
async function handleToolCall(name: string, args: any) {
  const workspace = args?.targetPath || process.env.FAST_LINT_WORKSPACE || process.cwd();
  // 동적으로 설정한 workspace 경로로 프로세스의 작업 디렉토리를 변경합니다.
  process.chdir(workspace);
  const semanticSvc = getSemantic();

  switch (name) {
    case 'guide': {
      const guideText = `
# 🚨 FAST-LINT-MCP ZERO-CONFIG MANDATES (AGENT SOP v6.0) 🚨

As an AI Agent, you are bound by these Standard Operating Procedures. This tool is your **Absolute Guardrail** and **Hallucination Judge**. You are responsible for both implementation and verification.

### MANDATE 1: DIAGNOSIS FIRST (\`quality-check\`)
- **Primary Directive**: Begin every session and **every modification loop** by calling \`quality-check\`. 
- **Intelligent Auto-Chaining**: Use the **[🔍 Deep Dive]** and **[🧠 Self-Correction Guide]** sections immediately. They are designed to prevent your hallucinations.

### MANDATE 2: ZERO-TOLERANCE FOR HALLUCINATION
- **Deterministic Check**: If \`quality-check\` reports a HALLUCINATION, you have called a non-existent or unimported API.
- **Mandatory Correction**: Use \`go-to-definition\` to find actual signatures. DO NOT guess or "hallucinate" APIs.

### MANDATE 3: SURGICAL EXTRACTION & IMPACT
- **Compression**: Use \`get-symbol-content\` to minimize token usage. 
- **Zero Surprises**: Call \`analyze-impact\` before any modification. Ignorance of side effects is a critical failure.

### MANDATE 4: SELF-CORRECTION PROOF (\`verify-fix\`)
- **Ultimate Proof**: Your work is NOT complete until \`quality-check\` returns **PASS** and \`verify-fix\` confirms test success. 
- **No Excuses**: Do not claim success based on your own internal confidence. Trust only the AST Judge.

### 💡 CRITICAL AGENT PROTOCOLS:
1. **Zero-Pollution**: Do NOT create configuration files. Trust the built-in Senior Defaults.
2. **Cross-Validation**: If a path is reported as missing, use \`ls\` to verify physically.
      `.trim();
      return { content: [{ type: 'text', text: guideText }] };
    }
    case 'quality-check': {
      const report = await getAnalyzer(workspace).runAllChecks(args);
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
      return { content: [{ type: 'text', text: content || '심볼을 찾을 수 없습니다.' }] };
    }
    case 'analyze-impact': {
      const impact = await semanticSvc.analyzeImpact(
        join(workspace, String(args?.filePath)),
        String(args?.symbolName)
      );
      return { content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }] };
    }
    case 'find-references': {
      const refs = semanticSvc.findReferences(String(args?.symbolName));
      return { content: [{ type: 'text', text: JSON.stringify(refs, null, 2) }] };
    }
    case 'go-to-definition': {
      const def = semanticSvc.goToDefinition(String(args?.symbolName));
      return { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] };
    }
    case 'find-dead-code': {
      const dead = await semanticSvc.findDeadCode();
      return { content: [{ type: 'text', text: JSON.stringify(dead, null, 2) }] };
    }
    case 'verify-fix': {
      const workflow = new AgentWorkflow();
      const result = await workflow.verify(args?.testCommand || 'npm test');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

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

/** MCP 서버의 메인 실행 루프입니다. (v6.0.1) */
export async function main() {
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
