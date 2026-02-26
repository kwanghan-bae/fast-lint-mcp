import { readFileSync } from 'fs';
import glob from 'fast-glob';
import pMap from 'p-map';
import os from 'os';

/**
 * 프로젝트 내의 기술 부채(TODO, FIXME 등)를 고속으로 스캔하여 개수를 반환합니다.
 * 정규식 대신 단순 문자열 매칭을 사용하여 수천 개의 파일을 빠르게 처리합니다.
 * @param workspacePath 프로젝트 루트 경로
 * @returns 발견된 기술 부채 키워드의 총합
 */
export async function countTechDebt(workspacePath: string = process.cwd()): Promise<number> {
  try {
    // 분석 대상 파일을 탐색합니다.
    const files = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath, absolute: true });

    // 추적할 기술 부채 키워드 정의
    const patterns = ['TODO', 'FIXME', 'HACK', 'XXX'];

    // p-map을 사용하여 멀티코어 환경에서 병렬로 파일 내용을 검색합니다.
    const results = await pMap(
      files,
      async (file) => {
        try {
          // 대소문자 구분 없이 검색하기 위해 내용을 모두 대문자로 변환합니다.
          const content = readFileSync(file, 'utf-8').toUpperCase();
          let count = 0;

          for (const p of patterns) {
            let pos = content.indexOf(p);
            // 해당 키워드가 파일 내에 몇 번 나타나는지 카운트합니다.
            while (pos !== -1) {
              count++;
              pos = content.indexOf(p, pos + 1);
            }
          }
          return count;
        } catch (e) {
          // 파일 읽기 실패 시 해당 파일의 카운트는 0으로 처리
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
