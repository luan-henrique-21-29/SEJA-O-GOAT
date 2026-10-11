import { copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(projectRoot, 'dist');
async function copyDirectory(source, target) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'work') continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Link simbólico não permitido no build: ${sourcePath}`);
    if (entry.isDirectory()) await copyDirectory(sourcePath, targetPath);
    else if (entry.isFile()) await copyFile(sourcePath, targetPath);
    else throw new Error(`Tipo de arquivo não permitido no build: ${sourcePath}`);
  }
}
// A fixed allowlist prevents test files, dependencies and temporary work from shipping.
if (!(await lstat(path.join(projectRoot, 'index.html'))).isFile()) throw new Error('index.html deve ser um arquivo regular.');
if (!(await lstat(path.join(projectRoot, 'src'))).isDirectory()) throw new Error('src deve ser uma pasta regular.');
let hasAssets = false;
try {
  if (!(await lstat(path.join(projectRoot, 'assets'))).isDirectory()) throw new Error('assets deve ser uma pasta regular.');
  hasAssets = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await copyFile(path.join(projectRoot, 'index.html'), path.join(outputRoot, 'index.html'));
await copyDirectory(path.join(projectRoot, 'src'), path.join(outputRoot, 'src'));
if (hasAssets) await copyDirectory(path.join(projectRoot, 'assets'), path.join(outputRoot, 'assets'));
console.log('Build concluído: dist/ (index.html, src/ e assets/).');
