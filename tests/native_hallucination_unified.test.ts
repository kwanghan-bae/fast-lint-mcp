import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { verifyHallucinationNative } from '../native/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Native Hallucination Unified Check', () => {
  const testFilePath = path.join(process.cwd(), 'temp_hallucination_test.js');

  beforeAll(() => {
    const content = `
      const fs = require('fs');
      const axios = require('axios');
      
      function hello() {
        fs.readFileSync('test.txt'); // Builtin
        axios.get('url');           // Dependency
        nonExistentFunc();          // Hallucination
      }
    `;
    fs.writeFileSync(testFilePath, content);
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it('should distinguish between builtins, dependencies and hallucinations', () => {
    const builtins = ['fs', 'path'];
    const dependencies = ['axios', 'lodash'];
    const externalExports: string[] = [];

    const violations = verifyHallucinationNative(
      testFilePath,
      [], // local_defs
      ['fs', 'axios'], // imports
      builtins,
      dependencies
    );

    // nonExistentFunc 만 위반으로 보고되어야 함
    expect(violations.length).toBe(1);
    expect(violations[0].name).toBe('nonExistentFunc');
    expect(violations[0].line).toBe(7);
  });

  it('should handle node: prefix correctly', () => {
    const content = `
      import fs from 'node:fs';
      fs.readFileSync('test.txt');
      invalidNodeFunc();
    `;
    fs.writeFileSync(testFilePath, content);

    const violations = verifyHallucinationNative(testFilePath, [], ['node:fs'], ['fs'], []);

    expect(violations.length).toBe(1);
    expect(violations[0].name).toBe('invalidNodeFunc');
  });
});
