import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
for (const app of ['backend', 'panel']) {
  const example = await readFile(new URL(`${app}/.env.example`, root), 'utf8');
  const content = app === 'backend'
    ? example.replace('replace-with-a-random-secret-of-at-least-32-characters', randomBytes(48).toString('hex'))
    : example;
  try {
    await writeFile(new URL(`${app}/.env`, root), content, { flag: 'wx', mode: 0o600 });
    console.log(`${app}/.env creado para esta instalación.`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`${app}/.env ya existe; se conserva.`);
  }
}
console.log('Iniciá MongoDB con replica set y luego la API y el panel en terminales separadas.');
