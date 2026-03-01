import { Violation, QualityReport } from '../types/index.js';
import chalk from 'chalk';
import { DependencyGraph } from './DependencyGraph.js';
import Table from 'cli-table3';

/**
 * 품질 분석 결과를 AI 에이전트 및 MCP 클라이언트가 읽기 좋은 Markdown 형식으로 변환합니다.
 * 이모지와 표(Table)를 사용하여 시각적으로 직관적인 리포트를 생성합니다.
 * @param report 품질 분석 결과 데이터 객체
 * @returns Markdown 형식의 리포트 문자열
 */
export function formatReport(report: QualityReport): string {
  let output = '';

  const statusIcon = report.pass ? '✅' : '❌';
  const statusText = report.pass ? 'PASS' : 'FAIL';

  // 1. 헤더 및 종합 상태 출력
  output += `## ${statusIcon} 프로젝트 품질 인증 결과: **${statusText}** (v2.1.2)\n\n`;

  if (report.violations.length > 0) {
    // 2. 위반 사항 목록을 Markdown 테이블로 구성
    output += `### 🚨 발견된 위반 사항 (${report.violations.length}건)\n\n`;
    output += `| 구분(Type) | 대상 파일(File) | 위반 내용(Message) |\n`;
    output += `| :--- | :--- | :--- |\n`;

    report.violations.forEach((v: Violation) => {
      // 테이블 깨짐 방지를 위해 파이프(|) 기호 이스케이프 처리
      const safeMessage = v.message.replace(/\|/g, '\\|');
      const fileName = v.file ? `\`${v.file}\`` : '`-`';
      output += `| **${v.type}** | ${fileName} | ${safeMessage} |\n`;
    });
  } else {
    // 3. 위반 사항이 없는 경우의 축하 메시지
    output += `\n> 🎉 **발견된 위반 사항이 없습니다. 완벽한 코드 품질을 유지하고 있습니다!**\n`;
  }

  // 4. 리팩토링 제안 및 조치 가이드 추가
  if (report.suggestion) {
    output += `\n### 💡 리팩토링 조치 가이드\n\n${report.suggestion}\n`;
  }

  return output;
}

/**
 * 개발자가 터미널에서 직접 실행했을 때 보기 좋게 출력하기 위한 ANSI 테이블 포맷터입니다.
 * @param report 품질 분석 결과 데이터 객체
 * @returns 터미널용 컬러 텍스트 리포트 문자열
 */
export function formatCLITable(report: QualityReport): string {
  let output = '';

  const statusIcon = report.pass ? '✅' : '❌';
  const statusText = report.pass ? chalk.green.bold('PASS') : chalk.red.bold('FAIL');

  output += `\n${statusIcon} 프로젝트 품질 인증 결과: ${statusText}\n`;
  output += `------------------------------------------\n`;

  if (report.violations.length > 0) {
    // cli-table3를 사용하여 가독성 높은 표 생성
    const table = new Table({
      head: [chalk.cyan('Type'), chalk.cyan('File'), chalk.cyan('Message')],
      colWidths: [15, 30, 50],
      wordWrap: true,
    });

    report.violations.forEach((v: Violation) => {
      table.push([chalk.yellow(v.type), v.file || '-', v.message]);
    });

    output += table.toString() + '\n';
  } else {
    output += chalk.green('\n🎉 발견된 위반 사항이 없습니다. 완벽합니다!\n');
  }

  // 조치 가이드를 굵은 파란색 텍스트로 강조
  if (report.suggestion) {
    output += `\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`;
  }

  return output;
}

/**
 * 프로젝트의 구조적 무결성(순환 참조 등 아키텍처 결함)을 심층 검사합니다.
 * @param dg 빌드된 의존성 그래프 인스턴스
 * @returns 구조 위반 사항 목록
 */
export function checkStructuralIntegrity(dg?: DependencyGraph): Violation[] {
  const violations: Violation[] = [];
  if (!dg) return [];

  // 1. 모듈 간 순환 참조(Circular Dependency) 탐지
  const cycles = dg.detectCycles() || [];
  cycles.forEach((cycle) => {
    violations.push({
      type: 'ARCHITECTURE',
      // 순환 경로를 시각적으로 표시 (예: fileA -> fileB -> fileA)
      message: `[순환 참조] ${cycle.map((c) => c.split('/').pop()).join(' -> ')}`,
    });
  });

  return violations;
}
