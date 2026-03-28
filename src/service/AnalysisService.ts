import { statSync } from 'fs';
import pMap from 'p-map';
import { simpleGit, SimpleGit } from 'simple-git';
import { StateManager } from '../state.js';
import { ConfigService } from '../config.js';
import { SemanticService } from './SemanticService.js';
import { ReportService } from './ReportService.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { countTechDebt } from '../analysis/rg.js';
import { checkEnv } from '../checkers/env.js';
import { JavascriptProvider } from '../providers/JavascriptProvider.js';
import { KotlinProvider } from '../providers/KotlinProvider.js';
import { RustProvider } from '../providers/RustProvider.js';
import { checkStructuralIntegrity } from '../utils/AnalysisUtils.js';
import { getProjectFiles, clearProjectFilesCache } from '../analysis/import-check.js';
import { clearPathCache } from '../utils/PathResolver.js';
import { join, extname, relative, isAbsolute, normalize } from 'path';
import os from 'os';
import { SYSTEM, VERSION } from '../constants.js';
import { CoverageAnalyzer } from '../utils/CoverageAnalyzer.js';
import { runBatchAnalysisNative } from '../../native/index.js';
import { QualityReport, Violation, QualityProvider } from '../types/index.js';

export // AnalysisService 클래스는 역할을 담당합니다.
class AnalysisService {
  private git: SimpleGit;
  private depGraph: DependencyGraph;
  private coverageAnalyzer: CoverageAnalyzer;
  private providers: QualityProvider[] = [];
  private reportService: ReportService;
  private workspacePath: string;

  constructor(private stateManager: StateManager, private config: ConfigService, private semantic: SemanticService) {
    this.workspacePath = this.config.workspacePath || process.cwd();
    this.git = simpleGit(this.workspacePath);
    this.depGraph = new DependencyGraph(this.workspacePath);
    this.coverageAnalyzer = new CoverageAnalyzer(this.workspacePath);
    this.reportService = new ReportService(this.semantic, this.stateManager, this.workspacePath);
    this.providers = [
      new JavascriptProvider(this.config, this.semantic),
      new KotlinProvider(this.config, this.semantic),
      new RustProvider(this.config, this.semantic),
    ];
  }

  async runAllChecks(options: any = {}): Promise<QualityReport> {
    const envCheck = await this.validateEnvironment();
    if (!envCheck.pass) return envCheck.report!;
    const rules = this.resolveRules(options);
    const incremental = options.forceFullScan ? false : (options.incremental ?? this.config.incremental);
    const allFiles = await this.scanProjectFiles();
    await this.depGraph.build(allFiles);
    if (this.semantic && typeof (this.semantic as any).ensureInitialized === 'function') {
      await (this.semantic as any).ensureInitialized(false, this.workspacePath);
    }
    const targetFiles = await this.resolveTargetFiles(incremental, allFiles);
    const lastUpdate = await this.getLatestMtime(targetFiles);
    const healing = await this.performSelfHealing(targetFiles);
    const violations = await this.performFileAnalysis(targetFiles, options);
    violations.push(...checkStructuralIntegrity(this.depGraph));
    await this.scanTechDebt(allFiles, rules, violations);
    const coverage = await this.coverageAnalyzer.analyze(options, rules, lastUpdate, allFiles, violations);
    const report = await this.reportService.assemble(violations, coverage, healing, targetFiles, incremental && targetFiles.length < allFiles.length);
    this.cleanupCaches();
    return report;
  }

  private async validateEnvironment() {
    const res = await checkEnv();
    if (res.pass) return { pass: true };
    return { 
      pass: false, 
      report: { 
        pass: false, 
        violations: [{ type: 'ENV' as any, message: res.suggestion || 'Error' }],
        metadata: { analyzedFiles: 0, analysisMode: 'full' as any, timestamp: '', version: VERSION, filesAnalyzed: 0 }
      } as QualityReport 
    };
  }

  private resolveRules(opt: any) {
    const r = { ...this.config.rules };
    if (opt.maxLines) r.maxLineCount = opt.maxLines;
    if (opt.maxComplexity) r.maxComplexity = opt.maxComplexity;
    return r;
  }

  private async scanProjectFiles() {
    return await getProjectFiles(this.workspacePath, [...SYSTEM.DEFAULT_IGNORE_PATTERNS, ...(this.config.exclude || [])]);
  }

  private async resolveTargetFiles(inc: boolean, all: string[]) {
    const exts = this.providers.flatMap(p => p.extensions);
    const base = all.filter(f => exts.includes(extname(f)));
    if (!inc) return base;
    const changed = await this.getChangedFiles();
    if (changed.length === 0) return base;
    const affected = new Set<string>();
    changed.forEach(f => {
      const full = isAbsolute(f) ? f : join(this.workspacePath, f);
      if (full.startsWith(this.workspacePath)) {
        affected.add(relative(this.workspacePath, full));
        this.depGraph.getDependents(full).forEach(d => { if (d.startsWith(this.workspacePath)) affected.add(relative(this.workspacePath, d)); });
      }
    });
    return Array.from(affected).filter(f => exts.includes(extname(f)));
  }

  private async getChangedFiles() {
    try {
      const s = await this.git.status();
      return [...s.modified, ...s.not_added, ...s.created, ...s.staged].map(f => normalize(f));
    } catch (e) { return []; }
  }

  private async performFileAnalysis(files: string[], opt: any) {
    const batch = this.prepareBatch(files);
    const results = await pMap(files, async f => { await new Promise(r => setImmediate(r)); return this.analyzeFile(f, opt, batch); }, { concurrency: Math.max(1, os.cpus().length - 1) });
    const violations: Violation[] = [];
    results.forEach(r => { if (r) violations.push(...r.fileViolations); });
    return violations;
  }

  private prepareBatch(files: string[]) {
    const abs = files.map(f => (isAbsolute(f) ? f : join(this.workspacePath, f)));
    return new Map(runBatchAnalysisNative(abs).map(r => [normalize(r.file), r]));
  }

  private async analyzeFile(f: string, opt: any, batch: Map<string, any>) {
    const full = isAbsolute(f) ? f : join(this.workspacePath, f);
    const p = this.providers.find(p => p.extensions.includes(extname(full)));
    if (!p) return null;
    return { fileViolations: await p.check(full, { ...opt, batchResult: batch.get(normalize(full)) }) };
  }

  private async performSelfHealing(files: string[]) {
    const msgs: string[] = [];
    for (const p of this.providers) {
      const targets = files.filter(f => p.extensions.includes(extname(f))).map(f => (isAbsolute(f) ? f : join(this.workspacePath, f)));
      if (targets.length > 0 && p.fix) { const res = await p.fix(targets, this.workspacePath); msgs.push(...res.messages); }
    }
    return msgs;
  }

  private async scanTechDebt(all: string[], rules: any, v: Violation[]) {
    const count = await countTechDebt(all);
    if (count > rules.techDebtLimit) v.push({ type: 'TECH_DEBT' as any, value: count, limit: rules.techDebtLimit, message: `기술 부채 과다` });
  }

  private async getLatestMtime(files: string[]) {
    if (files.length === 0) return 0;
    const times = await pMap(files, async f => { try { return statSync(isAbsolute(f) ? f : join(this.workspacePath, f)).mtimeMs; } catch (e) { return 0; } }, { concurrency: 4 });
    return Math.max(...times);
  }

  private cleanupCaches() { clearProjectFilesCache(); clearPathCache(); }
}
