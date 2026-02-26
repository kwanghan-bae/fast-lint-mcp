import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

export const CustomRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']).default('error'),
});

export const ArchitectureRuleSchema = z.object({
  from: z.string(),
  to: z.string(),
  message: z.string(),
});

export const ConfigSchema = z.object({
  rules: z
    .object({
      maxLineCount: z.number().default(300),
      maxComplexity: z.number().default(25),
      minCoverage: z.number().default(80),
      techDebtLimit: z.number().default(10),
    })
    .default({}),
  incremental: z.boolean().default(true),
  enableMutationTest: z.boolean().default(false), // 변이 테스트 활성화 여부 (기본값 false)
  exclude: z.array(z.string()).default(['node_modules/**', 'dist/**', 'tests/**']),
  customRules: z.array(CustomRuleSchema).default([]),
  architectureRules: z.array(ArchitectureRuleSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
export type CustomRule = z.infer<typeof CustomRuleSchema>;
export type ArchitectureRule = z.infer<typeof ArchitectureRuleSchema>;

export class ConfigService {
  private config: Config;

  constructor(workspacePath: string = process.cwd()) {
    let userConfig = this.loadConfig(workspacePath);
    this.config = ConfigSchema.parse(userConfig);
  }

  private loadConfig(workspacePath: string): Record<string, unknown> {
    const configPaths = ['.fast-lintrc.json', '.fast-lintrc'];

    for (const p of configPaths) {
      const fullPath = join(workspacePath, p);
      if (existsSync(fullPath)) {
        try {
          return JSON.parse(readFileSync(fullPath, 'utf-8'));
        } catch (e) {
          console.warn(`Warning: Failed to parse ${p}`);
        }
      }
    }

    // package.json 체크
    const pkgPath = join(workspacePath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkgContent = readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.fastLint) return pkg.fastLint;
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return {};
  }

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
