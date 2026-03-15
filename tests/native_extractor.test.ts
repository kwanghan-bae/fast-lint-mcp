import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractImportsNative } from '../native/index.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Native Import Extractor (Commit 3.1)', () => {
  const testDir = join(process.cwd(), 'temp_native_extract');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('다양한 Import/Export 구문을 정확히 추출해야 한다', () => {
    const filePath = join(testDir, 'source.ts');
    const code = 
      'import defaultMember from "module-name";\n' +
      'import * as name from "module-name-2";\n' +
      'import { member } from "./relative-path";\n' +
      'import { member as alias } from "../parent-path";\n' +
      '\n' +
      'export { a, b } from "./export-source";\n' +
      '\n' +
      'async function load() {\n' +
      '  const mod = await import("./dynamic-import");\n' +
      '}\n';
    
    writeFileSync(filePath, code);

    const results = extractImportsNative([filePath]);
    expect(results.length).toBe(1);
    
    const imports = results[0].imports;
    expect(imports).toContain('module-name');
    expect(imports).toContain('module-name-2');
    expect(imports).toContain('./relative-path');
    expect(imports).toContain('../parent-path');
    expect(imports).toContain('./export-source');
    expect(imports).toContain('./dynamic-import');
  });
});
