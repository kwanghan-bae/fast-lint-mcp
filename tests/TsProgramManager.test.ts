import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// TsProgramManager uses a static singleton — we reset it between tests via the module registry trick
// by re-importing the module. Since vitest caches modules, we need to reset the singleton manually.

describe('TsProgramManager', () => {
  const testDir = join(process.cwd(), 'temp_ts_program_manager_test');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp dir
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });

    // Reset singleton between tests by clearing the static instance via module re-evaluation
    // We achieve this by importing the module and manually nulling the private field
    const mod = await import('../src/utils/TsProgramManager.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mod.TsProgramManager as any).instance = undefined;
  });

  it('getInstance()는 항상 동일한 인스턴스를 반환해야 한다 (싱글톤)', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const a = TsProgramManager.getInstance();
    const b = TsProgramManager.getInstance();

    expect(a).toBe(b);
  });

  it('init()은 유효한 tsconfig.json이 있는 프로젝트에서 정상 동작해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    // Create a minimal TypeScript project in testDir
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        strict: true,
      },
      include: ['*.ts'],
    };
    writeFileSync(join(testDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    const mainTs = join(testDir, 'main.ts');
    writeFileSync(mainTs, 'export const x: number = 1;\n');

    const manager = TsProgramManager.getInstance();

    // Should not throw
    expect(() => manager.init(testDir, [mainTs])).not.toThrow();
  });

  it('init()은 tsconfig.json이 없는 프로젝트에서도 기본 옵션으로 동작해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const mainTs = join(testDir, 'noCfg.ts');
    writeFileSync(mainTs, 'export const y = 42;\n');

    const manager = TsProgramManager.getInstance();

    // No tsconfig.json exists in testDir — should fall back to default options
    expect(() => manager.init(testDir, [mainTs])).not.toThrow();
  });

  it('getHallucinations()는 존재하지 않는 심볼 참조를 TS2304로 탐지해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    // Write a TypeScript file that calls a non-existent function
    const badTs = join(testDir, 'bad.ts');
    writeFileSync(
      badTs,
      [
        'export function run() {',
        '  nonExistentFunction();',
        '  anotherMissingSymbol;',
        '}',
        '',
      ].join('\n')
    );

    const manager = TsProgramManager.getInstance();
    manager.init(testDir, [badTs]);

    const hallucinations = manager.getHallucinations(badTs);

    expect(hallucinations.length).toBeGreaterThanOrEqual(1);

    const names = hallucinations.map((h) => h.name);
    expect(names).toContain('nonExistentFunction');
  });

  it('getHallucinations()는 유효한 코드에서 빈 배열을 반환해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const validTs = join(testDir, 'valid.ts');
    writeFileSync(
      validTs,
      [
        'function greet(name: string): string {',
        '  return `Hello, ${name}!`;',
        '}',
        '',
        'export { greet };',
        '',
      ].join('\n')
    );

    const manager = TsProgramManager.getInstance();
    manager.init(testDir, [validTs]);

    const hallucinations = manager.getHallucinations(validTs);

    expect(hallucinations).toEqual([]);
  });

  it('getHallucinations()는 init() 호출 전에 빈 배열을 반환해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const manager = TsProgramManager.getInstance();
    // Do NOT call init — program should be null

    const result = manager.getHallucinations('/some/non/existent/file.ts');
    expect(result).toEqual([]);
  });

  it('getHallucinations()는 프로그램에 없는 파일에 대해 빈 배열을 반환해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const mainTs = join(testDir, 'main.ts');
    writeFileSync(mainTs, 'export const z = 1;\n');

    const manager = TsProgramManager.getInstance();
    manager.init(testDir, [mainTs]);

    // Ask for a file that was NOT passed as rootFiles
    const result = manager.getHallucinations('/completely/absent/file.ts');
    expect(result).toEqual([]);
  });

  it('refresh()는 예외 없이 프로그램을 갱신해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const file1 = join(testDir, 'file1.ts');
    const file2 = join(testDir, 'file2.ts');
    writeFileSync(file1, 'export const a = 1;\n');
    writeFileSync(file2, 'export const b = 2;\n');

    const manager = TsProgramManager.getInstance();
    manager.init(testDir, [file1]);

    // Should not throw when refreshing with an additional file
    expect(() => manager.refresh([file1, file2])).not.toThrow();

    // After refresh, file2 should be part of the program (no hallucinations for valid code)
    const result = manager.getHallucinations(file2);
    expect(result).toEqual([]);
  });

  it('탐지된 환각의 line 번호가 정확해야 한다', async () => {
    const { TsProgramManager } = await import('../src/utils/TsProgramManager.js');

    const tsFile = join(testDir, 'lines.ts');
    writeFileSync(
      tsFile,
      [
        '// line 1: comment',
        'export const valid = 1;',
        'export function test() {',
        '  phantomCall();', // line 4 — should be flagged
        '}',
        '',
      ].join('\n')
    );

    const manager = TsProgramManager.getInstance();
    manager.init(testDir, [tsFile]);

    const hallucinations = manager.getHallucinations(tsFile);

    const phantom = hallucinations.find((h) => h.name === 'phantomCall');
    expect(phantom).toBeDefined();
    expect(phantom?.line).toBe(4);
  });
});
