import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'public');
const destination = join(root, 'android', 'app', 'src', 'main', 'assets');
const syncServer = String(process.env.SYNC_SERVER_URL || '').replace(/\/+$/, '');
const projectUrl = String(process.env.GITHUB_REPOSITORY_URL || '').replace(/\/+$/, '');

if (syncServer && !/^https:\/\//i.test(syncServer) && !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)/i.test(syncServer)) {
  throw new Error('SYNC_SERVER_URL moet voor een openbare build met https:// beginnen.');
}

await mkdir(destination, { recursive: true });
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && entry.name !== 'config.js') {
    await copyFile(join(source, entry.name), join(destination, entry.name));
  }
}

const config = `window.MoviePassConfig=Object.freeze(${JSON.stringify({ syncServer, projectUrl })});\n`;
await writeFile(join(destination, 'config.js'), config, 'utf8');
console.log(syncServer ? `Android gebruikt groepsserver ${syncServer}` : 'Android-build houdt het handmatige serverveld zichtbaar.');
