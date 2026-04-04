import { Violation } from '../types/index.js';
import { DependencyGraph } from './DependencyGraph.js';
import { readFileSync, existsSync } from 'fs';

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
