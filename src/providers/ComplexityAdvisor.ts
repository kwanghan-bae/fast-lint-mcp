import { readFileSync } from 'fs';
import { AstCacheManager } from '../utils/AstCacheManager.js';

// AST 패턴 정의 (v3.0 Semantic)
const UI_AST_PATTERNS = [
  'use$A($$$)', // Hooks
  '< $A $$$ />', // JSX
  'createElement($$$)',
  'render($$$)',
];

const LOGIC_AST_PATTERNS = [
  'Math.$A($$$)',
  'new Map($$$)',
  'new Set($$$)',
  'crypto.$A($$$)',
  'fetch($$$)',
];

/** AST 패턴 분석을 통해 복잡도 해결을 위한 구체적인 가이드를 생성합니다. */
export function generateComplexityAdvice(filePath: string): string {
  const cache = AstCacheManager.getInstance();
  const root = cache.getRootNode(filePath);
  const symbols = cache.getSymbols(filePath);

  if (!root) return '코드 복잡도가 기준을 초과했습니다. 로직을 더 작은 함수나 클래스로 분리하세요.';

  // v3.8.6: Actionable Advice 강화
  const totalComplexity = symbols.reduce((acc, s) => acc + s.complexity, 0);
  const giantSymbol = symbols.find(s => s.complexity > 10 && s.complexity > totalComplexity * 0.5);

  if (giantSymbol) {
    let advice = `[거대 함수 발견] '${giantSymbol.name}' 함수의 복잡도가 너무 높습니다. `;

    // 파일 내용 읽어서 switch/case 비율 분석 (간이 휴리스틱)
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').slice(giantSymbol.line - 1, giantSymbol.endLine);
      const snippet = lines.join('\n');

      const switchCount = (snippet.match(/\bswitch\s*\(/g) || []).length;
      const caseCount = (snippet.match(/\bcase\b/g) || []).length;

      if (caseCount > 5 || switchCount > 1) {
        advice += `이 코드는 로직이 꼬여있기보다는 단순 분기(Switch)가 많습니다. 다형성(Polymorphism)이나 전략 패턴(Strategy Pattern) 도입을 고려하세요. `;
      } else {
        advice += `이 함수 내부의 중첩된 조건문이나 반복문을 별도의 작은 함수로 추출(Extract Method)하여 책임을 분산시키세요. `;
      }

      if (giantSymbol.lines > 100) {
        // 대략적으로 가장 긴 코드 블록(Lxx-Lyy) 추출 권장
        const midPoint = Math.floor((giantSymbol.line + giantSymbol.endLine) / 2);
        advice += `특히 크기가 비대한 구간(예: L${giantSymbol.line}-L${midPoint})을 독립된 Private Method로 추출할 것을 권장합니다.`;
      }
    } catch (e) {
      advice += `이 함수 내부의 조건문이나 반복문을 별도의 작은 함수로 추출(Extract Method)하여 책임을 분산시키세요.`;
    }
    return advice;
  }

  // 2. 함수 과다 여부 판별
  if (symbols.length > 15) {
    return `[함수 과다 존재] 파일 내에 너무 많은 함수(${symbols.length}개)가 정의되어 있어 관리 복잡도가 높습니다. 서로 연관된 기능들을 새로운 클래스나 모듈로 분리(Extract Class/Module)하는 것을 권장합니다.`;
  }

  const hasUIPatterns = UI_AST_PATTERNS.some((p) => root.findAll(p).length > 0);
  const hasLogicPatterns = LOGIC_AST_PATTERNS.some((p) => root.findAll(p).length > 0);

  if (hasUIPatterns && !hasLogicPatterns) {
    return '이 컴포넌트에는 UI 렌더링과 복잡한 상태 관리가 혼재되어 있습니다. Business Logic을 Custom Hook으로 추출하거나, Presentational Component로 UI를 분리하세요.';
  }
  if (hasLogicPatterns && !hasUIPatterns) {
    return '이 파일에는 고도의 연산 로직이 포함되어 있습니다. 서비스 레이어나 순수 함수 기반의 유틸리티 라이브러리로 로직을 캡슐화하는 것이 좋겠습니다.';
  }
  if (hasUIPatterns && hasLogicPatterns) {
    return '렌더링 코드와 복잡한 계산 로직이 강하게 결합되어 있습니다. 유지보수를 위해 렌더링부와 로직부를 엄격히 분리(SOC: Separation of Concerns)하세요.';
  }
  return '코드 복잡도가 기준을 초과했습니다. 로직을 더 작은 함수나 클래스로 분리하세요.';
}
