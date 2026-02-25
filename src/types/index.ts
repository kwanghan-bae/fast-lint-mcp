export interface FileMetric {
  path: string;
  hash: string;
  lineCount: number;
  complexity: number;
  updatedAt: string;
}

export interface SessionStat {
  id?: number;
  timestamp: string;
  totalCoverage: number;
  violationCount: number;
  passStatus: boolean;
}

export interface QualityReport {
  pass: boolean;
  violations: Violation[];
  suggestion: string;
}

export interface Violation {
  type:
    | 'SIZE'
    | 'COMPLEXITY'
    | 'COVERAGE'
    | 'ORPHAN'
    | 'TECH_DEBT'
    | 'CUSTOM'
    | 'ENV'
    | 'HALLUCINATION'
    | 'FAKE_LOGIC'
    | 'SECURITY'
    | 'MUTATION_SURVIVED'
    | 'READABILITY'
    | 'ARCHITECTURE';
  file?: string;
  value?: number | string;
  limit?: number | string;
  message: string;
}

/**
 * 언어별 품질 검사 프로바이더 인터페이스
 */
export interface QualityProvider {
  name: string;
  extensions: string[];
  check(filePath: string): Promise<Violation[]>;
  fix?(files: string[], workspacePath: string): Promise<{ fixedCount: number; messages: string[] }>;
}
