import { readFileSync, existsSync } from 'fs';
import { dirname, join, normalize, isAbsolute } from 'path';
import {
  scanFiles,
  checkFakeLogicNative,
  checkArchitectureNative,
  verifyHallucinationNative,
  extractSymbolsNative,
} from '../../native/index.js';
import { loadProjectAliases } from '../utils/PathResolver.js';
import { ArchitectureRule } from '../config.js';
import { builtinModules } from 'module';

import { SYSTEM } from '../constants.js';

/** 프로젝트 파일 목록 캐시를 위한 내부 변수 */
let projectFilesCache: { key: string; files: string[] } | null = null;

/**
 * 프로젝트 내의 모든 파일 목록을 가져옵니다. (v5.0: 시스템 레벨 노이즈 차단 강화)
 */
export async function getProjectFiles(
  workspacePath: string,
  ignorePatterns: string[] = []
): Promise<string[]> {
  // v5.0: 시스템 기본 패턴과 사용자가 제공한 패턴을 병합
  const combinedPatterns = Array.from(
    new Set([...SYSTEM.DEFAULT_IGNORE_PATTERNS, ...ignorePatterns])
  );

  const cacheKey = `${workspacePath}:${combinedPatterns.sort().join(',')}`;
  if (projectFilesCache && projectFilesCache.key === cacheKey) {
    return projectFilesCache.files;
  }

  // v0.0.1: Rust Native Scanner를 사용하여 .gitignore를 준수하며 고속 탐색
  const files = scanFiles(workspacePath, combinedPatterns).map((f) => normalize(f));

  projectFilesCache = { key: cacheKey, files };
  return files;
}

/**
 * 프로젝트 파일 캐시를 초기화합니다.
 */
export function clearProjectFilesCache() {
  projectFilesCache = null;
}

/**
 * 레이어 간 의존성 방향(아키텍처 규칙)이 올바른지 검사합니다.
 * v0.0.1: Rust Native 엔진을 사용하여 대규모 프로젝트에서도 고속 아키텍처 검증을 수행합니다.
 */
export async function checkArchitecture(
  filePath: string,
  rules: ArchitectureRule[],
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];

  // v0.0.1: Rust Native 검사기 호출
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);

  const violations = checkArchitectureNative(absoluteFilePath, rules, workspacePath);

  return violations.map((v) => ({
    id: v.type,
    message: v.message,
  }));
}

/**
 * AI 에이전트의 환각(Hallucination) 탐지
 * v0.0.1: Rust Native 엔진을 사용하여 고속 환각 탐지를 수행합니다.
 */
export async function checkHallucination(
  filePath: string,
  workspacePath: string = process.cwd()
): Promise<{ id: string; message: string }[]> {
  if (!existsSync(filePath)) return [];

  const dependencies = await loadAllDependencies(filePath, workspacePath);
  const absoluteFilePath = isAbsolute(filePath) ? filePath : join(workspacePath, filePath);
  const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

  // v0.0.1: Rust Native 환각 탐지기 호출
  const violations = verifyHallucinationNative(
    absoluteFilePath,
    [], // local_defs (Rust에서 내부적으로 추출 가능하면 비워둠)
    [], // imports (Rust에서 내부적으로 추출 가능하면 비워둠)
    nodeBuiltins,
    dependencies // external_exports로 dependencies 전달
  );

  return violations.map((v) => ({
    id: 'HALLUCINATION',
    message: `[AI Hallucination] 존재하지 않는 API 호출: ${v.name}`,
    line: v.line,
  }));
}

/**
 * 프로젝트의 모든 의존성( dependencies + devDependencies )을 계층적으로 로드합니다.
 * v3.7.6: 상위 디렉토리로 올라가며 모든 package.json을 합산하여 모노레포 및 중첩 구조 지원.
 */
async function loadAllDependencies(filePath: string, workspacePath: string): Promise<string[]> {
  const deps = new Set<string>();
  let currentDir = dirname(isAbsolute(filePath) ? filePath : join(workspacePath, filePath));

  const load = (p: string) => {
    if (!existsSync(p)) return;
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      const all = Object.keys(pkg.dependencies || {}).concat(
        Object.keys(pkg.devDependencies || {})
      );
      all.forEach((d) => deps.add(d));
    } catch (e) {
      /* ignore */
    }
  };

  // 상위로 올라가며 모든 package.json 로드
  while (currentDir.length >= workspacePath.length) {
    load(join(currentDir, 'package.json'));
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  load(join(workspacePath, 'package.json'));

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

  // 파일 전체 내용을 읽어 본문 추출 (심볼별 본문 추출 기능이 Rust에 있다면 더 좋음)
  const content = readFileSync(absoluteFilePath, 'utf-8');
  const lines = content.split('\n');

  for (const s of symbols) {
    if (s.kind !== 'function' && s.kind !== 'method') continue;
    if (s.name.startsWith('get') || s.name.startsWith('is') || s.name === 'render') continue;

    // 대략적인 본문 추출 (line 기반)
    const body = lines.slice(s.line - 1, s.endLine).join('\n');

    // 파라미터 정보가 필요함 (SymbolResult에 parameter_count는 있지만 이름은 없음)
    // TODO: parser.rs에서 파라미터 이름을 반환하도록 개선 필요.
    // 현재는 SymbolResult 구조체에 파라미터 이름 목록이 없으므로,
    // 임시로 parameter_count > 0 인 경우 본문에서 추출 시도하거나 Native에서 직접 처리하도록 설계 변경 권장.

    // v0.0.1: Native Regex 스캐너 호출
    // 현재 checkFakeLogicNative는 (body, params)를 받음.
    // 임시 방편으로 본문의 첫 줄에서 파라미터 이름을 추출하는 로직 추가 (추후 Rust 엔진으로 완전 이전 권장)
    const firstLine = lines[s.line - 1];
    const paramMatch = firstLine.match(/\((.*?)\)/);
    if (paramMatch && body.includes('return ')) {
      const pList = paramMatch[1]
        .split(',')
        .map((p) => p.trim().split(':')[0].trim())
        .filter((p) => p.length > 0 && !['props', 'req', 'res', 'next', 'ctx'].includes(p));

      if (pList.length > 0) {
        const unusedParams = checkFakeLogicNative(body, pList);
        if (unusedParams.length === pList.length) {
          violations.push({
            id: 'FAKE_LOGIC_CONST',
            line: s.line,
            message: `[${s.name}] 파라미터를 사용하지 않는 의심스러운 로직 (가짜 구현 가능성)`,
          });
        }
      }
    }
  }

  return violations;
}
