import { describe, it, expect, vi } from 'vitest';
import { main, formatReport } from '../src/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Mock services
vi.mock('../src/service/AnalysisService.js', () => {
  return {
    AnalysisService: vi.fn().mockImplementation(function() {
      return {
        runAllChecks: vi.fn().mockResolvedValue({
          pass: true,
          violations: [],
          suggestion: 'success',
        }),
      };
    }),
  };
});

vi.mock('../src/service/SemanticService.js', () => {
  return {
    SemanticService: vi.fn().mockImplementation(function() {
      return {
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
        getSymbolMetrics: vi.fn().mockReturnValue({}),
        getSymbolContent: vi.fn().mockReturnValue('content'),
        analyzeImpact: vi.fn().mockResolvedValue({}),
        findReferences: vi.fn().mockReturnValue([]),
        goToDefinition: vi.fn().mockReturnValue({}),
        findDeadCode: vi.fn().mockResolvedValue([]),
      };
    }),
  };
});

vi.mock('../src/agent/workflow.js', () => {
  return {
    AgentWorkflow: vi.fn().mockImplementation(function() {
      return {
        verify: vi.fn().mockResolvedValue({ success: true }),
      };
    }),
  };
});

// Mock MCP SDK
let requestHandlers = new Map();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: vi.fn().mockImplementation(function() {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        setRequestHandler: vi.fn().mockImplementation((schema, handler) => {
          requestHandlers.set(schema, handler);
        }),
      };
    })
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: vi.fn().mockImplementation(function() {
      return {};
    })
  };
});

describe('index.ts coverage', () => {
  it('main 함수가 서버를 올바르게 연결해야 한다', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main();
    expect(Server).toHaveBeenCalled();
    expect(StdioServerTransport).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ListToolsRequestSchema 핸들러가 도구 정의를 반환해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();
    const result = await handler();
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
  });

  it('CallToolRequestSchema 핸들러가 quality-check를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'quality-check',
        arguments: { targetPath: process.cwd() }
      }
    });
    expect(result.content[0].text).toContain('✅');
  });

  it('CallToolRequestSchema 핸들러가 guide를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'guide',
        arguments: {}
      }
    });
    expect(result.content[0].text).toContain('FAST-LINT-MCP');
  });

  it('CallToolRequestSchema 핸들러가 get-symbol-metrics를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'get-symbol-metrics',
        arguments: { filePath: 'test.ts' }
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('CallToolRequestSchema 핸들러가 get-symbol-content를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'get-symbol-content',
        arguments: { filePath: 'test.ts', symbolName: 'test' }
      }
    });
    expect(result.content[0].text).toBe('content');
  });

  it('CallToolRequestSchema 핸들러가 analyze-impact를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'analyze-impact',
        arguments: { filePath: 'test.ts', symbolName: 'test' }
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('CallToolRequestSchema 핸들러가 find-references를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'find-references',
        arguments: { symbolName: 'test' }
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('CallToolRequestSchema 핸들러가 go-to-definition를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'go-to-definition',
        arguments: { symbolName: 'test' }
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('CallToolRequestSchema 핸들러가 find-dead-code를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'find-dead-code',
        arguments: {}
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('CallToolRequestSchema 핸들러가 verify-fix를 처리해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'verify-fix',
        arguments: { testCommand: 'npm test' }
      }
    });
    expect(result.content[0].text).toBeDefined();
  });

  it('알 수 없는 도구 호출 시 오류를 반환해야 한다', async () => {
    await main();
    const handler = requestHandlers.get(CallToolRequestSchema);
    const result = await handler({
      params: {
        name: 'unknown-tool',
        arguments: {}
      }
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('알 수 없는 도구');
  });

  it('formatReport 함수가 index.ts에서 올바르게 익스포트되어야 한다', () => {
    expect(formatReport).toBeDefined();
    const report = {
      pass: true,
      violations: [],
      suggestion: 'test',
    };
    const output = formatReport(report);
    expect(output).toContain('✅');
  });
});
