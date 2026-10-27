import { readFile, copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { validatePublicData } from '../src/lib/public-data.ts';

const [command, file] = process.argv.slice(2);
if (!['validate', 'import'].includes(command) || !file) {
  console.error('사용법: npm run publish -- <공개 JSON 파일>');
  process.exitCode = 1;
} else {
  try {
    const input = JSON.parse(await readFile(resolve(file), 'utf8'));
    if (!validatePublicData(input))
      throw new Error(
        '공개 데이터 형식이 올바르지 않습니다. 전체 백업 파일을 공개용으로 사용하지 마세요.',
      );
    if (command === 'import') {
      const target = resolve('public/data/welcome.json');
      if (resolve(file) !== target) {
        const backup = resolve(`backups/welcome-${Date.now()}.json`);
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(target, backup);
        const temp = `${target}.next`;
        try {
          await copyFile(resolve(file), temp);
          await rename(temp, target);
        } catch (error) {
          await unlink(temp).catch(() => {});
          throw error;
        }
        console.log(`이전 파일 백업: ${backup}`);
      }
    }
    console.log(`공개 데이터 검증 통과: ${input.letters.length}건`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
