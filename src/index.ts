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
 * Model Context Protocol(MCP)을 통해 외부 AI 에이전트에게 코드 분석 및 품질 관리 도구를 제공합니다.
 */

// MCP 서버 인스턴스 초기화
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

/**
 * 의존성 주입을 위한 서비스 인스턴스들입니다.
 * 필요한 시점에 초기화되는 지연 로딩(Lazy Loading) 방식을 사용합니다.
 */
// 품질 검사 세션 간의 상태(커버리지 등)를 관리하는 매니저
let stateManager: StateManager;
// 프로젝트 설정(.fast-lintrc 등)을 로드하는 서비스
let config: ConfigService;
// 메인 분석 로직을 수행하는 서비스
let analyzer: AnalysisService;
// 시맨틱 분석(심볼 추적 등)을 담당하는 서비스
let semantic: SemanticService;
// 코드 수정을 시도하는 자율형 에이전트 워크플로우
let agent: AgentWorkflow;

/**
 * AnalysisService 인스턴스를 싱글톤 패턴으로 가져옵니다.
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
 * SemanticService 인스턴스를 싱글톤 패턴으로 가져옵니다.
 */
function getSemantic() {
  if (!semantic) {
    semantic = new SemanticService();
  }
  return semantic;
}

/**
 * AgentWorkflow 인스턴스를 싱글톤 패턴으로 가져옵니다.
 */
function getAgent() {
  if (!agent) {
    agent = new AgentWorkflow();
  }
  return agent;
}

/**
 * MCP 클라이언트(예: Claude Desktop, Gemini CLI)에게 제공할 도구 목록을 정의합니다.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'quality-check',
        /* [한글 설명] 프로젝트 전체 코드 품질을 검사하고 기준 미달 시 리팩토링 가이드를 제공합니다. */
        description:
          'Performs a comprehensive code quality check across the entire project and provides a refactoring guide if standards are not met. (High-Performance v2.1)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get-symbol-metrics',
        /* [한글 설명] 파일 내 함수/클래스 단위의 복잡도와 라인 수를 분석합니다. 수정할 심볼을 특정할 때 사용하세요. */
        description:
          'Analyzes complexity and line counts of functions/classes within a file. Use this to identify specific symbols for modification and save tokens.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Relative path to the file to analyze' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'get-symbol-content',
        /* [한글 설명] 특정 심볼(함수, 클래스)의 코드 내용만 읽습니다. 필요한 부분만 읽어 컨텍스트를 절약하세요. */
        description:
          'Reads the source code content of a specific symbol (function, class). Prevents context waste by reading only necessary parts.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'File path' },
            symbolName: {
              type: 'string',
              description: 'Target function or class name (e.g., myFunc, MyClass.method)',
            },
          },
          required: ['filePath', 'symbolName'],
        },
      },
      {
        name: 'find-dead-code',
        /* [한글 설명] 프로젝트 내에서 사용되지 않는 Export된 함수나 변수를 찾아냅니다. */
        description:
          'Identifies exported functions or variables that are not used anywhere in the project. Useful for technical debt cleanup.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'analyze-impact',
        /* [한글 설명] 심볼 수정 시 영향을 받는 파일과 테스트 케이스를 추적하여 사이드 이펙트를 방지합니다. */
        description:
          'Tracks files and test cases affected by a symbol modification to prevent side effects during refactoring.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to be modified' },
            symbolName: { type: 'string', description: 'Name of the symbol to analyze' },
          },
          required: ['filePath', 'symbolName'],
        },
      },
      {
        name: 'find-references',
        /* [한글 설명] 특정 심볼이 프로젝트 전체에서 어디서 사용되고 있는지 모든 참조를 찾습니다. */
        description: 'Finds all references of a specific symbol throughout the entire project.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'File path where the symbol is defined' },
            symbolName: { type: 'string', description: 'Symbol name to find' },
          },
          required: ['filePath', 'symbolName'],
        },
      },
      {
        name: 'go-to-definition',
        /* [한글 설명] 특정 심볼의 정의 위치(파일 및 라인)를 정확히 찾아 이동합니다. */
        description: 'Locates the exact definition (file and line number) of a specific symbol.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'File path where the symbol is called' },
            symbolName: { type: 'string', description: 'Symbol name to find the definition for' },
          },
          required: ['filePath', 'symbolName'],
        },
      },
      {
        name: 'verify-fix',
        /* [한글 설명] 수정한 코드가 정상인지 테스트 명령어를 실행하여 검증합니다. 실패 시 에러 로그를 반환합니다. */
        description:
          'Verifies if the modified code correctly passes tests. Returns error logs on failure for iterative self-healing.',
        inputSchema: {
          type: 'object',
          properties: {
            testCommand: {
              type: 'string',
              description: 'Test command to run (e.g., npm test, npx vitest run path/to/test)',
              default: 'npm test',
            },
          },
        },
      },
    ],
  };
});

/**
 * 도구 호출 요청을 처리하는 핸들러입니다.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'quality-check': {
        // 전체 품질 검사 실행 및 Markdown 포맷 리포트 반환
        const report = await getAnalyzer().runAllChecks();
        const formattedText = formatReport(report);
        return { content: [{ type: 'text', text: formattedText }] };
      }

      case 'get-symbol-metrics': {
        // 특정 파일의 심볼별 메트릭(라인수, 복잡도) 분석
        const filePath = join(process.cwd(), String(args?.filePath));
        const metrics = getSemantic().getSymbolMetrics(filePath);
        return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
      }

      case 'get-symbol-content': {
        // 특정 심볼의 코드 본문만 추출
        const filePath = join(process.cwd(), String(args?.filePath));
        const content = getSemantic().getSymbolContent(filePath, String(args?.symbolName));
        if (!content) {
          return {
            content: [
              { type: 'text', text: `Symbol '${args?.symbolName}' not found in ${args?.filePath}` },
            ],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: content }] };
      }

      case 'find-dead-code': {
        // 미사용 코드 탐지
        const deadCodes = await getSemantic().findDeadCode();
        if (deadCodes.length === 0) {
          return {
            content: [{ type: 'text', text: '미사용 코드가 발견되지 않았습니다. (Great Job!)' }],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(deadCodes, null, 2) }] };
      }

      case 'analyze-impact': {
        // 수정 시 파급 효과 분석
        const filePath = join(process.cwd(), String(args?.filePath));
        const impact = getSemantic().analyzeImpact(filePath, String(args?.symbolName));
        return { content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }] };
      }

      case 'find-references': {
        // 전체 프로젝트 내 참조 검색
        const filePath = join(process.cwd(), String(args?.filePath));
        const refs = getSemantic().findReferences(filePath, String(args?.symbolName));
        return { content: [{ type: 'text', text: JSON.stringify(refs, null, 2) }] };
      }

      case 'go-to-definition': {
        // 심볼 정의 위치 찾기
        const filePath = join(process.cwd(), String(args?.filePath));
        const def = getSemantic().goToDefinition(filePath, String(args?.symbolName));
        if (!def) {
          return {
            content: [{ type: 'text', text: `Definition for '${args?.symbolName}' not found.` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] };
      }

      case 'verify-fix': {
        // 수정 사항 검증 (테스트 실행)
        const testCommand = String(args?.testCommand || 'npm test');
        const result = getAgent().verify(testCommand);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // 예외 발생 시 에러 메시지 반환
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

/**
 * 서버를 시작합니다. CLI 실행 시 --check 플래그를 지원합니다.
 */
async function main() {
  const targetDirIdx = process.argv.indexOf('--path');
  const targetDir = targetDirIdx !== -1 ? process.argv[targetDirIdx + 1] : process.cwd();

  // CLI 직접 실행 시 품질 검사만 수행하고 종료하는 모드
  if (process.argv.includes('--check')) {
    stateManager = new StateManager(targetDir);
    config = new ConfigService(targetDir);
    analyzer = new AnalysisService(stateManager, config, getSemantic());
    
    console.error(`Running quality check for: ${targetDir}...`);
    const report = await analyzer.runAllChecks();
    console.log(formatCLITable(report)); // CLI용 테이블 포맷 사용
    process.exit(report.pass ? 0 : 1);
  }

  // MCP 표준 입출력(stdio) 전송 방식 사용
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fast-Lint-MCP Server running on stdio (High-Performance v2.1.0)');
}

// 메인 함수 실행
if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}

export { formatReport };
