import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

/**
 * 사용자 정의 검사 규칙을 정의하는 스키마입니다.
 * 특정 AST 패턴을 감지하여 사용자 지정 메시지와 심각도를 출력할 수 있습니다.
 */
export const CustomRuleSchema = z.object({
  id: z.string(), // 규칙 식별자 (예: 'NO_UNDEFINED_CHECK')
  pattern: z.string(), // ast-grep 패턴 (예: 'if ($A === undefined)')
  message: z.string(), // 위반 시 출력할 메시지
  severity: z.enum(['error', 'warning']).default('error'), // 규칙의 중요도
});

/**
 * 프로젝트 아키텍처 규칙(의존성 방향)을 정의하는 스키마입니다.
 * 특정 디렉토리가 다른 디렉토리를 참조하지 못하도록 제한할 수 있습니다.
 */
export const ArchitectureRuleSchema = z.object({
  from: z.string(), // 소스 패턴 (예: 'src/domain/**')
  to: z.string(), // 허용되지 않는 대상 패턴 (예: 'src/infrastructure/**')
  message: z.string(), // 위반 시 출력할 안내 메시지
});

/**
 * Fast-Lint-MCP의 전체 설정 구조를 정의하는 스키마입니다.
 * 기본값 설정 및 유효성 검사를 Zod를 통해 수행합니다.
 */
export const ConfigSchema = z.object({
  rules: z
    .object({
      maxLineCount: z.number().default(500), // 단일 파일 최대 라인 수 (주석 포함 고려하여 확장)
      maxComplexity: z.number().default(25), // 함수/클래스 최대 복잡도 (AST 노드 기준)
  coveragePath: z.string().optional(), // 커버리지 리포트 파일 직접 지정 (lcov.info, coverage-summary.json 등)
      coverageDirectory: z.string().default('coverage'), // 커버리지 리포트가 생성되는 디렉토리
      minCoverage: z.number().default(80), // 최소 필수 테스트 커버리지 (%)
      techDebtLimit: z.number().default(20), // 허용되는 최대 TODO/FIXME 개수
    })
    .default({}),
  incremental: z.boolean().default(true), // Git 변경 사항 기반의 증분 분석 사용 여부
  enableMutationTest: z.boolean().default(false), // 변이 테스트(Mutation Test) 활성화 여부
  exclude: z.array(z.string()).default([
    'node_modules/**', 
    'dist/**', 
    'out/**',
    'build/**',
    '.next/**',
    'coverage/**',
    'android/**',
    'ios/**',
    'tests/**'
  ]), // 분석 제외 경로
  customRules: z.array(CustomRuleSchema).default([]), // 사용자 정의 정적 분석 규칙 목록
  architectureRules: z.array(ArchitectureRuleSchema).default([]), // 아키텍처 의존성 규칙 목록
});

// TypeScript 타입 추출
export type Config = z.infer<typeof ConfigSchema>;
export type CustomRule = z.infer<typeof CustomRuleSchema>;
export type ArchitectureRule = z.infer<typeof ArchitectureRuleSchema>;

/**
 * 프로젝트 설정 파일(.fast-lintrc 등)을 로드하고 관리하는 서비스 클래스입니다.
 */
export class ConfigService {
  // 파싱 및 검증이 완료된 최종 설정 객체
  private config: Config;

  /**
   * ConfigService 인스턴스를 생성하고 설정을 로드합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(workspacePath: string = process.cwd()) {
    let userConfig = this.loadConfig(workspacePath);
    // Zod 스키마를 사용하여 사용자 설정의 유효성을 검사하고 기본값을 채웁니다.
    this.config = ConfigSchema.parse(userConfig);
  }

  /**
   * 다양한 소스에서 설정을 탐색하여 로드합니다.
   * 우선순위: .fast-lintrc.json > .fast-lintrc > package.json [fastLint]
   * @param workspacePath 작업 디렉토리 경로
   * @returns 원시 설정 객체
   */
  private loadConfig(workspacePath: string): Record<string, unknown> {
    const configPaths = ['.fast-lintrc.json', '.fast-lintrc'];

    // 1. 전용 설정 파일 탐색
    for (const p of configPaths) {
      const fullPath = join(workspacePath, p);
      if (existsSync(fullPath)) {
        try {
          return JSON.parse(readFileSync(fullPath, 'utf-8'));
        } catch (e) {
          console.warn(`Warning: Failed to parse ${p}. JSON 형식을 확인하세요.`);
        }
      }
    }

    // 2. package.json 내부의 fastLint 항목 탐색
    const pkgPath = join(workspacePath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkgContent = readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.fastLint) return pkg.fastLint;
      } catch (e) {
        // 파싱 오류 시 무시하고 빈 객체 반환
      }
    }

    return {};
  }

  // 각 설정 항목에 대한 Getter 메소드들
  get rules() {
    return this.config.rules;
  }
  get incremental() {
    return this.config.incremental;
  }
  get enableMutationTest() {
    return this.config.enableMutationTest;
  }
  get exclude() {
    return this.config.exclude;
  }
  get customRules() {
    return this.config.customRules;
  }
  get architectureRules() {
    return this.config.architectureRules;
  }
}
