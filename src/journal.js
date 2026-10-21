import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createJournal(directory) {
  const file = join(directory, 'requests.json');
  let queue = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(value)) throw new Error('El archivo de solicitudes no contiene una lista.');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  function mutate(update) {
    const operation = queue.then(async () => {
      const entries = await read();
      const result = update(entries);
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `.requests-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(entries), { flag: 'wx' });
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    async list() {
      await queue;
      return read();
    },
    add(data) {
      return mutate(entries => {
        const item = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
        entries.push(item);
        return item;
      });
    }
  };
}
