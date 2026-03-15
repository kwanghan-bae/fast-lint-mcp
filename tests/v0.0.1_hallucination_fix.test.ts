import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyAPIContracts } from '../src/analysis/reviewer.js';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '@ast-grep/napi';

describe('Hallucination Fix (v0.0.1)', () => {
  const testFile = join(process.cwd(), 'temp_hallucination_fix.ts');

  beforeEach(() => {
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testFile)) rmSync(testFile);
  });

  it('Promise의 resolve, reject 파라미터를 오탐하지 않아야 한다', async () => {
    const code = `
      const myPromise = new Promise((resolve, reject) => {
        if (true) resolve('success');
        else reject('fail');
      });
    `;
    writeFileSync(testFile, code);
    const root = AstCacheManager.getInstance().getRootNode(testFile);
    const violations = await verifyAPIContracts(root!, testFile);
    
    // resolve, reject 호출이 환각으로 지적되지 않아야 함
    const hasResolveViolation = violations.some(v => v.message.includes('[resolve]'));
    const hasRejectViolation = violations.some(v => v.message.includes('[reject]'));
    
    expect(hasResolveViolation).toBe(false);
    expect(hasRejectViolation).toBe(false);
  });

  it('메서드의 인자(Parameter)를 오탐하지 않아야 한다', async () => {
    const code = `
      class ScheduleService {
        private static wrapJob(name: string, job: () => Promise<void>) {
          console.log(name);
          job();
        }
      }
    `;
    writeFileSync(testFile, code);
    const root = AstCacheManager.getInstance().getRootNode(testFile);
    const violations = await verifyAPIContracts(root!, testFile);
    
    // job 호출이 환각으로 지적되지 않아야 함
    const hasJobViolation = violations.some(v => v.message.includes('[job]'));
    expect(hasJobViolation).toBe(false);
  });

  it('JavaScript 내장 전역 함수(parseFloat 등)를 오탐하지 않아야 한다', async () => {
    const code = `
      const val = parseFloat('123.45');
      const intVal = parseInt('123');
      const encoded = encodeURIComponent('test');
    `;
    writeFileSync(testFile, code);
    const root = AstCacheManager.getInstance().getRootNode(testFile);
    const violations = await verifyAPIContracts(root!, testFile);
    
    expect(violations.length).toBe(0);
  });

  it('로컬에 정의된 변수나 함수를 오탐하지 않아야 한다', async () => {
    const code = `
      function localFunc() {}
      localFunc();
      const myVar = () => {};
      myVar();
    `;
    writeFileSync(testFile, code);
    const root = AstCacheManager.getInstance().getRootNode(testFile);
    const violations = await verifyAPIContracts(root!, testFile);
    
    expect(violations.length).toBe(0);
  });
});
