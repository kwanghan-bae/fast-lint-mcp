import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VERSION, SYSTEM, READABILITY, COVERAGE, PERFORMANCE } from '../src/constants.js';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

describe('constants.ts', () => {
  describe('VERSION', () => {
    it('should be a string', () => {
      expect(typeof VERSION).toBe('string');
    });

    it('should start with "v"', () => {
      expect(VERSION.startsWith('v')).toBe(true);
    });

    it('should match the version from package.json', () => {
      expect(VERSION).toBe(`v${pkg.version}`);
    });
  });

  describe('SYSTEM', () => {
    it('should exist and be an object', () => {
      expect(SYSTEM).toBeDefined();
      expect(typeof SYSTEM).toBe('object');
    });

    it('should have VERSION_PREFIX as a string', () => {
      expect(typeof SYSTEM.VERSION_PREFIX).toBe('string');
      expect(SYSTEM.VERSION_PREFIX).toBe('v');
    });

    it('should have CONCURRENCY_MARGIN as a positive number', () => {
      expect(typeof SYSTEM.CONCURRENCY_MARGIN).toBe('number');
      expect(SYSTEM.CONCURRENCY_MARGIN).toBeGreaterThan(0);
    });

    it('should have DEFAULT_IGNORE_PATTERNS as a non-empty array', () => {
      expect(Array.isArray(SYSTEM.DEFAULT_IGNORE_PATTERNS)).toBe(true);
      expect(SYSTEM.DEFAULT_IGNORE_PATTERNS.length).toBeGreaterThan(0);
    });

    it('DEFAULT_IGNORE_PATTERNS should include node_modules', () => {
      const hasNodeModules = SYSTEM.DEFAULT_IGNORE_PATTERNS.some(p =>
        p.includes('node_modules')
      );
      expect(hasNodeModules).toBe(true);
    });

    it('DEFAULT_IGNORE_PATTERNS entries should be strings', () => {
      for (const pattern of SYSTEM.DEFAULT_IGNORE_PATTERNS) {
        expect(typeof pattern).toBe('string');
      }
    });

    it('DEFAULT_IGNORE_PATTERNS should include common build directories', () => {
      const patterns = SYSTEM.DEFAULT_IGNORE_PATTERNS;
      expect(patterns.some(p => p.includes('dist'))).toBe(true);
      expect(patterns.some(p => p.includes('build'))).toBe(true);
    });

    it('DEFAULT_IGNORE_PATTERNS should include .git', () => {
      expect(SYSTEM.DEFAULT_IGNORE_PATTERNS.some(p => p.includes('.git'))).toBe(true);
    });
  });

  describe('READABILITY', () => {
    it('should exist and be an object', () => {
      expect(READABILITY).toBeDefined();
      expect(typeof READABILITY).toBe('object');
    });

    it('should have numeric constant values', () => {
      expect(typeof READABILITY.KOREAN_COMMENT_SEARCH_DEPTH).toBe('number');
      expect(typeof READABILITY.MIN_FUNCTION_LINES_FOR_COMMENT).toBe('number');
      expect(typeof READABILITY.MAX_FUNCTION_LINES).toBe('number');
      expect(typeof READABILITY.MAX_PARAMETER_COUNT).toBe('number');
      expect(typeof READABILITY.DENSITY_THRESHOLD_MEDIUM).toBe('number');
      expect(typeof READABILITY.DENSITY_THRESHOLD_HIGH).toBe('number');
      expect(typeof READABILITY.NOISE_SYMBOL_LENGTH_LIMIT).toBe('number');
    });

    it('should have sensible positive values', () => {
      expect(READABILITY.KOREAN_COMMENT_SEARCH_DEPTH).toBeGreaterThan(0);
      expect(READABILITY.MAX_FUNCTION_LINES).toBeGreaterThan(0);
      expect(READABILITY.MAX_PARAMETER_COUNT).toBeGreaterThan(0);
      expect(READABILITY.DENSITY_THRESHOLD_HIGH).toBeGreaterThan(
        READABILITY.DENSITY_THRESHOLD_MEDIUM
      );
    });
  });

  describe('COVERAGE', () => {
    it('should exist and be an object', () => {
      expect(COVERAGE).toBeDefined();
      expect(typeof COVERAGE).toBe('object');
    });

    it('should have numeric constant values', () => {
      expect(typeof COVERAGE.STALE_BUFFER_MS).toBe('number');
      expect(typeof COVERAGE.RECURSIVE_SEARCH_DEPTH).toBe('number');
      expect(typeof COVERAGE.TOP_VULNERABLE_FILES_COUNT).toBe('number');
      expect(typeof COVERAGE.INSIGHT_FILES_COUNT).toBe('number');
    });

    it('STALE_BUFFER_MS should represent a reasonable duration', () => {
      // Should be greater than 0 and a multiple of typical time units
      expect(COVERAGE.STALE_BUFFER_MS).toBeGreaterThan(0);
      // 15 minutes = 900000ms per the comment
      expect(COVERAGE.STALE_BUFFER_MS).toBe(900000);
    });

    it('RECURSIVE_SEARCH_DEPTH should be a positive integer', () => {
      expect(COVERAGE.RECURSIVE_SEARCH_DEPTH).toBeGreaterThan(0);
      expect(Number.isInteger(COVERAGE.RECURSIVE_SEARCH_DEPTH)).toBe(true);
    });
  });

  describe('PERFORMANCE', () => {
    it('should exist and be an object', () => {
      expect(PERFORMANCE).toBeDefined();
      expect(typeof PERFORMANCE).toBe('object');
    });

    it('EVENT_LOOP_YIELD_INTERVAL should be a positive number', () => {
      expect(typeof PERFORMANCE.EVENT_LOOP_YIELD_INTERVAL).toBe('number');
      expect(PERFORMANCE.EVENT_LOOP_YIELD_INTERVAL).toBeGreaterThan(0);
    });
  });
});
