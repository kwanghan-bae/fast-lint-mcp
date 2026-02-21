import { execa } from 'execa';

export interface EnvCheckResult {
  pass: boolean;
  missing: string[];
  suggestion?: string;
}

const REQUIRED_TOOLS = [
  { bin: 'fd', name: 'fd-find (fd)' },
  { bin: 'rg', name: 'ripgrep (rg)' },
  { bin: 'sg', name: 'ast-grep (sg)' },
];

export async function checkEnv(): Promise<EnvCheckResult> {
  const missing: string[] = [];

  for (const tool of REQUIRED_TOOLS) {
    try {
      await execa('which', [tool.bin]);
    } catch {
      missing.push(tool.name);
    }
  }

  if (missing.length === 0) {
    return { pass: true, missing: [] };
  }

  const installCmd = missing
    .map((m) => {
      if (m.includes('fd')) return 'fd';
      if (m.includes('rg')) return 'ripgrep';
      if (m.includes('sg')) return 'ast-grep';
      return '';
    })
    .join(' ');

  return {
    pass: false,
    missing,
    suggestion: `필수 도구가 누락되었습니다. 다음 명령어로 설치하세요: brew install ${installCmd}`,
  };
}
