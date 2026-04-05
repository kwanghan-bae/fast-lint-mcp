import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock native module before importing anything that depends on it
vi.mock('../native/index.js', () => ({}));

// Mock child_process to prevent execSync from running real commands
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { toolHandlers } from '../src/agent/handlers.js';
import { execSync } from 'child_process';

const WORKSPACE = '/tmp/test-workspace';

// ── Mock SemanticService ──────────────────────────────────────────────────────
// createMockSemanticService 함수는 내부 로직을 처리합니다.
function createMockSemanticService() {
  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getSymbolMetrics: vi.fn().mockReturnValue([]),
    getSymbolContent: vi.fn().mockReturnValue('function foo() {}'),
    analyzeImpact: vi.fn().mockResolvedValue({
      symbolName: 'foo',
      affectedFiles: [],
      referencingFiles: [],
      affectedTests: [],
    }),
    findReferences: vi.fn().mockReturnValue([]),
    goToDefinition: vi.fn().mockReturnValue(null),
    findDeadCode: vi.fn().mockResolvedValue([]),
  };
}

// ── Mock AnalysisService ──────────────────────────────────────────────────────
// createMockAnalysisService 함수는 내부 로직을 처리합니다.
function createMockAnalysisService() {
  return {
    runAllChecks: vi.fn().mockResolvedValue({
      pass: true,
      violations: [],
      metadata: {
        version: 'v6.0',
        timestamp: new Date().toISOString(),
        analysisMode: 'full',
        filesAnalyzed: 0,
      },
    }),
  };
}

// ── Helper: invoke a handler with defaults ────────────────────────────────────
// invokeHandler 함수는 내부 로직을 처리합니다.
function invokeHandler(
  name: string,
  args: Record<string, unknown>,
  semanticSvc: ReturnType<typeof createMockSemanticService>,
  mockAnalysisSvc: ReturnType<typeof createMockAnalysisService>
) {
  const mockGetAnalyzer = vi.fn().mockReturnValue(mockAnalysisSvc);
  return {
    result: toolHandlers[name](args as any, semanticSvc as any, WORKSPACE, mockGetAnalyzer as any),
    mockGetAnalyzer,
  };
}

// =============================================================================
describe('toolHandlers', () => {
  let semanticSvc: ReturnType<typeof createMockSemanticService>;
  let analysisSvc: ReturnType<typeof createMockAnalysisService>;

  beforeEach(() => {
    semanticSvc = createMockSemanticService();
    analysisSvc = createMockAnalysisService();
    vi.clearAllMocks();
  });

  // ── guide ───────────────────────────────────────────────────────────────────
  describe('guide', () => {
    it('returns a ToolResponse with SOP text', async () => {
      const mockGetAnalyzer = vi.fn();
      const response = await toolHandlers['guide']({}, semanticSvc as any, WORKSPACE, mockGetAnalyzer as any);

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('FAST-LINT-MCP');
      expect(response.content[0].text).toContain('SOP');
    });

    it('SOP text includes all four mandates', async () => {
      const mockGetAnalyzer = vi.fn();
      const response = await toolHandlers['guide']({}, semanticSvc as any, WORKSPACE, mockGetAnalyzer as any);
      const text = response.content[0].text;

      expect(text).toContain('MANDATE 1');
      expect(text).toContain('MANDATE 2');
      expect(text).toContain('MANDATE 3');
      expect(text).toContain('MANDATE 4');
    });
  });

  // ── quality-check ───────────────────────────────────────────────────────────
  describe('quality-check', () => {
    it('calls getAnalyzer with the workspace and runAllChecks with args', async () => {
      const args = { maxLines: 300 };
      const { result, mockGetAnalyzer } = invokeHandler('quality-check', args, semanticSvc, analysisSvc);
      await result;

      expect(mockGetAnalyzer).toHaveBeenCalledWith(WORKSPACE);
      expect(analysisSvc.runAllChecks).toHaveBeenCalledWith(args);
    });

    it('returns a ToolResponse with formatted report text', async () => {
      const { result } = invokeHandler('quality-check', {}, semanticSvc, analysisSvc);
      const response = await result;

      expect(response.content[0].type).toBe('text');
      expect(typeof response.content[0].text).toBe('string');
    });
  });

  // ── get-symbol-metrics ──────────────────────────────────────────────────────
  describe('get-symbol-metrics', () => {
    it('calls ensureInitialized and getSymbolMetrics', async () => {
      const args = { filePath: 'src/foo.ts' };
      const { result } = invokeHandler('get-symbol-metrics', args, semanticSvc, analysisSvc);
      const response = await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.getSymbolMetrics).toHaveBeenCalledWith(
        expect.stringContaining('foo.ts')
      );
      expect(response.content[0].type).toBe('text');
    });

    it('returns JSON-stringified metrics', async () => {
      semanticSvc.getSymbolMetrics.mockReturnValue([{ name: 'bar', kind: 'function', lineCount: 5, complexity: 1, startLine: 1, endLine: 5 }]);
      const { result } = invokeHandler('get-symbol-metrics', { filePath: 'src/bar.ts' }, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe('bar');
    });
  });

  // ── get-symbol-content ──────────────────────────────────────────────────────
  describe('get-symbol-content', () => {
    it('calls ensureInitialized and getSymbolContent with joined path and symbol name', async () => {
      const args = { filePath: 'src/foo.ts', symbolName: 'myFunc' };
      const { result } = invokeHandler('get-symbol-content', args, semanticSvc, analysisSvc);
      await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.getSymbolContent).toHaveBeenCalledWith(
        expect.stringContaining('foo.ts'),
        'myFunc'
      );
    });

    it('returns fallback text when symbol not found', async () => {
      semanticSvc.getSymbolContent.mockReturnValue(null);
      const { result } = invokeHandler('get-symbol-content', { filePath: 'src/x.ts', symbolName: 'missing' }, semanticSvc, analysisSvc);
      const response = await result;

      expect(response.content[0].text).toContain('찾을 수 없습니다');
    });

    it('returns symbol content when found', async () => {
      semanticSvc.getSymbolContent.mockReturnValue('export function hello() { return 1; }');
      const { result } = invokeHandler('get-symbol-content', { filePath: 'src/x.ts', symbolName: 'hello' }, semanticSvc, analysisSvc);
      const response = await result;

      expect(response.content[0].text).toContain('hello');
    });
  });

  // ── analyze-impact ──────────────────────────────────────────────────────────
  describe('analyze-impact', () => {
    it('calls ensureInitialized and analyzeImpact with joined path and symbol name', async () => {
      const args = { filePath: 'src/foo.ts', symbolName: 'doWork' };
      const { result } = invokeHandler('analyze-impact', args, semanticSvc, analysisSvc);
      await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.analyzeImpact).toHaveBeenCalledWith(
        expect.stringContaining('foo.ts'),
        'doWork'
      );
    });

    it('returns JSON-stringified impact analysis', async () => {
      const mockImpact = { symbolName: 'doWork', affectedFiles: ['a.ts'], referencingFiles: [], affectedTests: [] };
      semanticSvc.analyzeImpact.mockResolvedValue(mockImpact);
      const { result } = invokeHandler('analyze-impact', { filePath: 'src/foo.ts', symbolName: 'doWork' }, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.symbolName).toBe('doWork');
      expect(parsed.affectedFiles).toContain('a.ts');
    });
  });

  // ── find-references ─────────────────────────────────────────────────────────
  describe('find-references', () => {
    it('calls ensureInitialized and findReferences with symbol name', async () => {
      const args = { symbolName: 'mySymbol' };
      const { result } = invokeHandler('find-references', args, semanticSvc, analysisSvc);
      await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.findReferences).toHaveBeenCalledWith('mySymbol');
    });

    it('returns JSON-stringified references array', async () => {
      semanticSvc.findReferences.mockReturnValue([{ file: 'a.ts', line: 10 }]);
      const { result } = invokeHandler('find-references', { symbolName: 'sym' }, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].file).toBe('a.ts');
    });
  });

  // ── go-to-definition ────────────────────────────────────────────────────────
  describe('go-to-definition', () => {
    it('calls ensureInitialized and goToDefinition with symbol name', async () => {
      const args = { symbolName: 'MyClass' };
      const { result } = invokeHandler('go-to-definition', args, semanticSvc, analysisSvc);
      await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.goToDefinition).toHaveBeenCalledWith('MyClass');
    });

    it('returns JSON-stringified definition location', async () => {
      semanticSvc.goToDefinition.mockReturnValue({ file: 'src/MyClass.ts', line: 1 });
      const { result } = invokeHandler('go-to-definition', { symbolName: 'MyClass' }, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/MyClass.ts');
      expect(parsed.line).toBe(1);
    });
  });

  // ── find-dead-code ──────────────────────────────────────────────────────────
  describe('find-dead-code', () => {
    it('calls ensureInitialized and findDeadCode', async () => {
      const { result } = invokeHandler('find-dead-code', {}, semanticSvc, analysisSvc);
      await result;

      expect(semanticSvc.ensureInitialized).toHaveBeenCalledWith(false, WORKSPACE);
      expect(semanticSvc.findDeadCode).toHaveBeenCalled();
    });

    it('returns JSON-stringified dead code list', async () => {
      semanticSvc.findDeadCode.mockResolvedValue([{ name: 'unusedFunc', file: 'src/old.ts', line: 5 }]);
      const { result } = invokeHandler('find-dead-code', {}, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe('unusedFunc');
    });
  });

  // ── verify-fix ──────────────────────────────────────────────────────────────
  describe('verify-fix', () => {
    it('calls execSync when verify-fix is invoked with a valid test command', async () => {
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockReturnValue(Buffer.from(''));

      const { result } = invokeHandler('verify-fix', { testCommand: 'npm test' }, semanticSvc, analysisSvc);
      const response = await result;

      expect(mockedExecSync).toHaveBeenCalled();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('uses "npm test" as default when testCommand is not provided', async () => {
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockReturnValue(Buffer.from(''));

      const { result } = invokeHandler('verify-fix', {}, semanticSvc, analysisSvc);
      const response = await result;

      expect(mockedExecSync).toHaveBeenCalled();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('returns success:false when execSync throws', async () => {
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockImplementation(() => {
        const err = new Error('tests failed') as any;
        err.stderr = Buffer.from('tests failed output');
        throw err;
      });

      const { result } = invokeHandler('verify-fix', { testCommand: 'npm test' }, semanticSvc, analysisSvc);
      const response = await result;

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  // ── unknown tool ────────────────────────────────────────────────────────────
  describe('unknown tool', () => {
    it('toolHandlers["unknown-tool"] is undefined', () => {
      expect(toolHandlers['unknown-tool']).toBeUndefined();
      expect(toolHandlers['nonexistent']).toBeUndefined();
    });
  });
});
