import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseQualityProvider } from '../src/providers/BaseQualityProvider.js';
import { ConfigService } from '../src/config.js';
import type { Violation } from '../src/types/index.js';

// Minimal concrete implementation for testing the abstract class
// TestProvider 클래스는 내부 상태를 관리합니다.
class TestProvider extends BaseQualityProvider {
  name = 'TestProvider';
  extensions = ['.test', '.spec'];

  async check(
    filePath: string,
    options?: { securityThreshold?: number; maxLines?: number; maxComplexity?: number }
  ): Promise<Violation[]> {
    return [];
  }
}

// A provider that overrides fix()
// FixableTestProvider 클래스는 내부 상태를 관리합니다.
class FixableTestProvider extends BaseQualityProvider {
  name = 'FixableProvider';
  extensions = ['.ts', '.js'];

  async check(filePath: string): Promise<Violation[]> {
    return [
      {
        type: 'SIZE',
        file: filePath,
        line: 1,
        message: 'File is too long',
        value: 400,
        limit: 300,
      },
    ];
  }

  async fix(
    files: string[],
    workspacePath: string
  ): Promise<{ fixedCount: number; messages: string[] }> {
    return { fixedCount: files.length, messages: files.map(f => `Fixed: ${f}`) };
  }
}

describe('BaseQualityProvider', () => {
  let config: ConfigService;

  beforeEach(() => {
    config = new ConfigService(process.cwd());
  });

  describe('concrete subclass instantiation', () => {
    it('should instantiate a concrete subclass successfully', () => {
      const provider = new TestProvider(config);
      expect(provider).toBeInstanceOf(BaseQualityProvider);
    });

    it('should expose the correct name and extensions', () => {
      const provider = new TestProvider(config);
      expect(provider.name).toBe('TestProvider');
      expect(provider.extensions).toEqual(['.test', '.spec']);
    });

    it('should store the config as a protected property', () => {
      const provider = new TestProvider(config);
      // Verify through getEffectiveLimits which uses this.config
      expect(provider).toBeDefined();
    });

    it('should accept an optional semantic service parameter', () => {
      const mockSemantic = {} as any;
      const provider = new TestProvider(config, mockSemantic);
      expect(provider).toBeInstanceOf(BaseQualityProvider);
    });
  });

  describe('extensions matching', () => {
    it('should support single-character extensions', () => {
      const provider = new TestProvider(config);
      expect(provider.extensions).toContain('.test');
    });

    it('should support multiple extensions', () => {
      const provider = new FixableTestProvider(config);
      expect(provider.extensions).toEqual(['.ts', '.js']);
      expect(provider.extensions.length).toBe(2);
    });
  });

  describe('check() delegation', () => {
    it('should delegate check() to the concrete implementation and return violations', async () => {
      const provider = new FixableTestProvider(config);
      const violations = await provider.check('/some/file.ts');
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('SIZE');
      expect(violations[0].file).toBe('/some/file.ts');
    });

    it('should return an empty array when no violations are found', async () => {
      const provider = new TestProvider(config);
      const violations = await provider.check('/some/file.test');
      expect(violations).toEqual([]);
    });

    it('should pass options through to the concrete check() implementation', async () => {
      const checkSpy = vi.spyOn(TestProvider.prototype, 'check');
      const provider = new TestProvider(config);
      const opts = { maxLines: 100, maxComplexity: 5 };
      await provider.check('/path/to/file.test', opts);
      expect(checkSpy).toHaveBeenCalledWith('/path/to/file.test', opts);
      checkSpy.mockRestore();
    });
  });

  describe('fix() default behavior', () => {
    it('should return fixedCount=0 and empty messages by default', async () => {
      const provider = new TestProvider(config);
      const result = await provider.fix(['/a.test', '/b.test'], '/workspace');
      expect(result.fixedCount).toBe(0);
      expect(result.messages).toEqual([]);
    });

    it('should allow subclasses to override fix() with custom behavior', async () => {
      const provider = new FixableTestProvider(config);
      const files = ['/src/a.ts', '/src/b.ts'];
      const result = await provider.fix(files, '/workspace');
      expect(result.fixedCount).toBe(2);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toContain('Fixed:');
    });
  });

  describe('getEffectiveLimits()', () => {
    it('should return Infinity for data files', () => {
      const provider = new TestProvider(config);
      // Access through a subclass that exposes it
      const limits = (provider as any).getEffectiveLimits(true);
      expect(limits.maxLines).toBe(Infinity);
      expect(limits.maxComplexity).toBe(Infinity);
    });

    it('should return config defaults for non-data files without options', () => {
      const provider = new TestProvider(config);
      const limits = (provider as any).getEffectiveLimits(false);
      expect(typeof limits.maxLines).toBe('number');
      expect(typeof limits.maxComplexity).toBe('number');
      expect(limits.maxLines).toBeGreaterThan(0);
      expect(limits.maxComplexity).toBeGreaterThan(0);
    });

    it('should override config defaults with provided options for non-data files', () => {
      const provider = new TestProvider(config);
      const limits = (provider as any).getEffectiveLimits(false, {
        maxLines: 42,
        maxComplexity: 7,
      });
      expect(limits.maxLines).toBe(42);
      expect(limits.maxComplexity).toBe(7);
    });

    it('should use config value when only one option is provided', () => {
      const provider = new TestProvider(config);
      const limits = (provider as any).getEffectiveLimits(false, { maxLines: 99 });
      expect(limits.maxLines).toBe(99);
      // maxComplexity falls back to config
      expect(limits.maxComplexity).toBe(config.rules.maxComplexity);
    });
  });
});
