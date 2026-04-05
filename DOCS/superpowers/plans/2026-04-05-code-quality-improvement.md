# fast-lint-mcp 코드 품질 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export 문법 오류, Command Injection 보안 취약점, `any` 타입 남용, Empty Catch 블록, 미테스트 모듈 등 프로젝트 전반의 코드 품질 이슈를 체계적으로 개선한다.

**Architecture:** 기존 아키텍처를 유지하면서 6개 Phase로 점진적 개선. P0(긴급 버그/보안) → P1(타입 안전성) → P2(에러 처리) → P3(테스트 커버리지) → P4(대형 파일 분리) → P5(최종 검증) 순서로 진행한다.

**Tech Stack:** TypeScript 5.x, Vitest, Zod, @modelcontextprotocol/sdk

---

## File Map

### Phase 1 (P0: 긴급 수정)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/service/AnalysisService.ts:26` | Export 문법 오류 수정 |
| Modify | `src/utils/CoverageAnalyzer.ts:8` | Export 문법 오류 수정 |
| Modify | `src/agent/workflow.ts:27,61` | Command Injection 방어 |
| Create | `tests/workflow_security.test.ts` | 보안 검증 테스트 |

### Phase 2 (P1: 타입 안전성)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/types/index.ts` | ToolArgs 인터페이스 추가 |
| Modify | `src/agent/handlers.ts` | `any` → 구체적 타입 |
| Modify | `src/index.ts` | AnalyzerFactory, ToolHandler 타입 적용 |
| Modify | `src/service/AnalysisService.ts` | options/rules 타입 정의 |
| Modify | `src/utils/CoverageAnalyzer.ts` | 메서드 파라미터 타입 |

### Phase 3 (P2: 에러 처리)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/state.ts` | 5개 empty catch → 로깅 추가 |
| Modify | `src/checkers/security.ts:79` | empty catch → 로깅 |
| Modify | `src/utils/SymbolIndexer.ts:54` | empty catch → 로깅 |
| Modify | `src/analysis/import-check.ts:126` | empty catch → 로깅 |
| Modify | `src/providers/JavascriptProvider.ts:52,156` | empty catch → 로깅 |
| Modify | `src/utils/CoverageAnalyzer.ts:67` | empty catch → 로깅 |

### Phase 4 (P3: 테스트 커버리지)
| Action | File | Purpose |
|--------|------|---------|
| Create | `tests/handlers.test.ts` | MCP 핸들러 테스트 |
| Create | `tests/ReportService.test.ts` | 리포트 조립 테스트 |
| Create | `tests/TsProgramManager.test.ts` | TS 컴파일러 관리 테스트 |
| Create | `tests/cli.test.ts` | CLI 명령어 테스트 |

### Phase 5 (P4: 대형 파일 분리)
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/utils/StructuralIntegrity.ts` | AnalysisUtils에서 추출 |
| Modify | `src/utils/AnalysisUtils.ts` | 구조 검증 로직 분리 |
| Create | `src/providers/ComplexityAdvisor.ts` | JavascriptProvider에서 추출 |
| Modify | `src/providers/JavascriptProvider.ts` | 조언 생성 로직 분리 |

---

## Task 1: Export 문법 오류 수정

**Files:**
- Modify: `src/service/AnalysisService.ts:26-27`
- Modify: `src/utils/CoverageAnalyzer.ts:8-9`

- [ ] **Step 1: 현재 빌드 통과 확인**

Run: `cd /Users/joel/Desktop/git/fast-lint-mcp && npm run build`
Expected: 빌드 성공 (현재는 TS가 관대하게 파싱하여 통과할 수 있음)

- [ ] **Step 2: AnalysisService.ts export 수정**

`src/service/AnalysisService.ts:26-27` 에서:

```typescript
// Before:
export // AnalysisService 클래스는 역할을 담당합니다.
class AnalysisService {

// After:
/** AnalysisService: 전체 분석 파이프라인 오케스트레이션 */
export class AnalysisService {
```

- [ ] **Step 3: CoverageAnalyzer.ts export 수정**

`src/utils/CoverageAnalyzer.ts:8-9` 에서:

```typescript
// Before:
export // CoverageAnalyzer 클래스는 역할을 담당합니다.
class CoverageAnalyzer {

// After:
/** CoverageAnalyzer: LCOV/커버리지 리포트 분석 */
export class CoverageAnalyzer {
```

- [ ] **Step 4: 빌드 및 테스트 확인**

Run: `npm run build && npm test`
Expected: 빌드 성공, 기존 테스트 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/service/AnalysisService.ts src/utils/CoverageAnalyzer.ts
git commit -m "fix: export 문법 오류 수정 (export // comment → export class)"
```

---

## Task 2: Command Injection 보안 취약점 수정

**Files:**
- Modify: `src/agent/workflow.ts:27,44,61,63`
- Create: `tests/workflow_security.test.ts`

- [ ] **Step 1: 보안 테스트 작성**

`tests/workflow_security.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AgentWorkflow } from '../src/agent/workflow.js';

const testDir = join(process.cwd(), 'temp_workflow_security_test');

beforeEach(() => mkdirSync(testDir, { recursive: true }));
afterEach(() => rmSync(testDir, { recursive: true, force: true }));

describe('AgentWorkflow 보안 검증', () => {
  it('허용된 테스트 명령어는 정상 실행되어야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('npm test');
    // npm test가 실패하더라도 에러가 command rejection이 아니어야 함
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('셸 메타문자가 포함된 명령어는 거부해야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('npm test; rm -rf /');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('파이프가 포함된 명령어는 거부해야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('npm test | cat /etc/passwd');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('백틱이 포함된 명령어는 거부해야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('npm test `whoami`');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('$() 서브셸이 포함된 명령어는 거부해야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('npm test $(cat /etc/passwd)');
    expect(result.success).toBe(false);
    expect(result.error).toContain('허용되지 않은');
  });

  it('빈 문자열 명령어는 기본값(npm test)을 사용해야 한다', () => {
    const workflow = new AgentWorkflow(testDir);
    const result = workflow.verify('');
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/workflow_security.test.ts`
Expected: 셸 메타문자 거부 테스트들이 FAIL (현재 검증 없음)

- [ ] **Step 3: Command Injection 방어 구현**

`src/agent/workflow.ts` 수정 — 파일 상단에 검증 함수 추가:

```typescript
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

/** 셸 메타문자를 포함한 위험한 명령어 패턴 */
const DANGEROUS_PATTERNS = /[;|&`$(){}><\n\r]/;

/** 허용된 명령어 접두사 */
const ALLOWED_PREFIXES = ['npm', 'npx', 'yarn', 'pnpm', 'jest', 'vitest', 'mocha', 'node'];

function validateTestCommand(command: string): string {
  const cmd = command.trim() || 'npm test';

  if (DANGEROUS_PATTERNS.test(cmd)) {
    throw new Error(`허용되지 않은 문자가 포함된 명령어입니다: ${cmd}`);
  }

  const prefix = cmd.split(/\s+/)[0];
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    throw new Error(`허용되지 않은 명령어 접두사입니다: ${prefix}`);
  }

  return cmd;
}
```

`selfHeal` 메서드 (line 44 부근)와 `verify` 메서드 (line 63 부근)에서 `execSync` 호출 전에 검증 추가:

```typescript
// selfHeal 메서드 내부 (line 44 부근):
const safeCommand = validateTestCommand(testCommand);
execSync(safeCommand, { cwd: this.workspacePath, stdio: 'pipe' });

// verify 메서드 내부 (line 63 부근):
verify(testCommand: string = 'npm test'): { success: boolean; error?: string } {
  try {
    const safeCommand = validateTestCommand(testCommand);
    execSync(safeCommand, { cwd: this.workspacePath, stdio: 'pipe' });
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/workflow_security.test.ts`
Expected: 전체 PASS

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: 기존 테스트 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add src/agent/workflow.ts tests/workflow_security.test.ts
git commit -m "fix(security): Command Injection 방어 — execSync 입력 검증 추가"
```

---

## Task 3: 타입 안전성 강화 — types/index.ts 인터페이스 추가

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 현재 타입 정의 확인**

Run: 현재 `src/types/index.ts` 읽기 — Violation, QualityReport 등 기존 인터페이스 파악

- [ ] **Step 2: MCP 도구 인자 타입 추가**

`src/types/index.ts` 파일 끝에 추가:

```typescript
/** quality-check 도구 옵션 */
export interface QualityCheckOptions {
  maxLines?: number;
  maxComplexity?: number;
  minCoverage?: number;
  techDebtLimit?: number;
  targetPath?: string;
  incremental?: boolean;
  includeNative?: boolean;
}

/** 심볼 관련 도구 공통 인자 */
export interface SymbolArgs {
  filePath: string;
  symbolName: string;
}

/** analyze-impact 도구 인자 */
export interface ImpactArgs {
  filePath: string;
  symbolName: string;
  depth?: number;
}

/** verify-fix 도구 인자 */
export interface VerifyArgs {
  testCommand?: string;
}

/** 분석 규칙 설정 (resolveRules 반환값) */
export interface AnalysisRules {
  maxLineCount: number;
  maxComplexity: number;
  minCoverage: number;
  techDebtLimit: number;
}

/** ToolHandler 함수 시그니처 */
export type ToolHandler = (
  args: Record<string, unknown>,
  semanticSvc: import('../service/SemanticService.js').SemanticService,
  workspace: string,
  getAnalyzer: AnalyzerFactory,
) => Promise<unknown>;

/** AnalyzerFactory 타입 */
export type AnalyzerFactory = (workspace: string) => import('../service/AnalysisService.js').AnalysisService;
```

- [ ] **Step 3: Violation 인터페이스의 any 제거**

`src/types/index.ts` 에서 Violation 인터페이스의 `value?: any`와 `limit?: any`를 수정:

```typescript
// Before:
value?: any;
limit?: any;

// After:
value?: number | string;
limit?: number | string;
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/types/index.ts
git commit -m "feat(types): MCP 도구 인자 및 핸들러 타입 정의 추가"
```

---

## Task 4: 타입 안전성 강화 — handlers.ts, index.ts 적용

**Files:**
- Modify: `src/agent/handlers.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: handlers.ts에 타입 적용**

`src/agent/handlers.ts` 수정:

```typescript
import type {
  ToolHandler,
  QualityCheckOptions,
  SymbolArgs,
  ImpactArgs,
  VerifyArgs,
} from '../types/index.js';
import type { SemanticService } from '../service/SemanticService.js';
import type { AnalyzerFactory } from '../types/index.js';
import { AgentWorkflow } from './workflow.js';

export const toolHandlers: Record<string, ToolHandler> = {
  'guide': async () => {
    // ... 기존 SOP 텍스트 반환 로직 유지
  },

  'quality-check': async (args, _semanticSvc, workspace, getAnalyzer) => {
    const opts = args as QualityCheckOptions;
    const analyzer = getAnalyzer(workspace);
    return analyzer.runAllChecks(opts);
  },

  'get-symbol-metrics': async (args, semanticSvc) => {
    const { filePath } = args as SymbolArgs;
    return semanticSvc.getSymbolMetrics(filePath);
  },

  // ... 나머지 핸들러도 동일 패턴 적용
};
```

- [ ] **Step 2: index.ts에 타입 적용**

`src/index.ts`에서 `handleToolCall` 함수의 `args: any` → `args: Record<string, unknown>` 변경:

```typescript
import type { ToolHandler, AnalyzerFactory } from './types/index.js';

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // ...
}
```

- [ ] **Step 3: 빌드 및 테스트 확인**

Run: `npm run build && npm test`
Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add src/agent/handlers.ts src/index.ts
git commit -m "refactor(types): handlers/index에서 any 제거, 구체적 타입 적용"
```

---

## Task 5: 타입 안전성 강화 — AnalysisService, CoverageAnalyzer 적용

**Files:**
- Modify: `src/service/AnalysisService.ts`
- Modify: `src/utils/CoverageAnalyzer.ts`

- [ ] **Step 1: AnalysisService.ts의 any 제거**

```typescript
import type { QualityCheckOptions, AnalysisRules } from '../types/index.js';

// Line 48:
// Before: async runAllChecks(options: any = {}): Promise<QualityReport>
// After:
async runAllChecks(options: QualityCheckOptions = {}): Promise<QualityReport>

// Line 59-60: as any → 타입 가드 사용
// Before:
// if (typeof (this.semantic as any).ensureInitialized === 'function')
// After:
if ('ensureInitialized' in this.semantic && typeof this.semantic.ensureInitialized === 'function') {
  await this.semantic.ensureInitialized(false, this.workspacePath);
}

// Line 81-82: as any → 올바른 ViolationType 사용
// Before: { type: 'ENV' as any, ... metadata: { analysisMode: 'full' as any } }
// After: { type: 'ENV' as ViolationType, ... metadata: { analysisMode: 'full' } }

// Line 87:
// Before: private resolveRules(opt: any)
// After:
private resolveRules(opt: QualityCheckOptions): AnalysisRules

// Line 122:
// Before: private async performFileAnalysis(files: string[], opt: any)
// After:
private async performFileAnalysis(files: string[], opt: QualityCheckOptions)

// Line 135:
// Before: private async analyzeFile(f: string, opt: any, batch: Map<string, any>)
// After:
private async analyzeFile(f: string, opt: QualityCheckOptions, batch: Map<string, unknown>)
```

- [ ] **Step 2: CoverageAnalyzer.ts의 any 제거**

```typescript
import type { QualityCheckOptions, AnalysisRules, Violation } from '../types/index.js';

// Line 12:
// Before: async analyze(options: any, rules: any, ...)
// After:
async analyze(
  options: QualityCheckOptions,
  rules: AnalysisRules,
  lastSrcUpdate: number,
  allProjectFiles: string[],
  violations: Violation[],
)

// Line 83:
// Before: private async findCoveragePath(options: any, rules: any)
// After:
private async findCoveragePath(
  options: QualityCheckOptions,
  rules: AnalysisRules,
): Promise<string | undefined>
```

- [ ] **Step 3: 빌드 및 테스트 확인**

Run: `npm run build && npm test`
Expected: 전체 통과. 타입 오류 발생 시 `as unknown as Type` 등으로 점진적 대응.

- [ ] **Step 4: 커밋**

```bash
git add src/service/AnalysisService.ts src/utils/CoverageAnalyzer.ts
git commit -m "refactor(types): AnalysisService/CoverageAnalyzer에서 any 제거"
```

---

## Task 6: Empty Catch 블록 개선 — state.ts (5건)

**Files:**
- Modify: `src/state.ts:40,72,102,115,150`

- [ ] **Step 1: 로깅 유틸 확인**

프로젝트에 로거가 없으므로 `console.warn`으로 최소 로깅. 각 catch 블록에 컨텍스트 정보 포함.

- [ ] **Step 2: state.ts의 5개 empty catch 수정**

```typescript
// Line 40 (constructor — 디렉토리 생성 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[StateManager] 글로벌 저장소 생성 실패:', (e as Error).message);
}

// Line 72 (initContext — 브랜치 조회 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[StateManager] 현재 브랜치 조회 실패, 기본값 사용:', (e as Error).message);
}

// Line 102 (getLastCoverage — 상태 파일 읽기 실패):
// Before: } catch (e) { return null; }
// After:
} catch (e) {
  console.warn('[StateManager] 이전 커버리지 로드 실패:', (e as Error).message);
  return null;
}

// Line 115 (saveCoverage — 상태 저장 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[StateManager] 커버리지 저장 실패:', (e as Error).message);
}

// Line 150 (cleanupOldData — 정리 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[StateManager] 오래된 데이터 정리 실패:', (e as Error).message);
}
```

- [ ] **Step 3: 테스트 확인**

Run: `npm test`
Expected: 전체 통과 (로깅만 추가, 동작 변경 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/state.ts
git commit -m "fix: state.ts empty catch 블록에 경고 로깅 추가 (5건)"
```

---

## Task 7: Empty Catch 블록 개선 — 나머지 모듈 (9건)

**Files:**
- Modify: `src/checkers/security.ts:79`
- Modify: `src/utils/SymbolIndexer.ts:54`
- Modify: `src/analysis/import-check.ts:126`
- Modify: `src/providers/JavascriptProvider.ts:52,156`
- Modify: `src/utils/CoverageAnalyzer.ts:67`

- [ ] **Step 1: security.ts (1건)**

```typescript
// Line 79 (checkPackageAudit — JSON 파싱 실패):
// Before: } catch (inner) {}
// After:
} catch (inner) {
  console.warn('[Security] npm audit 결과 파싱 실패:', (inner as Error).message);
}
```

- [ ] **Step 2: SymbolIndexer.ts (1건)**

```typescript
// Line 54 (indexAll — 개별 파일 인덱싱 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn(`[SymbolIndexer] 파일 인덱싱 실패 (${f}):`, (e as Error).message);
}
```

- [ ] **Step 3: import-check.ts (1건)**

```typescript
// Line 126 (loadAllDependencies — package.json 파싱 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn(`[ImportCheck] package.json 파싱 실패 (${pkgPath}):`, (e as Error).message);
}
```

- [ ] **Step 4: JavascriptProvider.ts (2건)**

```typescript
// Line 52 (check — 네이티브 분석 실패):
// Before: } catch (e) { /* 분석 실패 시 건너뜀 */ }
// After:
} catch (e) {
  console.warn(`[JavascriptProvider] 네이티브 분석 실패 (${filePath}):`, (e as Error).message);
}

// Line 156 (mapNativeViolations — fixSuggestion 생성 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[JavascriptProvider] fixSuggestion 생성 실패:', (e as Error).message);
}
```

- [ ] **Step 5: CoverageAnalyzer.ts (1건)**

```typescript
// Line 67 (analyze — 커버리지 stat 실패):
// Before: } catch (e) {}
// After:
} catch (e) {
  console.warn('[CoverageAnalyzer] 커버리지 파일 stat 실패:', (e as Error).message);
}
```

- [ ] **Step 6: 테스트 확인**

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 7: 커밋**

```bash
git add src/checkers/security.ts src/utils/SymbolIndexer.ts src/analysis/import-check.ts src/providers/JavascriptProvider.ts src/utils/CoverageAnalyzer.ts
git commit -m "fix: 나머지 모듈 empty catch 블록에 경고 로깅 추가 (6건)"
```

---

## Task 8: 테스트 추가 — handlers.ts

**Files:**
- Create: `tests/handlers.test.ts`

- [ ] **Step 1: 테스트 작성**

`tests/handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 네이티브 모듈 mock
vi.mock('../native/index.js', () => ({}));

// SemanticService mock
const mockSemanticSvc = {
  getSymbolMetrics: vi.fn().mockResolvedValue([{ name: 'foo', lines: 10, complexity: 2 }]),
  getSymbolContent: vi.fn().mockResolvedValue('function foo() {}'),
  analyzeImpact: vi.fn().mockResolvedValue({ affected: [] }),
  findReferences: vi.fn().mockResolvedValue([]),
  goToDefinition: vi.fn().mockResolvedValue({ file: 'test.ts', line: 1 }),
  findDeadCode: vi.fn().mockResolvedValue([]),
};

// AnalysisService mock
const mockAnalyzer = {
  runAllChecks: vi.fn().mockResolvedValue({ pass: true, violations: [] }),
};
const mockGetAnalyzer = vi.fn().mockReturnValue(mockAnalyzer);

describe('toolHandlers', () => {
  let toolHandlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/agent/handlers.js');
    toolHandlers = mod.toolHandlers;
  });

  it('guide 도구는 SOP 텍스트를 반환해야 한다', async () => {
    const result = await toolHandlers['guide']({}, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('quality-check 도구는 AnalysisService.runAllChecks를 호출해야 한다', async () => {
    const args = { maxLines: 300 };
    await toolHandlers['quality-check'](args, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(mockGetAnalyzer).toHaveBeenCalledWith('/test');
    expect(mockAnalyzer.runAllChecks).toHaveBeenCalledWith(args);
  });

  it('get-symbol-metrics 도구는 심볼 메트릭을 반환해야 한다', async () => {
    const args = { filePath: 'test.ts' };
    const result = await toolHandlers['get-symbol-metrics'](args, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(mockSemanticSvc.getSymbolMetrics).toHaveBeenCalledWith('test.ts');
    expect(result).toBeDefined();
  });

  it('get-symbol-content 도구는 심볼 내용을 반환해야 한다', async () => {
    const args = { filePath: 'test.ts', symbolName: 'foo' };
    const result = await toolHandlers['get-symbol-content'](args, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(mockSemanticSvc.getSymbolContent).toHaveBeenCalledWith('test.ts', 'foo');
  });

  it('analyze-impact 도구는 영향 분석 결과를 반환해야 한다', async () => {
    const args = { filePath: 'test.ts', symbolName: 'foo' };
    await toolHandlers['analyze-impact'](args, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(mockSemanticSvc.analyzeImpact).toHaveBeenCalled();
  });

  it('find-dead-code 도구는 미사용 코드 목록을 반환해야 한다', async () => {
    const args = { filePath: 'test.ts' };
    await toolHandlers['find-dead-code'](args, mockSemanticSvc, '/test', mockGetAnalyzer);
    expect(mockSemanticSvc.findDeadCode).toHaveBeenCalled();
  });

  it('존재하지 않는 도구는 undefined를 반환해야 한다', async () => {
    expect(toolHandlers['nonexistent-tool']).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run tests/handlers.test.ts`
Expected: 전체 PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/handlers.test.ts
git commit -m "test: MCP 도구 핸들러 테스트 추가 (handlers.ts)"
```

---

## Task 9: 테스트 추가 — ReportService.ts

**Files:**
- Create: `tests/ReportService.test.ts`

- [ ] **Step 1: 테스트 작성**

`tests/ReportService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../native/index.js', () => ({}));

const mockSemantic = {
  getSymbolMetrics: vi.fn().mockResolvedValue([]),
};

const mockStateManager = {
  getLastCoverage: vi.fn().mockResolvedValue(null),
  saveCoverage: vi.fn().mockResolvedValue(undefined),
};

describe('ReportService', () => {
  let ReportService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/service/ReportService.js');
    ReportService = mod.ReportService;
  });

  it('위반 없을 때 pass: true를 반환해야 한다', async () => {
    const svc = new ReportService(mockSemantic, mockStateManager, '/test');
    const report = await svc.assemble({
      violations: [],
      coverage: null,
      techDebtCount: 0,
      filesAnalyzed: 5,
      analysisMode: 'full',
    });
    expect(report.pass).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('위반 있을 때 pass: false를 반환해야 한다', async () => {
    const svc = new ReportService(mockSemantic, mockStateManager, '/test');
    const report = await svc.assemble({
      violations: [{ type: 'SIZE', file: 'big.ts', message: 'Too big', severity: 'error' }],
      coverage: null,
      techDebtCount: 0,
      filesAnalyzed: 5,
      analysisMode: 'full',
    });
    expect(report.pass).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('중복 위반을 제거해야 한다', async () => {
    const svc = new ReportService(mockSemantic, mockStateManager, '/test');
    const dup = { type: 'SIZE', file: 'a.ts', message: 'Too big', severity: 'error' };
    const report = await svc.assemble({
      violations: [dup, { ...dup }, { ...dup }],
      coverage: null,
      techDebtCount: 0,
      filesAnalyzed: 5,
      analysisMode: 'full',
    });
    expect(report.violations.length).toBeLessThan(3);
  });

  it('커버리지 하락 시 경고 위반을 추가해야 한다', async () => {
    mockStateManager.getLastCoverage.mockResolvedValue(90);
    const svc = new ReportService(mockSemantic, mockStateManager, '/test');
    const report = await svc.assemble({
      violations: [],
      coverage: { total: 80 },
      techDebtCount: 0,
      filesAnalyzed: 5,
      analysisMode: 'full',
    });
    // 커버리지가 90 → 80으로 떨어졌으므로 경고 기대
    expect(report.violations.some((v: any) => v.type === 'COVERAGE')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 및 조정**

Run: `npx vitest run tests/ReportService.test.ts`
Expected: ReportService의 실제 `assemble()` 시그니처에 맞게 인자 조정 후 PASS.
Note: 실제 파라미터가 다를 수 있으므로 `ReportService.ts`의 `assemble()` 시그니처를 확인하고 테스트 코드를 맞출 것.

- [ ] **Step 3: 커밋**

```bash
git add tests/ReportService.test.ts
git commit -m "test: ReportService 리포트 조립 테스트 추가"
```

---

## Task 10: 테스트 추가 — TsProgramManager.ts

**Files:**
- Create: `tests/TsProgramManager.test.ts`

- [ ] **Step 1: 테스트 작성**

`tests/TsProgramManager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TsProgramManager } from '../src/utils/TsProgramManager.js';

const testDir = join(process.cwd(), 'temp_tspm_test');
const srcDir = join(testDir, 'src');

beforeEach(() => {
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(
    join(testDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true },
      include: ['src/**/*'],
    }),
  );
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  // 싱글턴 초기화를 위해 인스턴스 리셋
  (TsProgramManager as any).instance = null;
});

describe('TsProgramManager', () => {
  it('싱글턴 인스턴스를 반환해야 한다', () => {
    const a = TsProgramManager.getInstance();
    const b = TsProgramManager.getInstance();
    expect(a).toBe(b);
  });

  it('tsconfig.json이 있는 프로젝트에서 초기화되어야 한다', () => {
    const validFile = join(srcDir, 'valid.ts');
    writeFileSync(validFile, 'export const x: number = 1;');

    const mgr = TsProgramManager.getInstance();
    mgr.init(testDir, [validFile]);
    // init이 에러 없이 완료되면 성공
  });

  it('존재하지 않는 심볼 사용 시 환각으로 탐지해야 한다', () => {
    const badFile = join(srcDir, 'bad.ts');
    writeFileSync(badFile, `
      import { nonExistentFunction } from './nowhere';
      nonExistentFunction();
    `);

    const mgr = TsProgramManager.getInstance();
    mgr.init(testDir, [badFile]);
    const hallucinations = mgr.getHallucinations(badFile);
    expect(hallucinations.length).toBeGreaterThan(0);
  });

  it('정상 코드에서는 환각을 탐지하지 않아야 한다', () => {
    const goodFile = join(srcDir, 'good.ts');
    writeFileSync(goodFile, 'export const hello = "world";');

    const mgr = TsProgramManager.getInstance();
    mgr.init(testDir, [goodFile]);
    const hallucinations = mgr.getHallucinations(goodFile);
    expect(hallucinations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run tests/TsProgramManager.test.ts`
Expected: PASS (실제 TypeScript 컴파일러 사용)

- [ ] **Step 3: 커밋**

```bash
git add tests/TsProgramManager.test.ts
git commit -m "test: TsProgramManager 환각 탐지 테스트 추가"
```

---

## Task 11: 테스트 추가 — cli.ts

**Files:**
- Create: `tests/cli.test.ts`

- [ ] **Step 1: 테스트 작성**

`tests/cli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts');

function runCLI(args: string): string {
  try {
    return execSync(`npx tsx ${CLI_PATH} ${args}`, {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 10000,
    }).toString();
  } catch (e: any) {
    return e.stdout?.toString() || e.stderr?.toString() || '';
  }
}

describe('CLI', () => {
  it('--help 플래그로 사용법을 출력해야 한다', () => {
    const output = runCLI('--help');
    expect(output).toContain('fast-lint-mcp');
  });

  it('-h 축약 플래그도 동작해야 한다', () => {
    const output = runCLI('-h');
    expect(output).toContain('fast-lint-mcp');
  });

  it('--version 플래그로 버전을 출력해야 한다', () => {
    const output = runCLI('--version');
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it('-v 축약 플래그도 동작해야 한다', () => {
    const output = runCLI('-v');
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/cli.test.ts
git commit -m "test: CLI 명령어 파싱 테스트 추가 (--help, --version)"
```

---

## Task 12: 대형 파일 분리 — AnalysisUtils에서 StructuralIntegrity 추출

**Files:**
- Create: `src/utils/StructuralIntegrity.ts`
- Modify: `src/utils/AnalysisUtils.ts:194-278`

- [ ] **Step 1: 현재 코드 확인**

`src/utils/AnalysisUtils.ts`의 `checkStructuralIntegrity()` 함수(약 85줄, line 194-278)를 확인.

- [ ] **Step 2: StructuralIntegrity.ts 생성**

`src/utils/StructuralIntegrity.ts`:

```typescript
import { readFileSync } from 'fs';
import type { Violation, ViolationType } from '../types/index.js';
import type { DependencyGraph } from './DependencyGraph.js';

/**
 * checkStructuralIntegrity: 순환 의존성 및 계층 아키텍처 검증
 * AnalysisUtils.ts에서 추출됨
 */
export function checkStructuralIntegrity(
  depGraph: DependencyGraph,
  allFiles: string[],
): Violation[] {
  // AnalysisUtils.ts의 line 194-278 내용을 그대로 이동
  // (실제 구현 시 해당 코드를 복사)
}
```

Note: 실제 구현 시 `AnalysisUtils.ts`에서 `checkStructuralIntegrity` 함수 본문 전체를 복사하고, 필요한 import를 정리할 것.

- [ ] **Step 3: AnalysisUtils.ts에서 re-export**

`src/utils/AnalysisUtils.ts`에서 원래 함수를 제거하고 re-export:

```typescript
// 기존 checkStructuralIntegrity 함수 본문 제거
// 대신 re-export 추가:
export { checkStructuralIntegrity } from './StructuralIntegrity.js';
```

- [ ] **Step 4: 빌드 및 테스트 확인**

Run: `npm run build && npm test`
Expected: 전체 통과 (re-export 덕분에 기존 import는 깨지지 않음)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/StructuralIntegrity.ts src/utils/AnalysisUtils.ts
git commit -m "refactor: checkStructuralIntegrity를 StructuralIntegrity.ts로 분리"
```

---

## Task 13: 대형 파일 분리 — JavascriptProvider에서 ComplexityAdvisor 추출

**Files:**
- Create: `src/providers/ComplexityAdvisor.ts`
- Modify: `src/providers/JavascriptProvider.ts:209-268`

- [ ] **Step 1: ComplexityAdvisor.ts 생성**

`src/providers/ComplexityAdvisor.ts`:

```typescript
import { readFileSync } from 'fs';

/**
 * generateComplexityAdvice: AST 패턴 기반 복잡도 해결 가이드 생성
 * JavascriptProvider.ts에서 추출됨
 */
export function generateComplexityAdvice(
  filePath: string,
  giantSymbol: { name: string; line: number; endLine?: number } | undefined,
  functionCount: number,
): string {
  // JavascriptProvider.ts의 line 209-268 내용을 그대로 이동
  // (실제 구현 시 해당 코드를 복사)
}
```

Note: 실제 구현 시 `JavascriptProvider.ts`의 `generateComplexityAdvice` 메서드 본문을 이동하고, `this` 참조가 없는지 확인할 것. 만약 private 상태에 의존한다면 파라미터로 주입.

- [ ] **Step 2: JavascriptProvider.ts에서 호출 변경**

```typescript
import { generateComplexityAdvice } from './ComplexityAdvisor.js';

// 기존 메서드 제거, 대신 import한 함수 호출:
// Before (클래스 메서드):
// private generateComplexityAdvice(filePath, giantSymbol, functionCount) { ... }
// After:
// 사용처에서 this.generateComplexityAdvice(...) → generateComplexityAdvice(...) 로 변경
```

- [ ] **Step 3: 빌드 및 테스트 확인**

Run: `npm run build && npm test`
Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add src/providers/ComplexityAdvisor.ts src/providers/JavascriptProvider.ts
git commit -m "refactor: generateComplexityAdvice를 ComplexityAdvisor.ts로 분리"
```

---

## Task 14: 최종 검증 및 정리

**Files:**
- 전체 프로젝트

- [ ] **Step 1: 전체 빌드 확인**

Run: `npm run build`
Expected: 에러 0건

- [ ] **Step 2: 전체 테스트 실행**

Run: `npm test`
Expected: 기존 175건 + 신규 테스트 전체 PASS, 실패 0건

- [ ] **Step 3: any 잔여 확인**

Run: `grep -rn ': any' src/ --include='*.ts' | grep -v node_modules | grep -v '.test.'`
Expected: 최소한으로 줄어들었는지 확인. 완전 제거가 어려운 경우 목록 기록.

- [ ] **Step 4: empty catch 잔여 확인**

Run: `grep -rn 'catch.*{.*}' src/ --include='*.ts' | grep -v '//'`
Expected: 빈 catch 블록 0건

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "chore: 코드 품질 개선 Phase 완료 — 최종 정리"
```
