import { readFileSync, existsSync } from 'fs';
import { dirname, join, normalize, isAbsolute, extname } from 'path';
import {
  scanFiles,
  checkFakeLogicNative,
  checkArchitectureNative,
  verifyHallucinationNative,
  extractSymbolsNative,
} from '../../native/index.js';
import { ArchitectureRule, Violation } from '../types/index.js';
import { builtinModules } from 'module';

/**
 * 프로젝트 내의 모든 소스 파일 목록을 가져옵니다.
 */
export async function getProjectFiles(workspacePath: string, ignorePatterns: string[] = []) {
  return scanFiles(workspacePath, ignorePatterns);
}

/** 프로젝트 파일 캐시를 초기화합니다. */
export function clearProjectFilesCache() {
  // Native 레벨에서 캐시 관리 (필요 시 호출)
}

/**
 * 아키텍처 의존성 규칙을 검사합니다.
 * v0.0.1: Rust Native 검사기를 사용하여 고속 검증을 수행합니다.
 */
export async function checkArchitecture(
  filePath: string,
  rules: ArchitectureRule[],
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];

  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const violations = checkArchitectureNative(absoluteFilePath, rules, workspacePath);

  return violations.map((v) => ({
    id: v.type,
    message: v.message,
  }));
}

/**
 * 파일 내용에서 임포트된 심볼 목록을 추출합니다.
 */
export function extractImportsFromFile(content: string): string[] {
  const imports: string[] = [];
  
  // v3.8.0: 가장 강력하고 유연한 임포트 추출 로직
  const rawImportRegex = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"].*?['"]/g;
  let match;
  while ((match = rawImportRegex.exec(content)) !== null) {
    const rawMatch = match[1].trim();
    
    if (rawMatch.includes('{')) {
      const innerMatch = rawMatch.match(/\{([\s\S]*?)\}/);
      if (innerMatch) {
        innerMatch[1].split(',').forEach(s => {
          const trimmed = s.trim();
          if (!trimmed) return;
          const parts = trimmed.split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim().replace(/^type\s+/, '');
          if (name) imports.push(name);
        });
      }
      const beforeBrace = rawMatch.split('{')[0].trim().replace(/,$/, '').trim();
      if (beforeBrace && !beforeBrace.includes('* as ')) imports.push(beforeBrace);
    } 
    else if (rawMatch.includes('* as ')) {
      const name = rawMatch.split('* as ')[1].trim().split(/\s+/)[0];
      if (name) imports.push(name);
    } 
    else {
      const name = rawMatch.split(/\s+/)[0];
      if (name) imports.push(name);
    }
  }
  return imports;
}

/**
 * AI 에이전트의 환각(Hallucination) 탐지
 * v0.0.1: Rust Native 엔진을 사용하여 고속 환각 탐지를 수행합니다.
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string; line?: number }[]> {
  // v3.8.1: JS/TS 파일이 아닌 경우 환각 검사 스킵 (오탐 방지)
  const ext = extname(filePath).toLowerCase();
  if (!['.js', '.ts', '.jsx', '.tsx'].includes(ext)) return [];

  if (!existsSync(filePath)) return [];

  const dependencies = await loadAllDependencies(filePath, workspacePath);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

  // v3.8.2: 프레임워크 및 환경별 전역 심볼 추가
  const frameworkGlobals: string[] = [];
  
  // 1. 테스트 환경 감지
  if (filePath.includes('/tests/') || filePath.includes('/__tests__/') || filePath.match(/\.(test|spec)\./)) {
    frameworkGlobals.push(
      'describe', 'it', 'test', 'expect', 'vi', 'jest', 'beforeEach', 'afterEach', 
      'beforeAll', 'afterAll', 'fixture', 'assert', 'chai',
      'render', 'renderHook', 'fireEvent', 'waitFor', 'waitForElementToBeRemoved', 'act', 'screen', 'within', 'userEvent'
    );
  }

  // 2. Next.js / React 감지 (dependencies 기반)
  const isNext = dependencies.some(d => d === 'next');
  const isReact = dependencies.some(d => d === 'react');

  if (isNext || isReact) {
    frameworkGlobals.push('React', 'JSX', 'Fragment', 'useEffect', 'useState', 'useMemo', 'useCallback');
    if (isNext) {
      // Next.js 예약어 및 컴포넌트명
      const fileName = filePath.split('/').pop() || '';
      if (fileName.match(/^(layout|page|route|template|loading|error|not-found)\.[tj]sx?$/)) {
        frameworkGlobals.push('RootLayout', 'Home', 'Metadata', 'generateMetadata', 'dynamic', 'revalidate', 'viewport', 'config');
      }
    }
  }

  const content = readFileSync(absoluteFilePath, 'utf-8');
  const imports = extractImportsFromFile(content);

  const violations = verifyHallucinationNative(
    absoluteFilePath,
    [], 
    [...imports, ...frameworkGlobals], // 프레임워크 전역 심볼 포함
    nodeBuiltins,
    dependencies 
  );

  return violations.map((v) => ({
    id: 'HALLUCINATION',
    message: `[AI Hallucination] 존재하지 않는 API 호출: ${v.name}`,
    line: v.line,
  }));
}

/** 해당 파일이 의존하는 패키지 목록을 수집합니다. */
async function loadAllDependencies(filePath: string, workspacePath: string): Promise<string[]> {
  const deps = new Set<string>();
  let currentDir = dirname(filePath);

  const readPackageJson = (pkgPath: string) => {
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.dependencies) Object.keys(pkg.dependencies).forEach((d) => deps.add(d));
        if (pkg.devDependencies) Object.keys(pkg.devDependencies).forEach((d) => deps.add(d));
      } catch (e) {}
    }
  };

  while (currentDir.length >= workspacePath.length) {
    readPackageJson(join(currentDir, 'package.json'));
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  readPackageJson(join(workspacePath, 'package.json'));
  return Array.from(deps);
}

/**
 * 에이전트의 '가짜 구현(Fake Logic)' 여부를 탐지합니다.
 * v0.0.1: Rust Native 엔진을 사용하여 고속 논리 검증을 수행합니다.
 */
export async function checkFakeLogic(
  filePath: string
): Promise<{ id: string; message: string; line?: number }[]> {
  if (!existsSync(filePath)) return [];

  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  const symbols = extractSymbolsNative(absoluteFilePath);
  const violations: { id: string; message: string; line?: number }[] = [];

  const content = readFileSync(absoluteFilePath, 'utf-8');
  const lines = content.split('\n');

  for (const s of symbols) {
    if (!shouldCheckFakeLogic(s)) continue;

    const body = lines.slice(s.line - 1, s.endLine).join('\n');
    const params = extractParamsFromLine(lines[s.line - 1]);

    if (params.length > 0 && body.includes('return ')) {
      const unusedParams = checkFakeLogicNative(body, params);
      if (unusedParams.length === params.length) {
        violations.push({
          id: 'FAKE_LOGIC_CONST',
          line: s.line,
          message: `[${s.name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)`,
        });
      }
    }
  }
  return violations;
}

// shouldCheckFakeLogic 함수는 내부 로직을 처리합니다.
function shouldCheckFakeLogic(s: any): boolean {
  if (s.kind !== 'function' && s.kind !== 'method') return false;
  if (s.name.startsWith('get') || s.name.startsWith('is') || s.name === 'render') return false;
  return true;
}

// extractParamsFromLine 함수는 내부 로직을 처리합니다.
function extractParamsFromLine(line: string): string[] {
  const match = line.match(/\((.*?)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((p) => p.trim().split(':')[0].trim())
    .filter((p) => p.length > 0 && !['props', 'req', 'res', 'next', 'ctx'].includes(p));
}
