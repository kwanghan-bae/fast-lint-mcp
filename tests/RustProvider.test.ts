import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { RustProvider } from '../src/providers/RustProvider.js';
import { ConfigService } from '../src/config.js';
import { AnalysisService } from '../src/service/AnalysisService.js';
import { SemanticService } from '../src/service/SemanticService.js';
import * as fs from 'fs';
import * as path from 'path';

// native module mock
vi.mock('../native/index.js', () => ({
  extractSymbolsRustNative: vi.fn((filePath: string, content: string) => {
    // Mock NAPI response
    if (content.includes('complex')) {
      return [
        {
          name: 'complex_function',
          line: 2,
          endLine: 200,
          isExported: true,
          kind: 'function',
          complexity: 25,
          lines: 199,
          parameterCount: 6,
          hasKoreanComment: false
        }
      ];
    }
    return [
      {
        name: 'simple_function',
        line: 2,
        endLine: 5,
        isExported: true,
        kind: 'function',
        complexity: 1,
        lines: 4,
        parameterCount: 0,
        hasKoreanComment: true
      }
    ];
  })
}));

describe('RustProvider', () => {
  let provider: RustProvider;
  let config: any;
  const testDir = path.join(process.cwd(), '.test-semantic-project');
  const complexFilePath = path.join(testDir, 'complex.rs');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    config = {
      rules: {
        maxLineCount: 150,
        maxComplexity: 15,
      },
      architectureRules: []
    };
    provider = new RustProvider(config);
  });

  afterAll(() => {
    if (fs.existsSync(complexFilePath)) {
      fs.unlinkSync(complexFilePath);
    }
  });

  it('TC 3.1: ProviderRegistration - AnalysisService supports .rs extension', () => {
    const semantic = new SemanticService(process.cwd());
    const service = new AnalysisService(process.cwd(), config, semantic);
    
    const providers = (service as any).providers;
    const hasRustProvider = providers.some((p: any) => p.name === 'Rust');
    expect(hasRustProvider).toBe(true);

    const extensions = providers.flatMap((p: any) => p.extensions);
    expect(extensions).toContain('.rs');
  });

  it('TC 3.2: Violation Generation - Should return COMPLEXITY and SIZE violations for complex file', async () => {
    const content = Array(200).fill('let x = 1;').join('\n') + '\ncomplex';
    fs.writeFileSync(complexFilePath, content);
    
    const violations = await provider.check(complexFilePath, {
      maxLines: 150,
      maxComplexity: 15
    });

    const sizeViolation = violations.find(v => v.type === 'SIZE');
    expect(sizeViolation).toBeDefined();
    expect(sizeViolation?.value).toBeGreaterThan(150);

    const compViolation = violations.find(v => v.type === 'COMPLEXITY');
    expect(compViolation).toBeDefined();
    expect(compViolation?.value).toBe(25);

    const readabilityViolationParams = violations.find(v => v.type === 'READABILITY' && v.message.includes('파라미터'));
    expect(readabilityViolationParams).toBeDefined();
    
    const readabilityViolationLines = violations.find(v => v.type === 'READABILITY' && v.message.includes('너무 깁니다'));
    expect(readabilityViolationLines).toBeDefined();
  });

  it('TC 3.3: Position Accuracy - Violation line should match NAPI response exactly', async () => {
    const content = Array(200).fill('let x = 1;').join('\n') + '\ncomplex';
    fs.writeFileSync(complexFilePath, content);
    
    const violations = await provider.check(complexFilePath);
    
    const readabilityViolation = violations.find(v => v.type === 'READABILITY' && v.line === 2);
    expect(readabilityViolation).toBeDefined();
    expect(readabilityViolation?.line).toBe(2);
  });
});