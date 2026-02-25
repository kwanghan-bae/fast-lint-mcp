import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkArchitecture } from '../src/analysis/import-check.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Architecture Guardrail', () => {
    const testDir = join(process.cwd(), 'temp_arch_test');

    beforeEach(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        if (!existsSync(join(testDir, 'src/domain'))) mkdirSync(join(testDir, 'src/domain'), { recursive: true });
        if (!existsSync(join(testDir, 'src/infrastructure'))) mkdirSync(join(testDir, 'src/infrastructure'), { recursive: true });
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('도메인 레이어에서 인프라 레이어를 참조하면 위반으로 탐지해야 한다', async () => {
        const domainFile = join(testDir, 'src/domain/UserService.ts');
        const infraFile = join(testDir, 'src/infrastructure/UserRepository.ts');
        
        writeFileSync(infraFile, 'export class UserRepository {}');
        writeFileSync(domainFile, `import { UserRepository } from '../infrastructure/UserRepository';
export class UserService {}`);

        const rules = [
            {
                from: 'src/domain/**',
                to: 'src/infrastructure/**',
                message: '도메인 레이어는 인프라 레이어에 의존할 수 없습니다.'
            }
        ];

        const violations = await checkArchitecture(domainFile, rules, testDir);
        expect(violations).toHaveLength(1);
        expect(violations[0].id).toBe('ARCHITECTURE_VIOLATION');
        expect(violations[0].message).toContain('도메인 레이어는 인프라 레이어에 의존할 수 없습니다.');
    });

    it('규칙에 해당하지 않는 경로는 통과해야 한다', async () => {
        const infraFile = join(testDir, 'src/infrastructure/UserRepository.ts');
        const domainFile = join(testDir, 'src/domain/UserService.ts');
        
        writeFileSync(domainFile, 'export class UserService {}');
        writeFileSync(infraFile, `import { UserService } from '../domain/UserService';
export class UserRepository {}`);

        const rules = [
            {
                from: 'src/domain/**',
                to: 'src/infrastructure/**',
                message: '도메인 레이어는 인프라 레이어에 의존할 수 없습니다.'
            }
        ];

        // 인프라에서 도메인을 참조하는 것은 위 규칙에 위배되지 않음
        const violations = await checkArchitecture(infraFile, rules, testDir);
        expect(violations).toHaveLength(0);
    });
});
