import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const targetDir = join(root, 'public', 'ffmpeg-core');

if (!existsSync(sourceDir)) {
  console.warn('[ffmpeg-core] @ffmpeg/core is not installed yet; skipping asset copy.');
  process.exit(0);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });

for (const file of readdirSync(sourceDir)) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}

console.log(`[ffmpeg-core] copied assets to ${targetDir}`);
