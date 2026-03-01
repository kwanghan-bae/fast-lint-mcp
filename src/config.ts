import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

/**
 * 사용자 정의 검사 규칙을 정의하는 스키마입니다.
 */
export const CustomRuleSchema = z.object({
  /** 규칙의 고유 식별자 */
  id: z.string(),
  /** 탐지할 AST 패턴 */
  pattern: z.string(),
  /** 위반 시 출력할 안내 메시지 */
  message: z.string(),
});

/**
 * 아키텍처 의존성 규칙을 정의하는 스키마입니다.
 */
export const ArchitectureRuleSchema = z.object({
  /** 소스 패턴 */
  from: z.string(),
  /** 금지된 대상 패턴 */
  to: z.string(),
  /** 규칙 위반 메시지 */
  message: z.string(),
});

/**
 * Fast-Lint-MCP의 전체 설정 구조를 정의하는 스키마입니다.
 */
export const ConfigSchema = z.object({
  /** 세부 품질 측정 규칙 */
  rules: z
    .object({
      maxLineCount: z.number().default(500),
      maxComplexity: z.number().default(25),
      coveragePath: z.string().optional(),
      coverageDirectory: z.string().default('coverage'),
      minCoverage: z.number().default(80),
      techDebtLimit: z.number().default(20),
    })
    .default({}),
  /** 증분 분석 사용 여부 */
  incremental: z.boolean().default(true),
  /** 변이 테스트 활성화 여부 */
  enableMutationTest: z.boolean().default(false),
  /** 분석 제외 경로 */
  exclude: z
    .array(z.string())
    .default([
      'node_modules/**',
      'dist/**',
      'out/**',
      'build/**',
      '.next/**',
      'coverage/**',
      'android/**',
      'ios/**',
      'tests/**',
    ]),
  /** 커스텀 규칙 목록 */
  customRules: z.array(CustomRuleSchema).default([]),
  /** 아키텍처 규칙 목록 */
  architectureRules: z.array(ArchitectureRuleSchema).default([]),
});

/** 설정 타입 추출 */
export type Config = z.infer<typeof ConfigSchema>;
/** 커스텀 규칙 타입 추출 */
export type CustomRule = z.infer<typeof CustomRuleSchema>;
/** 아키텍처 규칙 타입 추출 */
export type ArchitectureRule = z.infer<typeof ArchitectureRuleSchema>;

/**
 * 프로젝트 설정 파일(.fast-lintrc 등)을 관리하는 서비스입니다.
 */
export class ConfigService {
  /** 최종 설정 객체 */
  private config: Config;
  /** 현재 프로젝트 절대 경로 */
  public workspacePath: string;

  /**
   * ConfigService 인스턴스를 생성하고 설정을 로드합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
    const userConfig = this.loadConfig(workspacePath);
    this.config = ConfigSchema.parse(userConfig);
  }

  /**
   * 설정 파일을 탐색하여 객체로 로드합니다.
   */
  private loadConfig(workspacePath: string): any {
    const configPaths = [
      join(workspacePath, '.fast-lintrc.json'),
      join(workspacePath, '.fast-lintrc'),
      join(workspacePath, 'package.json'),
    ];

    for (const path of configPaths) {
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, 'utf-8');
          if (path.endsWith('package.json')) {
            const pkg = JSON.parse(content);
            const raw = pkg['fast-lint'] || pkg['fastLint'];
            if (raw) return raw;
          } else {
            return JSON.parse(content);
          }
        } catch (e) {
          console.warn(`Warning: Failed to parse ${path}`);
        }
      }
    }
    return {};
  }

  /** 품질 측정 규칙 설정을 가져옵니다. */
  get rules() {
    return this.config.rules;
  }
  /** 증분 분석 활성화 여부를 확인합니다. */
  get incremental() {
    return this.config.incremental;
  }
  /** 변이 테스트 활성화 여부를 확인합니다. */
  get enableMutationTest() {
    return this.config.enableMutationTest;
  }
  /** 제외할 경로 목록을 가져옵니다. */
  get exclude() {
    return this.config.exclude;
  }
  /** 정의된 커스텀 규칙 목록을 가져옵니다. */
  get customRules() {
    return this.config.customRules;
  }
  /** 정의된 아키텍처 규칙 목록을 가져옵니다. */
  get architectureRules() {
    return this.config.architectureRules;
  }
}
