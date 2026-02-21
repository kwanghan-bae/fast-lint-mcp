import { readFileSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { CustomRule } from '../config.js';

export interface FileAnalysis {
  path: string;
  lineCount: number;
  complexity: number;
  customViolations: { id: string, message: string }[];
}

const COMPLEXITY_PATTERNS = [
  'if ($A) { $$$ }',
  'for ($A) { $$$ }',
  'while ($A) { $$$ }',
  'switch ($A) { $$$ }',
  'try { $$$ } catch ($A) { $$$ }',
];

export async function analyzeFile(filePath: string, customRules: CustomRule[] = []): Promise<FileAnalysis> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
    const ast = parse(lang, content);
    const root = ast.root();

    let complexity = 0;
    for (const pattern of COMPLEXITY_PATTERNS) {
      try {
        const matches = root.findAll(pattern);
        complexity += matches.length;
      } catch (e) {
        // Skip invalid patterns
      }
    }

    const customViolations: { id: string, message: string }[] = [];
    for (const rule of customRules) {
      try {
        const matches = root.findAll(rule.pattern);
        if (matches.length > 0) {
          customViolations.push({ id: rule.id, message: rule.message });
        }
      } catch (e) {
        console.warn(`Warning: Custom rule pattern "${rule.pattern}" is invalid for ${filePath}`);
      }
    }

    return {
      path: filePath,
      lineCount,
      complexity,
      customViolations,
    };
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error);
    throw error;
  }
}
