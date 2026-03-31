import ts from 'typescript';
import { dirname } from 'path';

/**
 * TypeScript 컴파일러 프로그램을 관리하고 캐싱하는 싱글톤 클래스입니다.
 * v3.9.5: 고속 심볼 검증을 위해 메모리에 한 번 로드된 프로그램을 재사용합니다.
 */
export class TsProgramManager {
  private static instance: TsProgramManager;
  private program: ts.Program | null = null;
  private compilerOptions: ts.CompilerOptions = {};
  private rootFiles: string[] = [];

  private constructor() {}

  public static getInstance(): TsProgramManager {
    if (!TsProgramManager.instance) {
      TsProgramManager.instance = new TsProgramManager();
    }
    return TsProgramManager.instance;
  }

  /**
   * 프로젝트의 tsconfig.json을 기반으로 컴파일러 옵션을 로드합니다.
   */
  public init(workspacePath: string, allFiles: string[]) {
    const configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json');
    
    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath)
      );
      this.compilerOptions = parsedConfig.options;
    } else {
      // 기본 옵션 (tsconfig가 없는 경우)
      this.compilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowJs: true,
        checkJs: true,
      };
    }

    // 성능을 위해 프로젝트의 모든 파일을 루트로 등록
    this.rootFiles = allFiles;
    this.program = ts.createProgram(this.rootFiles, this.compilerOptions);
  }

  /**
   * 특정 파일에 대한 의미론적 진단(Semantic Diagnostics)을 수행합니다.
   * TS2304 (Cannot find name), TS2552 (Cannot find name with suggestion) 에러만 추출합니다.
   */
  public getHallucinations(filePath: string): { name: string; line: number }[] {
    if (!this.program) return [];

    const sourceFile = this.program.getSourceFile(filePath);
    if (!sourceFile) return [];

    const diagnostics = this.program.getSemanticDiagnostics(sourceFile);
    const hallucinations: { name: string; line: number }[] = [];

    for (const diag of diagnostics) {
      // TS2304: Cannot find name 'X'.
      // TS2552: Cannot find name 'X'. Did you mean 'Y'?
      if (diag.code === 2304 || diag.code === 2552) {
        if (diag.start !== undefined) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(diag.start);
          const name = typeof diag.messageText === 'string' 
            ? diag.messageText.match(/'(.*?)'/)?.[1] || 'unknown'
            : 'unknown';
          
          hallucinations.push({ name, line: line + 1 });
        }
      }
    }

    return hallucinations;
  }

  /**
   * 파일 변경 시 프로그램을 갱신합니다. (Incremental)
   */
  public refresh(allFiles: string[]) {
    this.rootFiles = allFiles;
    this.program = ts.createProgram(this.rootFiles, this.compilerOptions, undefined, this.program || undefined);
  }
}
