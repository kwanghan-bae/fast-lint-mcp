import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { ConfigService } from '../src/config.js';
import { SemanticService } from '../src/service/SemanticService.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Rust E2E MCP Integration', () => {
  let service: AnalysisService;
  let config: ConfigService;
  const testDir = path.join(process.cwd(), '.test-semantic-project');
  const exampleFilePath = path.join(testDir, 'example.rs');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Allow large limits to only test the specific extraction features
    config = {
      rules: {
        maxLineCount: 1500,
        maxComplexity: 150,
        coverageDirectory: 'coverage',
      },
      architectureRules: []
    } as any;
    
    // Create actual Rust file
    const rustCode = `
// 한글 주석
pub fn run_ultimate_analysis(a: i32, b: i32) -> i32 {
    if a > 0 {
        match b {
            1 => 1,
            _ => 0,
        }
    } else {
        0
    }
}

pub struct User {
    pub id: i32,
}

impl User {
    pub fn new() -> Self {
        User { id: 1 }
    }
}
`;
    fs.writeFileSync(exampleFilePath, rustCode);
    
    const stateManagerMock = {
      getLastCoverage: vi.fn().mockResolvedValue(null),
      saveCoverage: vi.fn(),
      getCacheDir: vi.fn().mockReturnValue(testDir),
    } as any;
    
    const semantic = new SemanticService();
    // Use testDir as workspace
    (semantic as any).workspacePath = testDir;
    service = new AnalysisService(stateManagerMock, config, semantic);
    (service as any).workspacePath = testDir;
  });

  afterAll(() => {
    if (fs.existsSync(exampleFilePath)) {
      fs.unlinkSync(exampleFilePath);
    }
  });

  it('TC 4.1: (E2E quality-check) - Should analyze Rust file correctly', async () => {
    // We only pass the file directly to avoid git mock issues in global project
    // Usually qualityCheck is for changed files, but we can call it on the specific file if we use a mock
    vi.spyOn(service as any, 'getChangedFiles').mockResolvedValue([exampleFilePath]);
    
    const report = await service.runAllChecks();
    
    expect(report.metadata?.filesAnalyzed).toBeGreaterThan(0);
    // There shouldn't be violations for complexity since max is 150
    const fileViolations = report.violations.filter(v => v.file === exampleFilePath);
    expect(fileViolations.length).toBe(0); // Assuming no other rules broken
  });

  it('TC 4.2: (E2E get-symbol-content) - Should extract correct body via AstCacheManager', async () => {
    // Actually the symbol content is often fetched by `SemanticService` or directly.
    // Let's test the native extract functionality used by get-symbol-metrics
    const rustProvider = (service as any).providers.find((p: any) => p.name === 'Rust');
    expect(rustProvider).toBeDefined();

    // Re-verify exact output structure
    const { extractSymbolsRustNative } = await import('../../native/index.js');
    const content = fs.readFileSync(exampleFilePath, 'utf-8');
    const symbols = extractSymbolsRustNative(exampleFilePath, content);
    
    const fnSym = symbols.find((s: any) => s.name === 'run_ultimate_analysis');
    expect(fnSym).toBeDefined();
    expect(fnSym.complexity).toBe(3); // base 1 + if 1 + match 1
    expect(fnSym.hasKoreanComment).toBe(true);

    const implMethod = symbols.find((s: any) => s.name === 'new');
    expect(implMethod).toBeDefined();
    expect(implMethod.complexity).toBe(1);
    expect(implMethod.kind).toBe('method');
  });

  it('TC 4.3: Hallucination 억제 - Should not panic on missing symbols or invalid syntax', async () => {
    const invalidFilePath = path.join(testDir, 'invalid.rs');
    fs.writeFileSync(invalidFilePath, `pub fn invalid() -> { let x = ; }`); // syntax error
    
    const { extractSymbolsRustNative } = await import('../../native/index.js');
    const content = fs.readFileSync(invalidFilePath, 'utf-8');
    
    // Should gracefully return empty array and not panic
    const symbols = extractSymbolsRustNative(invalidFilePath, content);
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBe(0);
    
    fs.unlinkSync(invalidFilePath);
  });
});