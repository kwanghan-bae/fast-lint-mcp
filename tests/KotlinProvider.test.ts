import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KotlinProvider } from '../src/providers/KotlinProvider.js';
import { ConfigService } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { AstCacheManager } from '../src/utils/AstCacheManager.js';

describe('KotlinProvider (Cross-Language Precision)', () => {
  const testDir = join(process.cwd(), 'temp_kotlin_test');
  let provider: KotlinProvider;

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    const config = new ConfigService(testDir);
    provider = new KotlinProvider(config);
    AstCacheManager.getInstance().clear();
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('Kotlin 파일(.kt)의 크기와 보안 위반을 탐지해야 한다', async () => {
    const filePath = join(testDir, 'UserService.kt');
    const code = `
      package com.example
      class UserService {
        val apiKey = "AKIA1234567890ABCDEF" // SECURITY 위반 유도
        fun login() {
          println("Login logic")
        }
      }
    `;
    writeFileSync(filePath, code);

    const violations = await provider.check(filePath);

    // 1. 보안 위반 검증 (checkSecrets 연동 확인)
    expect(violations.some((v) => v.type === 'SECURITY')).toBe(true);

    // 2. 가독성 리뷰 검증 (runSemanticReview 연동 확인)
    expect(violations.some((v) => v.type === 'READABILITY')).toBe(true);
  });

  it('데이터 파일 성격의 Kotlin 파일은 가독성 리뷰를 최소화해야 한다', async () => {
    const filePath = join(testDir, 'Data.kt');
    const code = 'data class User(val id: Long, val name: String)';
    writeFileSync(filePath, code);

    const violations = await provider.check(filePath);
    // 데이터 파일이므로 가독성(READABILITY) 경고가 없거나 적어야 함
    const readability = violations.filter((v) => v.type === 'READABILITY');
    expect(readability.length).toBeLessThan(2);
  });
});
