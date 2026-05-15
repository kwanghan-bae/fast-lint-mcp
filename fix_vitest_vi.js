import fs from 'fs';

const files = [
  'tests/v3.9_monorepo_coverage.test.ts',
  'tests/v4.1_coverage_details.test.ts',
  'tests/v4.2_coverage_insights.test.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.startsWith("vi.mock('../src/checkers/env.js'")) {
    content = content.replace("vi.mock('../src/checkers/env.js', () => ({ checkEnv: vi.fn().mockResolvedValue({ pass: true }) }));\n", "");
    content = content.replace("import { describe", "import { describe, vi");
    content = content + "\nvi.mock('../src/checkers/env.js', () => ({ checkEnv: vi.fn().mockResolvedValue({ pass: true }) }));\n";
    fs.writeFileSync(file, content);
  }
}
