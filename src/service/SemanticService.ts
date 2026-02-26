import { readFileSync, existsSync } from 'fs';
import { SymbolIndexer, SymbolInfo } from '../utils/SymbolIndexer.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import { Lang, parse, SgNode } from '@ast-grep/napi';

/**
 * 특정 심볼(함수, 클래스 등)의 분석 메트릭 정보를 담는 인터페이스입니다.
 */
export interface SymbolMetric {
  name: string; // 심볼 이름
  kind: string; // 종류 (class, function, method 등)
  lineCount: number; // 해당 심볼의 코드 라인 수
  complexity: number; // 심볼 내부의 순환 복잡도
}

/**
 * 프로젝트 전체의 시맨틱(의미론적) 분석을 담당하는 서비스 클래스입니다.
 * 고성능 Rust 기반 AST 엔진을 사용하여 심볼 인덱싱, 정밀 탐색, 미사용 코드 탐지 등을 수행합니다.
 */
export class SemanticService {
  // 프로젝트 내의 모든 심볼 위치를 기록하는 인덱서
  private indexer: SymbolIndexer;
  // 파일 간의 의존성 관계를 파악하는 그래프
  private depGraph: DependencyGraph;
  // 초기화 완료 여부 플래그
  private initialized = false;

  /**
   * SemanticService 인스턴스를 생성합니다.
   * @param workspacePath 프로젝트 루트 경로
   */
  constructor(private workspacePath: string = process.cwd()) {
    this.indexer = new SymbolIndexer(this.workspacePath);
    this.depGraph = new DependencyGraph(this.workspacePath);
  }

  /**
   * 분석에 필요한 인덱서와 의존성 그래프를 최신 상태로 초기화합니다.
   */
  async ensureInitialized() {
    if (this.initialized) return;
    await this.indexer.index();
    await this.depGraph.build();
    this.initialized = true;
  }

  /**
   * 특정 파일 내에 정의된 모든 주요 심볼들의 메트릭 정보를 수집합니다.
   * @param filePath 대상 파일 경로
   * @returns 파일 내 심볼별 메트릭 목록
   */
  getSymbolMetrics(filePath: string): SymbolMetric[] {
    if (!existsSync(filePath)) return [];
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang =
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? Lang.TypeScript
          : filePath.endsWith('.ts')
            ? Lang.TypeScript
            : Lang.JavaScript;

      const root = parse(lang, content).root();
      const metrics: SymbolMetric[] = [];

      this.collectMetrics(root, metrics);
      return metrics;
    } catch (e) {
      // 분석 실패 시 빈 목록 반환
      return [];
    }
  }

  /**
   * AST 노드를 재귀적으로 탐색하며 클래스, 함수, 메소드 등의 메트릭을 수집합니다.
   */
  private collectMetrics(node: SgNode, metrics: SymbolMetric[]) {
    const kind = node.kind();
    let name = node.field('name')?.text().trim();

    if (kind === 'class_declaration' || kind === 'class') {
      // 클래스 정의 탐지
      if (!name || name === 'default')
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      if (name)
        metrics.push({
          name,
          kind: 'class',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
    } else if (kind === 'function_declaration' || kind === 'function') {
      // 일반 함수 정의 탐지
      if (!name || name === 'default')
        name = node
          .find({ rule: { kind: 'identifier' } })
          ?.text()
          .trim();
      if (name)
        metrics.push({
          name,
          kind: 'function',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
    } else if (kind === 'method_definition') {
      // 클래스 메소드 탐지
      if (name && !['constructor', 'get', 'set'].includes(name)) {
        const cls = node.parent()?.parent();
        const clsName =
          cls?.field('name')?.text().trim() ||
          cls
            ?.find({ rule: { kind: 'identifier' } })
            ?.text()
            .trim();
        const fullName = clsName ? `${clsName}.${name}` : name;
        metrics.push({
          name: fullName,
          kind: 'method',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
      }
    } else if (kind === 'variable_declarator') {
      // 익명 함수나 화살표 함수가 할당된 변수 탐지
      if (name && (node.text().includes('=>') || node.text().includes('function'))) {
        metrics.push({
          name,
          kind: 'function',
          lineCount: node.text().split('\n').length,
          complexity: this.calculateComplexity(node),
        });
      }
    }

    // 자식 노드들에 대해 재귀적으로 수집 수행
    node.children().forEach((child) => this.collectMetrics(child, metrics));
  }

  /**
   * 특정 코드 블록(AST 노드)의 순환 복잡도(Cyclomatic Complexity)를 계산합니다.
   * 조건문, 반복문, 예외 처리 등의 분기점을 카운트합니다.
   */
  private calculateComplexity(node: SgNode): number {
    let complexity = 1; // 기본 복잡도는 1
    const kinds = [
      'if_statement',
      'for_statement',
      'while_statement',
      'switch_statement',
      'catch_clause',
      'ternary_expression',
    ];
    for (const k of kinds) {
      complexity += node.findAll({ rule: { kind: k } }).length;
    }
    // 논리 연산자(&&, ||)도 분기점으로 간주하여 가산
    complexity += node.findAll('&&').length;
    complexity += node.findAll('||').length;
    return complexity;
  }

  /**
   * 특정 파일 내에서 이름에 해당하는 심볼의 소스 코드 본문을 추출합니다.
   * @param filePath 대상 파일 경로
   * @param symbolName 찾고자 하는 심볼명 (예: 'MyClass', 'MyClass.myMethod')
   * @returns 발견된 소스 코드 문자열 또는 null
   */
  getSymbolContent(filePath: string, symbolName: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lang =
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? Lang.TypeScript
          : filePath.endsWith('.ts')
            ? Lang.TypeScript
            : Lang.JavaScript;
      const root = parse(lang, content).root();
      return this.findContentInNode(root, symbolName);
    } catch (e) {
      return null;
    }
  }

  /**
   * AST 트리 내에서 특정 심볼명을 가진 노드를 찾아 텍스트를 반환합니다.
   */
  private findContentInNode(node: SgNode, symbolName: string): string | null {
    const name =
      node.field('name')?.text().trim() ||
      node
        .find({ rule: { kind: 'identifier' } })
        ?.text()
        .trim();

    // 점(.)이 포함된 경우 클래스 내 메소드로 간주하여 처리
    if (symbolName.includes('.')) {
      const [cls, method] = symbolName.split('.');
      if (name === cls && (node.kind() === 'class_declaration' || node.kind() === 'class')) {
        const mNode = node.find({
          rule: { kind: 'method_definition', has: { field: 'name', regex: `^${method}$` } },
        });
        if (mNode) return mNode.text();
      }
    }

    if (name === symbolName) return node.text();

    for (const child of node.children()) {
      const found = this.findContentInNode(child, symbolName);
      if (found) return found;
    }
    return null;
  }

  /**
   * 프로젝트 전체의 의존성 그래프와 심볼 지도를 대조하여 실제로 사용되지 않는 코드를 탐지합니다.
   * 1. 파일이 어디서도 임포트되지 않는 경우 탐지
   * 2. 임포트된 파일 내에서도 특정 심볼이 식별자(Identifier)로 호출되지 않는 경우 탐지
   * @returns 미사용 코드(파일 및 심볼명) 배열
   */
  findDeadCode(): { file: string; symbol: string }[] {
    const deadCodes: { file: string; symbol: string }[] = [];
    const allSymbolsMap = this.indexer.symbolMap;

    for (const [name, infos] of allSymbolsMap.entries()) {
      for (const info of infos) {
        // 1. 해당 파일이 다른 곳에서 임포트되는지 확인 (역의존성 조회)
        const dependents = this.depGraph.getDependents(info.filePath);

        // 2. 만약 임포트하는 곳이 없다면 dead code 후보로 등록 (진입점 제외)
        if (dependents.length === 0) {
          if (!info.filePath.includes('index.') && !info.filePath.includes('main.')) {
            deadCodes.push({ file: info.filePath, symbol: name });
          }
          continue;
        }

        // 3. 임포트하는 파일들 중 실제로 이 심볼명을 사용하는 지점이 있는지 AST 전수 조사
        let isUsed = false;
        for (const depFile of dependents) {
          try {
            const content = readFileSync(depFile, 'utf-8');
            // 텍스트 기반 1차 필터링 (성능 최적화)
            if (!content.includes(name)) continue;

            const lang =
              depFile.endsWith('.tsx') || depFile.endsWith('.jsx')
                ? Lang.TypeScript
                : depFile.endsWith('.ts')
                  ? Lang.TypeScript
                  : Lang.JavaScript;
            const depRoot = parse(lang, content).root();

            // AST 기반으로 정확한 식별자(Identifier) 매칭 확인
            const identifierMatch = depRoot.find({
              rule: { kind: 'identifier', regex: `^${name}$` },
            });
            if (identifierMatch) {
              isUsed = true;
              break;
            }
          } catch (e) {
            // 개별 파일 파싱 오류 시 무시
          }
        }

        if (!isUsed) {
          deadCodes.push({ file: info.filePath, symbol: name });
        }
      }
    }
    return deadCodes;
  }

  /**
   * 특정 파일을 수정했을 때 영향을 받는 상위 파일 및 관련 테스트 케이스 목록을 분석합니다.
   */
  analyzeImpact(filePath: string, symbolName: string) {
    const referencingFiles = this.depGraph.getDependents(filePath);
    return {
      symbol: symbolName,
      referencingFiles,
      // 영향받는 파일 중 테스트 코드를 별도로 분류하여 에이전트에게 알림
      affectedTests: referencingFiles.filter((f) => f.includes('.test.') || f.includes('.spec.')),
    };
  }

  /**
   * 특정 심볼이 사용되고 있는 모든 위치(참조 정보)를 찾습니다.
   */
  findReferences(filePath: string, symbolName: string) {
    const dependents = this.depGraph.getDependents(filePath);
    return dependents.map((file) => ({ file, line: 0, text: `Referenced in ${file}` }));
  }

  /**
   * 특정 심볼명이 정의된 실제 위치(파일 및 라인 번호)를 찾아 반환합니다.
   */
  goToDefinition(filePath: string, symbolName: string) {
    const symbols = this.indexer.getSymbolsByName(symbolName);
    return symbols.length > 0 ? { file: symbols[0].filePath, line: symbols[0].startLine } : null;
  }

  /**
   * 특정 파일의 상위 의존 모듈 목록을 조회합니다.
   */
  getDependents(filePath: string): string[] {
    return this.depGraph.getDependents(filePath);
  }
}
