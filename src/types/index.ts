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
  type: 'SIZE' | 'COMPLEXITY' | 'COVERAGE' | 'ORPHAN' | 'TECH_DEBT' | 'CUSTOM' | 'ENV' | 'HALLUCINATION' | 'FAKE_LOGIC' | 'SECURITY' | 'MUTATION_SURVIVED';
  file?: string;
  value?: number | string;
  limit?: number | string;
  message: string;
}
