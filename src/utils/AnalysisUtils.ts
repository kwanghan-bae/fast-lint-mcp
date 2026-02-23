import { getDependencyMap, findOrphanFiles } from '../analysis/fd.js';
import { Violation } from '../types/index.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export function detectCycles(depMap: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  const dfs = (node: string, path: string[]) => {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of depMap.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (stack.has(neighbor)) {
        const cycleStartIdx = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStartIdx), neighbor]);
      }
    }

    stack.delete(node);
  };

  for (const node of depMap.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

export async function checkStructuralIntegrity(): Promise<Violation[]> {
  const violations: Violation[] = [];
  const depMap = await getDependencyMap();
  const cycles = detectCycles(depMap);
  for (const cycle of cycles) {
    violations.push({
      type: 'CUSTOM',
      message: `순환 참조 발견: ${cycle.join(' -> ')}`,
    });
  }

  const orphans = await findOrphanFiles();
  for (const orphan of orphans) {
    violations.push({
      type: 'ORPHAN',
      file: orphan,
      message: '어떤 파일에서도 참조되지 않는 파일입니다. 삭제를 고려하세요.',
    });
  }
  return violations;
}

/**
 * 분석 결과를 가독성 좋은 테이블 형식으로 변환합니다.
 */
export function formatReport(report: any): string {
  let output = '';

  const statusIcon = report.pass ? '✅' : '❌';
  const statusText = report.pass ? chalk.green.bold('PASS') : chalk.red.bold('FAIL');

  output += `\n${statusIcon} 프로젝트 품질 인증 결과: ${statusText}\n`;
  output += `------------------------------------------\n`;

  if (report.violations.length > 0) {
    const table = new Table({
      head: [chalk.cyan('Type'), chalk.cyan('File'), chalk.cyan('Message')],
      colWidths: [15, 30, 50],
      wordWrap: true,
    });

    report.violations.forEach((v: any) => {
      table.push([chalk.yellow(v.type), v.file || '-', v.message]);
    });

    output += table.toString() + '\n';
  } else {
    output += chalk.green('\n🎉 발견된 위반 사항이 없습니다. 완벽합니다!\n');
  }

  output += `\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`;

  return output;
}
