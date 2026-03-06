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

  const versionStr = report.metadata?.version || 'v3.x';
  // 1. 헤더 및 종합 상태 출력
  output += `## ${statusIcon} 프로젝트 품질 인증 결과: **${statusText}** (${versionStr})\n\n`;

  // 메타데이터 출력 (v3.8)
  if (report.metadata) {
    const meta = report.metadata;
    const freshnessIcon =
      meta.coverageFreshness === 'fresh' ? '🟢' : meta.coverageFreshness === 'stale' ? '🟠' : '⚪';
    const modeLabel = meta.analysisMode === 'incremental' ? '증분 분석' : '전체 분석';
    const coverageVal =
      meta.coveragePercentage !== undefined ? ` (${meta.coveragePercentage.toFixed(1)}%)` : '';
    output += `> **분석 모드**: \`${modeLabel}\` | **분석된 파일**: \`${meta.filesAnalyzed}개\` | **커버리지**: ${freshnessIcon} \`${meta.coverageFreshness || 'unknown'}\`${coverageVal}\n\n`;
  }

  if (report.violations.length > 0) {
    // 2. 위반 사항 목록을 Markdown 테이블로 구성
    output += `### 🚨 발견된 위반 사항 (${report.violations.length}건)\n\n`;
    output += `| 구분(Type) | 대상 파일(File) | 위반 내용(Message) | 판단 근거(Rationale) |\n`;
    output += `| :--- | :--- | :--- | :--- |\n`;

    report.violations.forEach((v: Violation) => {
      // 테이블 깨짐 방지를 위해 파이프(|) 기호 이스케이프 처리
      const safeMessage = v.message.replace(/\|/g, '\\|');
      let safeRationale = (v.rationale || '-').replace(/\|/g, '\\|');

      // v6.0.2: 환각 위반에 대한 지능형 힌트 추가
      if (v.type === 'HALLUCINATION') {
        safeRationale += ' **(👉 Action: Call `go-to-definition` or `find-references`)**';
      }

      const fileWithLine = v.file ? `\`${v.file}${v.line ? `:L${v.line}` : ''}\`` : '`-`';
      output += `| **${v.type}** | ${fileWithLine} | ${safeMessage} | *${safeRationale}* |\n`;
    });

    // 2.1 에이전트 자가 수정 가이드 (Self-Correction Guide v6.0.2)
    output += `\n### 🧠 에이전트 자가 수정 가이드 (Self-Correction Guide)\n`;
    output += `> 발견된 위반 사항을 해결하기 위해 다음 단계를 권장합니다:\n`;
    output += `- **Hallucination 해결**: 해당 심볼의 정의가 프로젝트 내에 존재하는지 \`go-to-definition\`으로 확인하고, 없다면 실제 존재하는 API로 교체하십시오.\n`;
    output += `- **Complexity/Size 해결**: 하단의 **Deep Dive** 섹션에서 분석된 함수 범위를 참고하여 로직을 작은 단위로 추출하십시오.\n`;
    output += `- **Architecture 해결**: 의존성 그래프의 방향을 확인하고, 상위 레이어에서 하위 레이어를 참조하도록 구조를 변경하십시오.\n`;
  } else {
    // 3. 위반 사항이 없는 경우의 축하 메시지
    output += `\n> 🎉 **발견된 위반 사항이 없습니다. 완벽한 코드 품질을 유지하고 있습니다!**\n`;
  }

  // 4. 리팩토링 제안 및 조치 가이드 추가
  if (report.suggestion) {
    output += `\n### 💡 리팩토링 조치 가이드\n\n${report.suggestion}\n`;
  }

  // 5. 지능형 딥다이브 (Deep Dive) 섹션 추가 (v5.1: Agent Turn Optimization)
  if (report.deepDive && Object.keys(report.deepDive).length > 0) {
    output += `\n### 🔍 Deep Dive: Problematic Symbols (Auto-Analyzed)\n`;
    output += `> 위반 사항이 발견된 파일 내에서 복잡도나 크기가 임계치를 초과한 심볼들입니다.\n\n`;
    output += `| 파일(File) | 심볼명(Symbol) | 라인수(Lines) | 복잡도(Complexity) | 범위(Range) |\n`;
    output += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const [file, symbols] of Object.entries(report.deepDive)) {
      symbols.forEach((s: any) => {
        const fileName = file.split('/').pop();
        output += `| \`${fileName}\` | **${s.name}** | ${s.lineCount} | \`${s.complexity}\` | L${s.startLine}-L${s.endLine} |\n`;
      });
    }
    output += `\n*에이전트 팁: 위 심볼 정보를 바탕으로 \`get-symbol-content\`를 호출하여 즉시 수정을 시작하세요.*\n`;
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

  const versionStr = report.metadata?.version || 'v3.x';
  output += `\n${statusIcon} 프로젝트 품질 인증 결과: ${statusText} (${versionStr})\n`;
  output += `------------------------------------------\n`;

  if (report.violations.length > 0) {
    // cli-table3를 사용하여 가독성 높은 표 생성
    const table = new Table({
      head: [
        chalk.cyan('Type'),
        chalk.cyan('File'),
        chalk.cyan('Message'),
        chalk.cyan('Rationale'),
      ],
      colWidths: [12, 25, 40, 25],
      wordWrap: true,
    });

    report.violations.forEach((v: Violation) => {
      const fileWithLine = v.file ? `${v.file}${v.line ? `:L${v.line}` : ''}` : '-';
      table.push([chalk.yellow(v.type), fileWithLine, v.message, chalk.italic(v.rationale || '-')]);
    });

    output += table.toString() + '\n';
  } else {
    output += chalk.green('\n🎉 발견된 위반 사항이 없습니다. 완벽합니다!\n');
  }

  // 메타데이터 추가
  if (report.metadata) {
    const meta = report.metadata;
    const modeLabel = meta.analysisMode === 'incremental' ? '증분 분석' : '전체 분석';
    const coverageVal =
      meta.coveragePercentage !== undefined ? ` (${meta.coveragePercentage.toFixed(1)}%)` : '';
    output += chalk.gray(
      `\n[Metadata] Mode: ${modeLabel} | Analyzed: ${meta.filesAnalyzed} files | Coverage: ${meta.coverageFreshness}${coverageVal}\n`
    );
  }

  // 조치 가이드 추가 (복구)
  if (report.suggestion) {
    output += `\n${chalk.blue.bold('💡 Suggestion:')}\n${report.suggestion}\n`;

    // v6.0.2: 위반 사항이 있을 경우 터미널 전용 퀵 힌트 추가
    if (report.violations.length > 0) {
      output += `\n${chalk.magenta.bold('🧠 Quick Hints for AI Agent:')}\n`;
      if (report.violations.some((v) => v.type === 'HALLUCINATION')) {
        output += chalk.gray(`- Use 'go-to-definition' to find actual API signatures.\n`);
      }
      if (report.violations.some((v) => v.type === 'COMPLEXITY' || v.type === 'SIZE')) {
        output += chalk.gray(
          `- Refer to 'Deep Dive' section below to identify refactoring targets.\n`
        );
      }
    }
  }

  return output;
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 프로젝트의 구조적 무결성(순환 참조 등 아키텍처 결함)을 심층 검사합니다.
 * v3.8.1: forwardRef 인지 및 레이어 단방향 흐름 강제 (Architectural Intelligence)
 * @param dg 빌드된 의존성 그래프 인스턴스
 * @returns 구조 위반 사항 목록
 */
export function checkStructuralIntegrity(dg?: DependencyGraph): Violation[] {
  const violations: Violation[] = [];
  if (!dg) return [];

  // 1. 모듈 간 순환 참조(Circular Dependency) 탐지 및 forwardRef 예외 처리
  const cycles = dg.detectCycles() || [];
  cycles.forEach((cycle) => {
    // 순환 경로 상에 존재하는 파일들의 내용을 읽어 forwardRef 사용 여부 확인
    let hasForwardRef = false;
    for (const file of cycle) {
      if (existsSync(file)) {
        try {
          const content = readFileSync(file, 'utf-8');
          if (content.includes('forwardRef')) {
            hasForwardRef = true;
            break;
          }
        } catch (e) {
          // 무시
        }
      }
    }

    if (hasForwardRef) {
      violations.push({
        type: 'TECH_DEBT',
        rationale: '순환 참조 회피 패턴(forwardRef) 인지',
        message: `[기술 부채] 순환 참조가 발견되었으나 forwardRef로 회피되었습니다. 구조적 리팩토링이 권장됩니다: ${cycle.map((c) => c.split('/').pop()).join(' -> ')}`,
      });
    } else {
      violations.push({
        type: 'ARCHITECTURE',
        rationale: '단방향 의존성 위반 (순환 참조)',
        message: `[순환 참조] 치명적인 구조적 결함이 발견되었습니다: ${cycle.map((c) => c.split('/').pop()).join(' -> ')}`,
      });
    }
  });

  // 2. 단방향 레이어 아키텍처 흐름 검사 (Controller -> Service -> Repository)
  // v3.8.1: 파일 명명 규칙을 기반으로 역방향 참조를 탐지합니다.
  const allFiles = dg.getAllFiles();

  for (const file of allFiles) {
    const deps = dg.getDependencies(file);
    const fileName = file.toLowerCase();

    for (const dep of deps) {
      const depName = dep.toLowerCase();

      // Service가 Controller를 참조하는 경우 (역방향)
      if (fileName.includes('service') && depName.includes('controller')) {
        violations.push({
          type: 'ARCHITECTURE',
          file: file,
          rationale: 'Layer 위반: Service -> Controller',
          message: `[아키텍처 위반] Service 계층에서 Controller 계층을 참조할 수 없습니다 (${dep.split('/').pop()}).`,
        });
      }

      // Repository가 Service나 Controller를 참조하는 경우 (역방향)
      if (
        fileName.includes('repository') &&
        (depName.includes('service') || depName.includes('controller'))
      ) {
        violations.push({
          type: 'ARCHITECTURE',
          file: file,
          rationale: 'Layer 위반: Repository -> Service/Controller',
          message: `[아키텍처 위반] Repository 계층은 하위 인프라에만 의존해야 합니다 (${dep.split('/').pop()}).`,
        });
      }
    }
  }

  return violations;
}
