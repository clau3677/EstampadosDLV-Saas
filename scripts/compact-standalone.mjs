import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const standalone = join(root, '.next', 'standalone');
const standalonePublic = join(standalone, 'public');
const publicDir = join(root, 'public');
const standaloneNext = join(standalone, '.next');
const standaloneNextStatic = join(standaloneNext, 'static');
const rootNextStatic = join(root, '.next', 'static');
const standaloneHotFolders = join(standalone, 'hot_folders');
const rootHotFolders = join(root, 'hot_folders');

if (!existsSync(standalone) || !existsSync(publicDir)) {
  console.log('[compact-standalone] skip: standalone o public no existe');
  process.exit(0);
}

const removeEntry = path => {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  rmSync(path, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true });
};

const linkDir = (target, link) => {
  removeEntry(link);
  symlinkSync(target, link, 'dir');
};

// Next copia public y cualquier carpeta trazada por el build dentro de
// standalone. El servidor de producción se ejecuta desde el proyecto raíz,
// por lo que estos enlaces evitan duplicar uploads/assets y conservan las rutas.
linkDir(publicDir, standalonePublic);
if (existsSync(rootHotFolders)) linkDir(rootHotFolders, standaloneHotFolders);
if (existsSync(rootNextStatic)) linkDir(rootNextStatic, standaloneNextStatic);

const cacheDir = join(root, '.next', 'cache');
if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });

const publicSize = readdirSync(publicDir, { withFileTypes: true }).length;
console.log(`[compact-standalone] ok: public y static enlazados (${publicSize} entradas), cache limpiada`);
