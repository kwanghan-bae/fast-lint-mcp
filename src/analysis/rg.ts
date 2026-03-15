import pMap from 'p-map';
import os from 'os';
import { AstCacheManager } from '../utils/AstCacheManager.js';

/**
 * 프로젝트 내의 기술 부채(TODO, FIXME 등)를 고속으로 스캔하여 개수를 반환합니다.
 * v0.0.1: AST 엔진을 활용하여 주석 내의 기술 부채만 정밀 타격하고 I/O 병목을 제거합니다.
 */
export async function countTechDebt(files: string[]): Promise<number> {
  try {
    // p-map을 사용하여 멀티코어 환경에서 병렬로 파일의 AST를 검색합니다.
    const results = await pMap(
      files,
      async (file) => {
        try {
          const root = AstCacheManager.getInstance().getRootNode(file, true);
          if (!root) return 0;
          
          // 오직 주석(comment) 노드 내에서만 특정 키워드를 정밀 탐색합니다.
          // (ast-grep은 대소문자 무시 정규식을 제한적으로 지원하므로, 여러 패턴을 조합)
          const matches = root.findAll({
            rule: { 
              kind: 'comment', 
              regex: '(?i)(TODO|FIXME|HACK|XXX)' 
            }
          });
          return matches.length;
        } catch (e) {
          // 파싱/검색 실패 시 0으로 처리
          return 0;
        }
      },
      // CPU 자원을 최대로 활용하기 위해 코어 수만큼 병렬 처리 수행
      { concurrency: os.cpus().length }
    );

    // 각 파일의 카운트 결과를 합산하여 최종 결과를 반환합니다.
    return results.reduce((sum, count) => sum + count, 0);
  } catch (error) {
    // 전체 프로세스 실패 시 안전하게 0 반환
    return 0;
  }
}
