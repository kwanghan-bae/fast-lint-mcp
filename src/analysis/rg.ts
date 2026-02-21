import { execa } from 'execa';

export async function countTechDebt(workspacePath: string = process.cwd()): Promise<number> {
  try {
    // TODO, FIXME, HACK, XXX 태그 검색 (대소문자 구분 없이)
    const { stdout } = await execa('rg', [
      '-i',
      'TODO|FIXME|HACK|XXX',
      '--count-matches',
      'src',
    ]);
    
    // rg의 --count-matches 출력은 "file:count" 형식이거나 합계가 아닐 수 있으므로 파싱 필요
    const total = stdout.split('\n')
      .filter(Boolean)
      .reduce((sum, line) => {
        const count = parseInt(line.split(':').pop() || '0', 10);
        return sum + count;
      }, 0);

    return total;
  } catch (error) {
    // 검색 결과가 없으면 rg는 에러를 뱉을 수 있음 (exit code 1)
    return 0;
  }
}
