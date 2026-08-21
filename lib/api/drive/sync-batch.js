import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { DRIVE_COLLECTION_ASSETS, DRIVE_COLLECTION_CONNS, getDrive, withRetry, sanitizeName } from './_helpers';

export const SYNC_STATE_KEY = 'drive_sync_state';
// Lotes pequeños para no agotar el timeout del proxy con PNG grandes.
export const SYNC_BATCH_SIZE = 4;
const ADMIN_ID = 'primary-admin';
const UPLOADS_BASE = '/var/www/estampadosdlv/public';

function emptyStats() {
  return { checked: 0, downloaded: 0, skipped: 0, failed: 0, deleted: 0, stale: 0 };
}

function normalizeState(value = {}) {
  return {
    version: 2,
    running: false,
    paused: false,
    completed: false,
    startedAt: value.startedAt || null,
    finishedAt: value.finishedAt || null,
    updatedAt: value.updatedAt || null,
    heartbeatAt: value.heartbeatAt || null,
    error: value.error || null,
    currentFolder: value.currentFolder || null,
    currentFolderName: value.currentFolderName || null,
    currentFile: value.currentFile || null,
    folderIds: Array.isArray(value.folderIds) ? value.folderIds : [],
    allFolderIds: Array.isArray(value.allFolderIds) ? value.allFolderIds : [],
    folderIndex: Number.isInteger(value.folderIndex) ? value.folderIndex : 0,
    pageToken: value.pageToken || null,
    pageNextToken: value.pageNextToken || null,
    pageFiles: Array.isArray(value.pageFiles) ? value.pageFiles : [],
    fileIndex: Number.isInteger(value.fileIndex) ? value.fileIndex : 0,
    liveIds: Array.isArray(value.liveIds) ? value.liveIds : [],
    totalDiscovered: Number(value.totalDiscovered) || 0,
    stats: { ...emptyStats(), ...(value.stats || {}) },
    globalTags: Array.isArray(value.globalTags) ? value.globalTags : [],
  };
}

async function saveState(db, state) {
  const next = { ...state, updatedAt: new Date(), heartbeatAt: new Date() };
  await db.collection('app_settings').updateOne(
    { key: SYNC_STATE_KEY },
    { $set: { key: SYNC_STATE_KEY, value: next } },
    { upsert: true },
  );
  return next;
}

async function loadState(db) {
  const row = await db.collection('app_settings').findOne({ key: SYNC_STATE_KEY });
  return normalizeState(row?.value || {});
}

async function expandFolders(drive, selectedFolderIds) {
  const all = [];
  const queue = [...selectedFolderIds];
  const seen = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    all.push(id);
    try {
      const res = await withRetry(() => drive.files.list({
        q: `'${id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)',
        pageSize: 200,
        spaces: 'drive',
      }));
      for (const child of res.data.files || []) queue.push(child.id);
    } catch (e) {
      console.warn('[drive/sync-batch] subfolder listing failed:', id, e.message);
    }
  }
  return all;
}

async function folderName(drive, folderId) {
  try {
    const res = await withRetry(() => drive.files.get({ fileId: folderId, fields: 'id, name' }));
    return res.data.name || 'sin-carpeta';
  } catch {
    return 'sin-carpeta';
  }
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function downloadStream(drive, fileId, target, tmp) {
  const dl = await withRetry(() => drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  ));
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(tmp);
    dl.data.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    dl.data.on('error', reject);
  });
  await fs.promises.access(tmp);
  try {
    await fs.promises.rename(tmp, target);
  } catch {
    await fs.promises.cp(tmp, target);
    await fs.promises.unlink(tmp).catch(() => {});
  }
}

async function processFile({ drive, assets, library, state, file, folderId, folderNameValue }) {
  const existing = await assets.findOne({ adminId: ADMIN_ID, driveFileId: file.id });
  const unchanged = existing && existing.modifiedTime === file.modifiedTime &&
    existing.md5Checksum === file.md5Checksum && existing.localPath && fs.existsSync(existing.localPath);

  if (unchanged) {
    await assets.updateOne(
      { _id: existing._id },
      { $set: { driveConnected: true, retainedLocally: true, driveDisconnectedAt: null, staleInDrive: false, lastSeenAt: new Date() } },
    );
    await library.updateOne(
      { source: 'drive', driveFileId: file.id },
      { $set: { driveConnected: true, retainedLocally: true, driveDisconnectedAt: null, staleInDrive: false, updatedAt: new Date() }, $setOnInsert: { id: uuidv4(), uses: 0, createdAt: new Date() } },
      { upsert: true },
    );
    return 'skipped';
  }

  const safeName = sanitizeName(file.name);
  const ext = path.extname(safeName) || (file.mimeType === 'image/png' ? '.png' : file.mimeType === 'image/jpeg' ? '.jpg' : file.mimeType === 'image/webp' ? '.webp' : '');
  const relDir = path.join('uploads', 'library', folderId).replace(/\\/g, '/');
  const absDir = path.join(UPLOADS_BASE, relDir.replace(/^\//, ''));
  await ensureDir(absDir);
  const finalName = `${file.id}${ext}`;
  const absFinal = path.join(absDir, finalName);
  const relFinal = `/${relDir}/${finalName}`;
  const tmpPath = `${absFinal}.tmp`;

  await downloadStream(drive, file.id, absFinal, tmpPath);
  const widthPx = file.imageMediaMetadata?.width || 1000;
  const heightPx = file.imageMediaMetadata?.height || 1000;
  const now = new Date();

  await assets.updateOne(
    { adminId: ADMIN_ID, driveFileId: file.id },
    {
      $set: {
        adminId: ADMIN_ID, driveFileId: file.id, folderId, folderName: folderNameValue,
        name: file.name, mimeType: file.mimeType, md5Checksum: file.md5Checksum || null,
        modifiedTime: file.modifiedTime, size: Number(file.size) || 0, localPath: absFinal,
        publicUrl: relFinal, widthPx, heightPx, driveConnected: true, retainedLocally: true,
        staleInDrive: false, driveDisconnectedAt: null, syncedAt: now, lastSeenAt: now,
      },
      $setOnInsert: { id: uuidv4(), createdAt: now },
    },
    { upsert: true },
  );

  const cleanName = file.name?.replace(/\.[^.]+$/, '') || 'sin-nombre';
  await library.updateOne(
    { source: 'drive', driveFileId: file.id },
    {
      $set: {
        name: cleanName, imageUrl: relFinal, srcWidthPx: widthPx, srcHeightPx: heightPx,
        tags: Array.from(new Set([...(state.globalTags || []), folderNameValue])), active: true,
        source: 'drive', driveFileId: file.id, driveFolderId: folderId, driveFolderName: folderNameValue,
        driveConnected: true, retainedLocally: true, staleInDrive: false, driveDisconnectedAt: null, updatedAt: now,
      },
      $setOnInsert: { id: uuidv4(), uses: 0, createdAt: now },
    },
    { upsert: true },
  );
  return 'downloaded';
}

async function processBatch({ db, state }) {
  const drive = await getDrive(db, ADMIN_ID);
  const assets = db.collection(DRIVE_COLLECTION_ASSETS);
  const library = db.collection('design_library');
  let processed = 0;

  while (processed < SYNC_BATCH_SIZE && state.folderIndex < state.allFolderIds.length) {
    const folderId = state.allFolderIds[state.folderIndex];
    state.currentFolder = folderId;
    if (!state.currentFolderName) state.currentFolderName = await folderName(drive, folderId);

    if (state.pageFiles.length === 0) {
      const listRes = await withRetry(() => drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, imageMediaMetadata(width,height))',
        pageSize: 200,
        spaces: 'drive',
        pageToken: state.pageToken || undefined,
      }));
      state.pageFiles = listRes.data.files || [];
      state.pageNextToken = listRes.data.nextPageToken || null;
      state.fileIndex = 0;
      state.totalDiscovered += state.pageFiles.length;
      await saveState(db, state);
      if (state.pageFiles.length === 0) {
        state.pageToken = state.pageNextToken;
        state.pageNextToken = null;
        state.folderIndex += 1;
        state.currentFolderName = null;
        continue;
      }
    }

    const file = state.pageFiles[state.fileIndex];
    if (!file) {
      state.pageToken = state.pageNextToken;
      state.pageNextToken = null;
      state.pageFiles = [];
      state.fileIndex = 0;
      if (!state.pageToken) {
        state.folderIndex += 1;
        state.currentFolderName = null;
      }
      await saveState(db, state);
      continue;
    }

    state.currentFile = file.name || file.id;
    if (file.id) state.liveIds = Array.from(new Set([...state.liveIds, file.id]));
    try {
      state.stats.checked += 1;
      const action = await processFile({ drive, assets, library, state, file, folderId, folderNameValue: state.currentFolderName || 'sin-carpeta' });
      state.stats[action] = (state.stats[action] || 0) + 1;
    } catch (e) {
      state.stats.checked = Math.max(0, state.stats.checked);
      state.stats.failed += 1;
      state.error = `Error en ${file.name || file.id}: ${e.message}`;
      console.error('[drive/sync-batch] failed:', file.id, e.message);
    }
    state.fileIndex += 1;
    processed += 1;
    await saveState(db, state);
  }

  if (state.folderIndex >= state.allFolderIds.length && state.pageFiles.length === 0) {
    const live = new Set(state.liveIds);
    const stale = await assets.find({ adminId: ADMIN_ID, driveFileId: { $nin: Array.from(live) } }).toArray();
    state.stats.stale = stale.length;
    // Nunca borrar binarios ni registros automáticamente. Se marcan como retenidos
    // para que quitar una carpeta de Drive no elimine trabajo local del negocio.
    if (stale.length > 0) {
      await assets.updateMany(
        { adminId: ADMIN_ID, driveFileId: { $nin: Array.from(live) } },
        { $set: { driveConnected: false, retainedLocally: true, staleInDrive: true, lastSeenAt: new Date() } },
      );
      await library.updateMany(
        { source: 'drive', driveFileId: { $nin: Array.from(live) } },
        { $set: { driveConnected: false, retainedLocally: true, staleInDrive: true, updatedAt: new Date() } },
      );
    }
    state.running = false;
    state.paused = false;
    state.completed = true;
    state.finishedAt = new Date();
    state.currentFile = null;
    state.currentFolder = null;
    state.currentFolderName = null;
    await saveState(db, state);
  }

  return state;
}

export async function startBatchSync({ db, body = {} }) {
  const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
  if (!conn) throw new Error('DRIVE_NOT_CONNECTED');
  const folderIds = Array.isArray(conn.selectedFolderIds) ? conn.selectedFolderIds.map(String) : [];
  if (folderIds.length === 0) throw new Error('Selecciona al menos 1 carpeta primero');

  const current = await loadState(db);
  const sameSelection = JSON.stringify(current.folderIds) === JSON.stringify(folderIds);
  let state = current;
  if (!(current.running || (current.paused && !current.completed)) || !sameSelection) {
    const drive = await getDrive(db, ADMIN_ID);
    const allFolderIds = await expandFolders(drive, folderIds);
    state = normalizeState({
      version: 2, running: true, paused: false, completed: false,
      startedAt: new Date(), folderIds, allFolderIds,       folderIndex: 0,
      currentFolderName: null,
      pageToken: null, pageNextToken: null, pageFiles: [], fileIndex: 0,
      liveIds: [], totalDiscovered: 0, stats: emptyStats(), globalTags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    });
  } else {
    state.running = true;
    state.paused = false;
    state.error = null;
  }
  // El inicio es inmediato: cada lote se procesa mediante /sync/continue.
  // Esto evita que una petición larga caduque mientras Drive descarga PNG grandes.
  return saveState(db, state);
}

export async function continueBatchSync({ db }) {
  const state = await loadState(db);
  if (state.completed || (!state.running && !state.paused)) return state;
  state.running = true;
  state.paused = false;
  state.error = null;
  try {
    return await processBatch({ db, state: await saveState(db, state) });
  } catch (e) {
    state.running = false;
    state.paused = true;
    state.error = e.message;
    await saveState(db, state);
    throw e;
  }
}
