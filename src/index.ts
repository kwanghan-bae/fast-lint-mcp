import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { QualityDB } from "./db.js";
import { ConfigService } from "./config.js";
import { AnalysisService } from "./service/AnalysisService.js";

const server = new Server(
  {
    name: "fast-lint-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 의존성 초기화 (DI)
const db = new QualityDB();
const config = new ConfigService();
const analyzer = new AnalysisService(db, config);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "quality-check",
        description: "프로젝트 전체 코드 품질을 검사하고 기준 미달 시 리팩토링 가이드를 제공합니다.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "quality-check") {
    throw new Error("Unknown tool");
  }

  try {
    const report = await analyzer.runAllChecks();
    
    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
    };
  } catch (error) {
    console.error("Error during quality check:", error);
    return {
      content: [{ type: "text", text: `분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fast-Lint-MCP Server running on stdio (Scalable v1.1.0)");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
