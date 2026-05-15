import fs from 'fs';

const files = [
  'tests/AnalysisService.test.ts',
  'tests/AnalysisService_coverage.test.ts',
  'tests/v3.9_monorepo_coverage.test.ts',
  'tests/v4.1_coverage_details.test.ts',
  'tests/v4.2_coverage_insights.test.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes("vi.mock('../src/checkers/env.js'")) {
    content = content.replace(
      "vi.mock('fs');",
      "vi.mock('fs');\nvi.mock('../src/checkers/env.js', () => ({ checkEnv: vi.fn().mockResolvedValue({ pass: true }) }));"
    );
    if (!content.includes("vi.mock('../src/checkers/env.js'")) {
      content = "vi.mock('../src/checkers/env.js', () => ({ checkEnv: vi.fn().mockResolvedValue({ pass: true }) }));\n" + content;
    }
    fs.writeFileSync(file, content);
  }
}
