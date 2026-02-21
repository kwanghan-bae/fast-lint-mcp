import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

export const CustomRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']).default('error'),
});

export const ConfigSchema = z.object({
  rules: z.object({
    maxLineCount: z.number().default(300),
    maxComplexity: z.number().default(15),
    minCoverage: z.number().default(80),
    techDebtLimit: z.number().default(10),
  }).default({}),
  incremental: z.boolean().default(true),
  customRules: z.array(CustomRuleSchema).default([]), // 커스텀 룰 추가
});

export type Config = z.infer<typeof ConfigSchema>;
export type CustomRule = z.infer<typeof CustomRuleSchema>;

export class ConfigService {
  private config: Config;

  constructor(workspacePath: string = process.cwd()) {
    const configPath = join(workspacePath, '.fast-lintrc.json');
    let userConfig = {};

    if (existsSync(configPath)) {
      try {
        userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Warning: Failed to parse .fast-lintrc.json, using defaults.');
      }
    }

    this.config = ConfigSchema.parse(userConfig);
  }

  get rules() {
    return this.config.rules;
  }

  get incremental() {
    return this.config.incremental;
  }

  get customRules() {
    return this.config.customRules;
  }
}
