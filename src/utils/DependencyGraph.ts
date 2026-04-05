import { dirname, normalize, join, isAbsolute, extname } from 'path';
import { existsSync } from 'fs';
import { findNearestProjectRoot } from './PathResolver.js';
import {
  extractImportsNative,
  scanFiles,
  resolveModulePathNative,
  parseTsconfigPaths,
  detectCyclesNative,
} from '../../native/index.js';
import { SYSTEM } from '../constants.js';

/**
 * 프로젝트 내 파일 간의 의존성 관계(Import/Export)를 분석하고 그래프 구조를 관리하는 클래스입니다.
 * v0.0.1: Rust Native 엔진을 사용하여 프로젝트 전체 임포트를 초고속으로 병렬 추출합니다.
 */
export class DependencyGraph {
  /** 각 파일이 임포트하고 있는 대상 목록 (File -> Imports) */
  private importMap: Map<string, string[]> = new Map();
  /** 각 파일을 임포트하고 있는 상위 파일 목록 (File -> Dependents) */
  private dependentMap: Map<string, Set<string>> = new Map();

  /**
   * DependencyGraph 인스턴스를 생성합니다.
   * @param workspacePath 분석할 워크스페이스 절대 경로
   */
  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 프로젝트 내의 모든 소스 파일을 스캔하여 의존성 맵을 생성합니다.
   * v0.0.1 Turbo: 러스트 네이티브 병렬 추출 및 경로 해석을 통해 I/O 병목을 제거합니다.
   * @param providedFiles 이미 스캔된 파일 목록이 있다면 이를 활용합니다.
   */
  async build(providedFiles?: string[]) {
    this.importMap.clear();
    this.dependentMap.clear();

    // 1. 파일 목록 확보 (없으면 네이티브 스캐너 가동)
    let allFiles: string[] = [];
    if (providedFiles) {
      allFiles = providedFiles.map((f) => normalize(f));
    } else {
      allFiles = scanFiles(this.workspacePath, SYSTEM.DEFAULT_IGNORE_PATTERNS).map((f) =>
        normalize(f)
      );
    }

    // 2. TSConfig Alias 설정 로드
    const projectRoot = findNearestProjectRoot(this.workspacePath);
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    const tsconfig = existsSync(tsconfigPath) ? parseTsconfigPaths(tsconfigPath) : null;

    // 3. Rust Native 엔진을 통해 전 파일 임포트 구문을 병렬로 긁어옵니다.
    const nativeResults = extractImportsNative(allFiles);

    // 4. 추출된 임포트 원본을 네이티브 리졸버로 해소하여 그래프를 완성합니다.
    for (const res of nativeResults) {
      const file = normalize(res.file);
      const dir = dirname(file);
      const resolvedImports: string[] = [];

      for (const source of res.imports) {
        // v0.0.1: Native Resolver 호출 (I/O 캐시 활용)
        const resolved = resolveModulePathNative(
          dir,
          source,
          this.workspacePath,
          tsconfig?.baseUrl || null,
          tsconfig?.paths || null
        );

        if (resolved) {
          resolvedImports.push(normalize(resolved));
        }
      }

      const uniqueImports = [...new Set(resolvedImports)];
      this.importMap.set(file, uniqueImports);

      // 역의존성 맵 구축
      for (const imp of uniqueImports) {
        if (!this.dependentMap.has(imp)) {
          this.dependentMap.set(imp, new Set());
        }
        this.dependentMap.get(imp)!.add(file);  // O(1)
      }
    }
  }

  /**
   * 특정 파일을 임포트하고 있는 상위 파일(Dependents) 목록을 가져옵니다.
   * @param filePath 대상 파일 경로
   */
  getDependents(filePath: string): string[] {
    const deps = this.dependentMap.get(normalize(filePath));
    return deps ? Array.from(deps) : [];
  }

  /**
   * 특정 파일이 임포트하고 있는 하위 파일(Dependencies) 목록을 가져옵니다.
   * @param filePath 대상 파일 경로
   */
  getDependencies(filePath: string): string[] {
    return this.importMap.get(normalize(filePath)) || [];
  }

  /**
   * 그래프에 등록된 모든 파일 경로 목록을 반환합니다.
   */
  getAllFiles(): string[] {
    return Array.from(this.importMap.keys());
  }

  /**
   * 프로젝트 내의 순환 참조(Circular Dependency)를 탐지합니다.
   * v0.0.1: Rust Native petgraph 엔진을 사용하여 O(V+E) 속도로 즉시 추출합니다.
   */
  detectCycles(): string[][] {
    try {
      const importEntries = Object.fromEntries(this.importMap);
      return detectCyclesNative(importEntries);
    } catch (e) {
      return [];
    }
  }
}
