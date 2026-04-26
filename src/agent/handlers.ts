import { join } from 'path';
import { AgentWorkflow } from './workflow.js';
import { formatReport } from '../utils/AnalysisUtils.js';
import type { ToolHandler, ToolResponse } from '../types/index.js';

/** 도구별 실행 로직을 관리하는 전략 객체 */
export const toolHandlers: Record<string, ToolHandler> = {
  'guide': async () => {
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
  },
  'quality-check': async (args, _, workspace, getAnalyzer) => {
    const report = await getAnalyzer(workspace).runAllChecks(args);
    return { content: [{ type: 'text', text: formatReport(report) }] };
  },
  'get-symbol-metrics': async (args, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const metrics = semanticSvc.getSymbolMetrics(join(workspace, String(args.filePath ?? '')));
    return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
  },
  'get-symbol-content': async (args, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const content = await semanticSvc.getSymbolContent(
      join(workspace, String(args.filePath ?? '')),
      String(args.symbolName ?? '')
    );
    return { content: [{ type: 'text', text: content || '심볼을 찾을 수 없습니다.' }] };
  },
  'analyze-impact': async (args, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const impact = await semanticSvc.analyzeImpact(
      join(workspace, String(args.filePath ?? '')),
      String(args.symbolName ?? '')
    );
    return { content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }] };
  },
  'find-references': async (args, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const refs = semanticSvc.findReferences(String(args.symbolName ?? ''));
    return { content: [{ type: 'text', text: JSON.stringify(refs, null, 2) }] };
  },
  'go-to-definition': async (args, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const def = semanticSvc.goToDefinition(String(args.symbolName ?? ''));
    return { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] };
  },
  'find-dead-code': async (_, semanticSvc, workspace) => {
    await semanticSvc.ensureInitialized(false, workspace);
    const dead = await semanticSvc.findDeadCode();
    return { content: [{ type: 'text', text: JSON.stringify(dead, null, 2) }] };
  },
  'verify-fix': async (args) => {
    const workflow = new AgentWorkflow();
    const result = await workflow.verify(String(args.testCommand ?? 'npm test'));
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
};
