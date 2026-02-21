import glob from 'fast-glob';
import { readFileSync } from 'fs';
import { Lang, parse } from '@ast-grep/napi';
import { join, basename, dirname, relative } from 'path';

export async function getDependencyMap(workspacePath: string = process.cwd()): Promise<Map<string, string[]>> {
  const allFiles = await glob(['src/**/*.{ts,js}'], { cwd: workspacePath });
  const depMap = new Map<string, string[]>();

  for (const filePath of allFiles) {
    const fullPath = join(workspacePath, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    const lang = filePath.endsWith('.ts') ? Lang.TypeScript : Lang.JavaScript;
    
    const ast = parse(lang, content);
    const root = ast.root();
    const deps: string[] = [];

    // import ... from '$B'
    const importMatches = root.findAll("import $A from '$B'");
    for (const match of importMatches) {
      const importPath = match.getMatch('B')?.text();
      if (importPath && importPath.startsWith('.')) {
        // 상대 경로 처리: 현재 파일 위치 기준 절대 경로 계산 후 다시 src 기준 상대 경로로 변환
        const targetPath = join(dirname(filePath), importPath);
        // 확장자가 없는 경우 처리 (단순 매칭 시도)
        const matched = allFiles.find(f => f.startsWith(targetPath));
        if (matched) deps.push(matched);
      }
    }

    // require('$B')
    const requireMatches = root.findAll("require('$B')");
    for (const match of requireMatches) {
      const importPath = match.getMatch('B')?.text();
      if (importPath && importPath.startsWith('.')) {
        const targetPath = join(dirname(filePath), importPath);
        const matched = allFiles.find(f => f.startsWith(targetPath));
        if (matched) deps.push(matched);
      }
    }

    depMap.set(filePath, [...new Set(deps)]);
  }

  return depMap;
}

export async function findOrphanFiles(workspacePath: string = process.cwd()): Promise<string[]> {
  const depMap = await getDependencyMap(workspacePath);
  const referenced = new Set<string>();

  for (const deps of depMap.values()) {
    for (const dep of deps) {
      referenced.add(dep);
    }
  }

  // 엔트리 포인트는 수동 추가
  referenced.add('src/index.ts');
  referenced.add('src/index.js');

  const orphans: string[] = [];
  for (const file of depMap.keys()) {
    if (!referenced.has(file)) {
      orphans.push(file);
    }
  }

  return orphans;
}
