import { Project, Node, SyntaxKind, FunctionDeclaration, MethodDeclaration, ClassDeclaration, Symbol } from 'ts-morph';
import { join } from 'path';
import { existsSync } from 'fs';
import os from 'os';

export interface SymbolMetric {
  name: string;
  kind: string;
  lineCount: number;
  complexity: number;
  startLine: number;
  endLine: number;
  codeSnippet: string; // 처음 10줄만 요약
}

export interface DeadCode {
  file: string;
  symbol: string;
  kind: string;
  line: number;
}

export interface ImpactAnalysis {
  targetSymbol: string;
  referencingFiles: string[];
  affectedTests: string[];
}

export class SemanticService {
  private project: Project | null = null;
  private isInitialized = false;

  constructor(private workspacePath: string = process.cwd()) {}

  /**
   * 지연 초기화: 처음 요청이 들어올 때 프로젝트를 로드함 (메모리 절약)
   */
  private ensureInitialized() {
    if (this.isInitialized && this.project) return;

    const tsConfigPath = join(this.workspacePath, 'tsconfig.json');
    
    const baseOptions = {
      compilerOptions: {
        allowJs: true,
        checkJs: false, // 성능을 위해 JS 체크는 최소화
        noEmit: true,
        skipLibCheck: true, // 라이브러리 체크 건너뛰기 (성능 핵심)
        incremental: true,
      },
    };

    if (existsSync(tsConfigPath)) {
      this.project = new Project({
        ...baseOptions,
        tsConfigFilePath: tsConfigPath,
        skipAddingFilesFromTsConfig: true, // 필요한 파일만 명시적으로 추가하여 메모리 절약
      });
      // src 디렉토리만 우선적으로 추가
      this.project.addSourceFilesAtPaths(join(this.workspacePath, 'src/**/*.{ts,js,tsx,jsx}'));
    } else {
      this.project = new Project(baseOptions);
      this.project.addSourceFilesAtPaths([
        join(this.workspacePath, 'src/**/*.{ts,js,tsx,jsx}'),
      ]);
    }

    this.isInitialized = true;
  }

  /**
   * [Feature 1] 파일 내 함수/클래스 단위 복잡도 및 메트릭 분석
   */
  getSymbolMetrics(filePath: string): SymbolMetric[] {
    this.ensureInitialized();
    const sourceFile = this.project!.getSourceFile(filePath);
    if (!sourceFile) return [];

    const metrics: SymbolMetric[] = [];

    // 함수 선언 분석
    sourceFile.getFunctions().forEach(func => {
      metrics.push(this.analyzeNode(func, 'Function'));
    });

    // 클래스 및 메서드 분석
    sourceFile.getClasses().forEach(cls => {
      metrics.push(this.analyzeNode(cls, 'Class'));
      cls.getMethods().forEach(method => {
        metrics.push(this.analyzeNode(method, 'Method', `${cls.getName()}.${method.getName()}`));
      });
    });

    return metrics;
  }

  private analyzeNode(node: FunctionDeclaration | MethodDeclaration | ClassDeclaration, kind: string, customName?: string): SymbolMetric {
    const name = customName || node.getName() || '<anonymous>';
    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    const lineCount = endLine - startLine + 1;
    
    // 간이 복잡도 계산 (제어문 개수)
    let complexity = 1;
    node.forEachDescendant((descendant) => {
      switch (descendant.getKind()) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.ForStatement:
        case SyntaxKind.ForInStatement:
        case SyntaxKind.ForOfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
        case SyntaxKind.CatchClause:
        case SyntaxKind.ConditionalExpression: // 삼항 연산자
        case SyntaxKind.SwitchStatement:
          complexity++;
      }
    });

    // 코드 스니펫 (최대 10줄)
    const fullText = node.getText();
    const snippetLines = fullText.split('\n').slice(0, 10);
    const codeSnippet = snippetLines.join('\n') + (snippetLines.length < lineCount ? '\n...' : '');

    return {
      name,
      kind,
      lineCount,
      complexity,
      startLine,
      endLine,
      codeSnippet,
    };
  }

  /**
   * [Feature 2] 미사용 코드(Dead Code) 탐지
   * Export 되었으나 프로젝트 내에서 참조가 0인 심볼 찾기
   */
  findDeadCode(): DeadCode[] {
    this.ensureInitialized();
    const deadCodes: DeadCode[] = [];

    // src 폴더 내 파일만 검사
    const sourceFiles = this.project!.getSourceFiles().filter(f => !f.getFilePath().includes('node_modules'));

    for (const file of sourceFiles) {
      // Export된 선언들 찾기
      const exportedDeclarations = file.getExportedDeclarations();
      
      exportedDeclarations.forEach((decls, name) => {
        decls.forEach(decl => {
          if (Node.isReferenceFindable(decl)) {
            const references = decl.findReferencesAsNodes();
            // 참조가 0개이거나, 자기 자신 내부에서의 참조만 있는 경우 (엄밀하진 않지만 근사치)
            const externalRefs = references.filter(ref => ref.getSourceFile() !== file);
            
            if (externalRefs.length === 0 && name !== 'default') {
              deadCodes.push({
                file: file.getFilePath(),
                symbol: name,
                kind: decl.getKindName(),
                line: decl.getStartLineNumber(),
              });
            }
          }
        });
      });
    }

    return deadCodes;
  }

  /**
   * [Feature 3] 영향도 분석 (Impact Analysis)
   * 특정 심볼을 수정했을 때 영향을 받는 파일 및 테스트 추적
   */
  analyzeImpact(filePath: string, symbolName: string): ImpactAnalysis {
    this.ensureInitialized();
    const sourceFile = this.project!.getSourceFile(filePath);
    if (!sourceFile) {
        return { targetSymbol: symbolName, referencingFiles: [], affectedTests: [] };
    }

    let targetNode: Node | undefined;

    // 함수나 클래스 찾기
    targetNode = sourceFile.getFunction(symbolName) || sourceFile.getClass(symbolName) || sourceFile.getVariableStatement(symbolName);
    
    if (!targetNode) {
        // 클래스 메서드인 경우 (ClassName.MethodName)
        if (symbolName.includes('.')) {
            const [clsName, methodName] = symbolName.split('.');
            const cls = sourceFile.getClass(clsName);
            if (cls) {
                targetNode = cls.getMethod(methodName);
            }
        }
    }

    if (!targetNode || !Node.isReferenceFindable(targetNode)) {
         return { targetSymbol: symbolName, referencingFiles: [], affectedTests: [] };
    }

    const referencingFiles = new Set<string>();
    const affectedTests = new Set<string>();

    const references = targetNode.findReferencesAsNodes();
    for (const ref of references) {
        const refFile = ref.getSourceFile();
        const refPath = refFile.getFilePath();
        
        // 자기 자신 제외
        if (refPath !== sourceFile.getFilePath()) {
            referencingFiles.add(refPath);
            if (refPath.includes('.test.') || refPath.includes('.spec.')) {
                affectedTests.add(refPath);
            }
        }
    }

    return {
        targetSymbol: symbolName,
        referencingFiles: Array.from(referencingFiles),
        affectedTests: Array.from(affectedTests)
    };
  }
  
  /**
   * [Feature 4] 심볼 내용 읽기 (Token Saver)
   */
  getSymbolContent(filePath: string, symbolName: string): string | null {
      this.ensureInitialized();
      const sourceFile = this.project!.getSourceFile(filePath);
      if (!sourceFile) return null;

      let targetNode: Node | undefined;
      targetNode = sourceFile.getFunction(symbolName) || sourceFile.getClass(symbolName);

       if (!targetNode && symbolName.includes('.')) {
            const [clsName, methodName] = symbolName.split('.');
            const cls = sourceFile.getClass(clsName);
            if (cls) targetNode = cls.getMethod(methodName);
        }

      return targetNode ? targetNode.getText() : null;
  }

  /**
   * [Feature 5] 심볼 참조 찾기 (Find References)
   */
  findReferences(filePath: string, symbolName: string): { file: string; line: number; text: string }[] {
    this.ensureInitialized();
    const sourceFile = this.project!.getSourceFile(filePath);
    if (!sourceFile) return [];

    let targetNode: Node | undefined;
    targetNode = sourceFile.getFunction(symbolName) || sourceFile.getClass(symbolName) || sourceFile.getVariableStatement(symbolName);

    if (!targetNode && symbolName.includes('.')) {
      const [clsName, methodName] = symbolName.split('.');
      const cls = sourceFile.getClass(clsName);
      if (cls) targetNode = cls.getMethod(methodName);
    }

    if (!targetNode || !Node.isReferenceFindable(targetNode)) return [];

    const results: { file: string; line: number; text: string }[] = [];
    const references = targetNode.findReferencesAsNodes();

    for (const ref of references) {
      results.push({
        file: ref.getSourceFile().getFilePath(),
        line: ref.getStartLineNumber(),
        text: ref.getParent()?.getText().slice(0, 100).trim() || '',
      });
    }

    return results;
  }

  /**
   * [Feature 6] 정의로 이동 (Go to Definition)
   */
  goToDefinition(filePath: string, symbolName: string): { file: string; line: number } | null {
    this.ensureInitialized();
    const sourceFile = this.project!.getSourceFile(filePath);
    if (!sourceFile) return null;

    // 현재 파일 내에서 심볼 찾기 또는 프로젝트 전체에서 찾기 (임시로 이름 기반 검색)
    // 실제 구현은 Symbol 기반으로 확장 가능
    let targetNode: Node | undefined;
    targetNode = sourceFile.getFunction(symbolName) || sourceFile.getClass(symbolName);

    if (!targetNode && symbolName.includes('.')) {
      const [clsName, methodName] = symbolName.split('.');
      const cls = sourceFile.getClass(clsName);
      if (cls) targetNode = cls.getMethod(methodName);
    }

    if (!targetNode) {
        // 만약 현재 파일에 없다면 프로젝트 전체 소스 파일에서 검색
        for (const file of this.project!.getSourceFiles()) {
            const node = file.getFunction(symbolName) || file.getClass(symbolName);
            if (node) {
                targetNode = node;
                break;
            }
        }
    }

    if (targetNode) {
      return {
        file: targetNode.getSourceFile().getFilePath(),
        line: targetNode.getStartLineNumber(),
      };
    }

    return null;
  }

  /**
   * [Feature 7] 역의존성 탐지 (Find Dependents)
   * 특정 파일을 import 하고 있는 파일 목록을 찾습니다.
   */
  getDependents(filePath: string): string[] {
    this.ensureInitialized();
    const sourceFile = this.project!.getSourceFile(filePath);
    if (!sourceFile) return [];

    const dependents = new Set<string>();
    const referencedSymbols = sourceFile.getExportSymbols();

    for (const symbol of referencedSymbols) {
        const declarations = symbol.getDeclarations();
        for (const decl of declarations) {
            if (Node.isReferenceFindable(decl)) {
                const refs = decl.findReferencesAsNodes();
                for (const ref of refs) {
                    const refFile = ref.getSourceFile();
                    if (refFile.getFilePath() !== sourceFile.getFilePath()) {
                        dependents.add(refFile.getFilePath());
                    }
                }
            }
        }
    }

    return Array.from(dependents);
  }
}
