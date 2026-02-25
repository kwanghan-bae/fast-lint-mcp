import { readFileSync } from 'fs';
import glob from 'fast-glob';
import pMap from 'p-map';
import os from 'os';

/**
 * 프로젝트 내의 기술 부채(TODO, FIXME 등)를 고속으로 스캔합니다.
 */
export async function countTechDebt(workspacePath: string = process.cwd()): Promise<number> {
  try {
    const files = await glob(['src/**/*.{ts,js,tsx,jsx}'], { cwd: workspacePath, absolute: true });
    const patterns = ['TODO', 'FIXME', 'HACK', 'XXX'];

    const results = await pMap(
      files,
      async (file) => {
        try {
          const content = readFileSync(file, 'utf-8').toUpperCase();
          let count = 0;
          for (const p of patterns) {
              let pos = content.indexOf(p);
              while (pos !== -1) {
                  count++;
                  pos = content.indexOf(p, pos + 1);
              }
          }
          return count;
        } catch (e) {
          return 0;
        }
      },
      { concurrency: os.cpus().length }
    );

    return results.reduce((sum, count) => sum + count, 0);
  } catch (error) {
    return 0;
  }
}
