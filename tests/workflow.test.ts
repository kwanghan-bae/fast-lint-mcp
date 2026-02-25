import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentWorkflow } from '../src/agent/workflow.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('AgentWorkflow (Self-Healing)', () => {
    const testDir = join(process.cwd(), 'temp_workflow_test');

    beforeEach(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('테스트가 통과하면 수정이 성공해야 한다', async () => {
        const filePath = 'test.ts';
        const workflow = new AgentWorkflow(testDir);
        
        // 가짜 수정 로직 (성공하는 코드 반환)
        const fixLogic = async () => 'const a = 1;';
        
        // 가짜 테스트 명령어 (항상 성공)
        const result = await workflow.selfHeal(filePath, fixLogic, 'echo "Success"', 3);
        
        expect(result.success).toBe(true);
        expect(result.iterations).toBe(1);
    });

    it('테스트 실패 시 최대 횟수만큼 재시도해야 한다', async () => {
        const filePath = 'test.ts';
        const workflow = new AgentWorkflow(testDir);
        
        const fixLogic = async () => 'const a = 1;';
        
        // 가짜 테스트 명령어 (항상 실패)
        const result = await workflow.selfHeal(filePath, fixLogic, 'exit 1', 2);
        
        expect(result.success).toBe(false);
        expect(result.iterations).toBe(2);
    });

    it('verify 메서드가 테스트 결과를 반환해야 한다', () => {
        const workflow = new AgentWorkflow(testDir);
        
        const passResult = workflow.verify('echo "Pass"');
        expect(passResult.success).toBe(true);
        
        const failResult = workflow.verify('exit 1');
        expect(failResult.success).toBe(false);
        expect(failResult.error).toBeDefined();
    });
});
