import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '../src/config.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('ConfigService', () => {
  const testDir = join(process.cwd(), 'temp_config_test');

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('설정 파일이 없으면 기본 설정을 로드해야 한다', () => {
    const config = new ConfigService(testDir);
    expect(config.rules.maxLineCount).toBe(300);
    expect(config.rules.minCoverage).toBe(80);
    expect(config.incremental).toBe(true);
  });

  it('.fast-lintrc.json 파일에서 설정을 로드해야 한다', () => {
    const userConfig = {
      rules: { maxLineCount: 500, minCoverage: 90 },
      incremental: false,
    };
    writeFileSync(join(testDir, '.fast-lintrc.json'), JSON.stringify(userConfig));

    const config = new ConfigService(testDir);
    expect(config.rules.maxLineCount).toBe(500);
    expect(config.rules.minCoverage).toBe(90);
    expect(config.incremental).toBe(false);
  });

  it('package.json의 fastLint 필드에서 설정을 로드해야 한다', () => {
    const pkg = {
      fastLint: {
        rules: { techDebtLimit: 50 },
        exclude: ['src/ignored/**'],
      },
    };
    writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));

    const config = new ConfigService(testDir);
    expect(config.rules.techDebtLimit).toBe(50);
    expect(config.exclude).toContain('src/ignored/**');
  });

  it('잘못된 형식의 설정 파일은 무시하고 기본값을 사용해야 한다', () => {
    writeFileSync(join(testDir, '.fast-lintrc.json'), 'invalid json');
    const config = new ConfigService(testDir);
    expect(config.rules.maxLineCount).toBe(300);
  });
});
