import { describe, it, expect, afterEach } from 'vitest';
import { ConfigService } from '../src/config.js';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('ConfigService Extra', () => {
    const testDir = join(process.cwd(), `temp_cfg_extra_${Math.random().toString(36).substring(7)}`);

    afterEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it('architectureRules를 올바르게 반환해야 한다', () => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        const configPath = join(testDir, '.fast-lintrc.json');
        const configData = {
            architectureRules: [
                { from: 'src/a/**', to: 'src/b/**', message: 'Violation' }
            ]
        };
        writeFileSync(configPath, JSON.stringify(configData));

        const config = new ConfigService(testDir);
        const rules = config.architectureRules;
        expect(rules).toHaveLength(1);
        expect(rules[0].from).toBe('src/a/**');
    });
});
