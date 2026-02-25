import { describe, it, expect } from 'vitest';
import { ConfigService } from '../src/config.js';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('ConfigService Extra', () => {
    const testDir = join(process.cwd(), 'temp_config_test');

    it('architectureRules를 올바르게 반환해야 한다', () => {
        if (!existsSync(testDir)) mkdirSync(testDir);
        const configPath = join(testDir, '.fast-lintrc.json');
        const configData = {
            architectureRules: [
                { from: 'src/a/**', to: 'src/b/**', message: 'error' }
            ]
        };
        writeFileSync(configPath, JSON.stringify(configData));

        const service = new ConfigService(testDir);
        expect(service.architectureRules).toHaveLength(1);
        expect(service.architectureRules[0].from).toBe('src/a/**');

        rmSync(testDir, { recursive: true, force: true });
    });
});
