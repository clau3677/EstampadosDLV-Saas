// /app/lib/api/drive/index.js
// ============================================================================
// Dispatcher de /api/drive/* — integración con Google Drive.
// Endpoints:
//   • GET  /api/drive/oauth/start          → redirect a Google (con state)
//   • GET  /api/drive/oauth/callback       → recibe code, guarda tokens
//   • GET  /api/drive/status               → estado conexión + email
//   • POST /api/drive/disconnect           → revoca + limpia
//   • GET  /api/drive/folders              → árbol de carpetas
//   • POST /api/drive/folders/select       → guarda carpetas seleccionadas
//   • POST /api/drive/sync                 → sync manual de imágenes
//   • GET  /api/drive/sync/progress        → estado del último sync
// ----------------------------------------------------------------------------
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from '../_helpers';
import {
  SCOPES, getRedirectUri, encryptJson, decryptJson,
  getOAuthClient, getDrive, withRetry, sanitizeName,
  DRIVE_COLLECTION_CONNS, DRIVE_COLLECTION_ASSETS,
} from './_helpers';

// Como este es una app single-tenant, adminId es fijo. Si en el futuro se
// vuelve multi-admin, cambiar a ctx.user.id.
const ADMIN_ID = 'primary-admin';

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads', 'library');
const SYNC_STATE_KEY = 'drive_sync_state';

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

// ============================================================================
export default async function handleDrive(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/drive')) return null;

  // -------------------------------------------------------------------------
  // GET /api/drive/oauth/start
  // Redirige a Google OAuth consent screen con state CSRF.
  // -------------------------------------------------------------------------
  if (route === '/drive/oauth/start' && method === 'GET') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return err('Google OAuth no configurado en el servidor', 503);
    }
    const state = crypto.randomBytes(16).toString('hex');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(),
    );
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',           // fuerza refresh_token en cada reconexión
      include_granted_scopes: true,
      scope: SCOPES,
      state,
    });
    const res = NextResponse.redirect(url);
    res.cookies.set('drive_oauth_state', state, {
      httpOnly: true, sameSite: 'lax',
      secure: process.env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'),
      path: '/', maxAge: 60 * 10, // 10 min
    });
    return res;
  }

  // -------------------------------------------------------------------------
  // GET /api/drive/oauth/callback
  // Recibe ?code=X&state=Y de Google. Valida state, intercambia por tokens,
  // consulta email del usuario, guarda todo cifrado en Mongo.
  // Al terminar redirige a /admin/design-library?connected=1
  // -------------------------------------------------------------------------
  if (route === '/drive/oauth/callback' && method === 'GET') {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const stateCookie = request.cookies.get('drive_oauth_state')?.value;

    if (!code) return err('code faltante', 400);
    if (!state || state !== stateCookie) return err('state inválido (posible CSRF)', 400);

    try {
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri(),
      );
      const { tokens } = await oauth2.getToken(code);

      // Obtener email del usuario para mostrar en la UI
      oauth2.setCredentials(tokens);
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
      let email = null;
      try {
        const info = await oauth2Api.userinfo.get();
        email = info?.data?.email || null;
      } catch { /* no crítico */ }

      // Preserva refresh_token existente si Google no lo devuelve esta vez
      const existing = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
      const refreshTokenToStore = tokens.refresh_token
        ? { refresh_token: tokens.refresh_token }
        : existing?.refreshTokenEnc ? decryptJson(existing.refreshTokenEnc) : null;

      if (!refreshTokenToStore?.refresh_token) {
        return err('No se recibió refresh_token. Reconecta con "Revocar acceso" en https://myaccount.google.com/permissions e intenta de nuevo.', 400);
      }

      await db.collection(DRIVE_COLLECTION_CONNS).updateOne(
        { adminId: ADMIN_ID },
        {
          $set: {
            adminId: ADMIN_ID,
            email,
            accessTokenEnc:  encryptJson({ access_token: tokens.access_token }),
            refreshTokenEnc: encryptJson(refreshTokenToStore),
            expiryDate:      tokens.expiry_date || (Date.now() + 55 * 60 * 1000),
            scopes:          tokens.scope ? tokens.scope.split(' ') : SCOPES,
            connectedAt:     existing?.connectedAt || new Date(),
            updatedAt:       new Date(),
          },
          $setOnInsert: {
            selectedFolderIds: [],
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/design-library?connected=1`;
      const res = NextResponse.redirect(redirectUrl);
      res.cookies.delete('drive_oauth_state');
      return res;
    } catch (e) {
      console.error('[drive/callback] error:', e.message);
      return err(`Error intercambiando código: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/drive/status
  // Retorna estado de la conexión (público en el sentido admin — el resto de
  // endpoints exigen que exista conexión).
  // -------------------------------------------------------------------------
  if (route === '/drive/status' && method === 'GET') {
    const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
    if (!conn) {
      return json({
        connected: false,
        oauthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      });
    }

    // Contar assets sincronizados
    const totalAssets = await db.collection(DRIVE_COLLECTION_ASSETS).countDocuments({ adminId: ADMIN_ID });
    const lastSync = await db.collection('app_settings').findOne({ key: SYNC_STATE_KEY });

    return json({
      connected: true,
      email: conn.email,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
      selectedFolderIds: conn.selectedFolderIds || [],
      selectedFolderCount: (conn.selectedFolderIds || []).length,
      totalAssets,
      lastSyncAt: lastSync?.value?.finishedAt || null,
      lastSyncStats: lastSync?.value?.stats || null,
      tokenExpiresAt: new Date(conn.expiryDate),
      oauthConfigured: true,
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/drive/disconnect
  // Revoca el refresh_token y limpia locales.
  // -------------------------------------------------------------------------
  if (route === '/drive/disconnect' && method === 'POST') {
    const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
    if (conn?.refreshTokenEnc) {
      try {
        const { refresh_token } = decryptJson(conn.refreshTokenEnc);
        if (refresh_token) {
          const oauth2 = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
          );
          await oauth2.revokeToken(refresh_token);
        }
      } catch (e) {
        console.warn('[drive/disconnect] revoke failed (proceeding anyway):', e.message);
      }
    }
    await db.collection(DRIVE_COLLECTION_CONNS).deleteOne({ adminId: ADMIN_ID });
    await db.collection(DRIVE_COLLECTION_ASSETS).deleteMany({ adminId: ADMIN_ID });
    // También limpiar registros de design_library que provinieron de drive
    await db.collection('design_library').deleteMany({ source: 'drive' });
    return json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // GET /api/drive/folders
  // Lista TODAS las carpetas del Drive (folders son files con mimeType folder).
  // Retorna { folders: [{id, name, parents}], selectedFolderIds }.
  // -------------------------------------------------------------------------
  if (route === '/drive/folders' && method === 'GET') {
    try {
      const drive = await getDrive(db, ADMIN_ID);
      const folders = [];
      let pageToken;
      do {
        // eslint-disable-next-line no-await-in-loop
        const res = await withRetry(() => drive.files.list({
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'nextPageToken, files(id, name, parents, modifiedTime)',
          spaces: 'drive',
          corpora: 'user',
          pageSize: 200,
          pageToken,
          orderBy: 'name',
        }));
        folders.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      // Para cada carpeta, contar # imágenes rápido (opcional — puede ser caro)
      // Lo hacemos ligero: solo si hay <= 100 folders
      let folderImageCounts = {};
      if (folders.length <= 100) {
        for (const f of folders) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const r = await withRetry(() => drive.files.list({
              q: `'${f.id}' in parents and trashed = false and mimeType contains 'image/'`,
              fields: 'files(id)',
              pageSize: 1000,
              spaces: 'drive',
            }));
            folderImageCounts[f.id] = (r.data.files || []).length;
          } catch { folderImageCounts[f.id] = 0; }
        }
      }

      const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
      return json({
        folders,
        selectedFolderIds: conn?.selectedFolderIds || [],
        imageCounts: folderImageCounts,
      });
    } catch (e) {
      if (e.message === 'DRIVE_NOT_CONNECTED') return err('Drive no conectado', 401);
      console.error('[drive/folders] error:', e.message);
      return err(`Error listando carpetas: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/drive/folders/select
  // Body: { folderIds: string[] }
  // Guarda las carpetas seleccionadas por el admin.
  // -------------------------------------------------------------------------
  if (route === '/drive/folders/select' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const folderIds = Array.isArray(body.folderIds) ? body.folderIds.map(String) : [];
    await db.collection(DRIVE_COLLECTION_CONNS).updateOne(
      { adminId: ADMIN_ID },
      { $set: { selectedFolderIds: folderIds, updatedAt: new Date() } },
    );
    return json({ ok: true, selectedFolderIds: folderIds });
  }

  // -------------------------------------------------------------------------
  // POST /api/drive/sync
  // Sincroniza imágenes de las carpetas seleccionadas al disco local.
  // - Streamea binarios (memoria-eficiente)
  // - Idempotente: skip si md5+modifiedTime coinciden
  // - Publica cada imagen sincronizada en design_library
  // Body: { tags?: string[] } — tags globales para las nuevas plantillas
  // -------------------------------------------------------------------------
  if (route === '/drive/sync' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const globalTags = Array.isArray(body.tags) ? body.tags.map(String) : [];

    try {
      const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId: ADMIN_ID });
      if (!conn) return err('Drive no conectado', 401);
      const folderIds = conn.selectedFolderIds || [];
      if (folderIds.length === 0) {
        return err('Selecciona al menos 1 carpeta primero', 400);
      }

      const drive = await getDrive(db, ADMIN_ID);
      const assets = db.collection(DRIVE_COLLECTION_ASSETS);
      const library = db.collection('design_library');

      const stats = { checked: 0, downloaded: 0, skipped: 0, failed: 0, deleted: 0 };
      const details = [];
      const now = new Date();

      // Marcar sync como iniciado (para /sync/progress)
      await db.collection('app_settings').updateOne(
        { key: SYNC_STATE_KEY },
        { $set: { key: SYNC_STATE_KEY, value: { startedAt: now, running: true, stats: null } } },
        { upsert: true },
      );

      // Set de driveFileIds vivos (para detectar borrados en Drive)
      const liveIds = new Set();

      // BFS: colectar todas las subcarpetas recursivamente
      const allFolderIds = new Set(folderIds);
      for (const rootId of folderIds) {
        // eslint-disable-next-line no-await-in-loop
        let subPageToken;
        do {
          // eslint-disable-next-line no-await-in-loop
          const subListRes = await withRetry(() => drive.files.list({
            q: `'${rootId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'nextPageToken, files(id)',
            pageSize: 200,
            spaces: 'drive',
            pageToken: subPageToken,
          })).catch(() => ({ data: { files: [], nextPageToken: null } }));
          for (const sf of subListRes.data.files || []) {
            if (sf.id) allFolderIds.add(sf.id);
          }
          subPageToken = subListRes.data.nextPageToken;
        } while (subPageToken);
        // Also search subfolders of subfolders (2 levels deep)
        const subIds = Array.from(allFolderIds);
        for (const subId of subIds) {
          let sub2PageToken;
          do {
            const sub2Res = await withRetry(() => drive.files.list({
              q: `'${subId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
              fields: 'nextPageToken, files(id)',
              pageSize: 200,
              spaces: 'drive',
              pageToken: sub2PageToken,
            })).catch(() => ({ data: { files: [], nextPageToken: null } }));
            for (const sf2 of sub2Res.data.files || []) {
              if (sf2.id) allFolderIds.add(sf2.id);
            }
            sub2PageToken = sub2Res.data.nextPageToken;
          } while (sub2PageToken);
        }
      }
      for (const folderId of allFolderIds) {
        // Obtener nombre de la carpeta (para tag automático)
        // eslint-disable-next-line no-await-in-loop
        const folderMeta = await withRetry(() => drive.files.get({
          fileId: folderId,
          fields: 'id, name',
        })).catch(() => null);
        const folderName = folderMeta?.data?.name || 'sin-carpeta';

        // Listar imágenes de la carpeta (paginado)
        let pageToken;
        do {
          // eslint-disable-next-line no-await-in-loop
          const listRes = await withRetry(() => drive.files.list({
            q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, imageMediaMetadata(width,height))',
            pageSize: 200,
            spaces: 'drive',
            pageToken,
          }));

          for (const f of listRes.data.files || []) {
            stats.checked++;
            if (!f.id || !f.mimeType?.startsWith('image/')) { stats.skipped++; continue; }
            liveIds.add(f.id);

            // ¿Cambió el archivo? md5 + modifiedTime como llaves de idempotencia
            // eslint-disable-next-line no-await-in-loop
            const existing = await assets.findOne({ adminId: ADMIN_ID, driveFileId: f.id });
            if (existing &&
                existing.modifiedTime === f.modifiedTime &&
                existing.md5Checksum === f.md5Checksum &&
                existing.localPath && fs.existsSync(existing.localPath)) {
              stats.skipped++;
              continue;
            }

            // Descargar stream → disco local
            const safeName = sanitizeName(f.name);
            const ext = path.extname(safeName) || (f.mimeType === 'image/png' ? '.png'
                        : f.mimeType === 'image/jpeg' ? '.jpg'
                        : f.mimeType === 'image/webp' ? '.webp'
                        : '');
            const relDir = path.join('uploads', 'library', folderId);
            const absDir = path.join(process.cwd(), 'public', relDir);
            // eslint-disable-next-line no-await-in-loop
            await ensureDir(absDir);
            const finalName = `${f.id}${ext}`;
            const absFinal = path.join(absDir, finalName);
            const relFinal = `/${relDir}/${finalName}`.replace(/\\/g, '/');
            const tmpPath  = `${absFinal}.tmp`;

            try {
              // eslint-disable-next-line no-await-in-loop
              const dl = await withRetry(() => drive.files.get(
                { fileId: f.id, alt: 'media' },
                { responseType: 'stream' },
              ));
              // eslint-disable-next-line no-await-in-loop
              await pipeline(dl.data, fs.createWriteStream(tmpPath));
              // eslint-disable-next-line no-await-in-loop
              await fs.promises.rename(tmpPath, absFinal);

              const widthPx  = f.imageMediaMetadata?.width  || 1000;
              const heightPx = f.imageMediaMetadata?.height || 1000;

              // Upsert en drive_assets (auditoría técnica)
              // eslint-disable-next-line no-await-in-loop
              await assets.updateOne(
                { adminId: ADMIN_ID, driveFileId: f.id },
                {
                  $set: {
                    adminId: ADMIN_ID,
                    driveFileId: f.id,
                    folderId,
                    folderName,
                    name: f.name,
                    mimeType: f.mimeType,
                    md5Checksum: f.md5Checksum || null,
                    modifiedTime: f.modifiedTime,
                    size: Number(f.size) || 0,
                    localPath: absFinal,
                    publicUrl: relFinal,
                    widthPx, heightPx,
                    syncedAt: new Date(),
                  },
                  $setOnInsert: {
                    id: uuidv4(),
                    createdAt: new Date(),
                  },
                },
                { upsert: true },
              );

              // Upsert en design_library (lo que ven los clientes)
              const cleanName = f.name?.replace(/\.[^.]+$/, '') || 'sin-nombre';
              // eslint-disable-next-line no-await-in-loop
              await library.updateOne(
                { source: 'drive', driveFileId: f.id },
                {
                  $set: {
                    name: cleanName,
                    imageUrl: relFinal,
                    srcWidthPx: widthPx,
                    srcHeightPx: heightPx,
                    tags: Array.from(new Set([...globalTags, folderName])),
                    active: true,
                    source: 'drive',
                    driveFileId: f.id,
                    driveFolderId: folderId,
                    driveFolderName: folderName,
                    updatedAt: new Date(),
                  },
                  $setOnInsert: {
                    id: uuidv4(),
                    uses: 0,
                    createdAt: new Date(),
                  },
                },
                { upsert: true },
              );

              stats.downloaded++;
              details.push({ id: f.id, name: f.name, folder: folderName, action: 'downloaded' });
            } catch (dlErr) {
              console.error(`[drive/sync] failed to download ${f.id}:`, dlErr.message);
              stats.failed++;
              details.push({ id: f.id, name: f.name, action: 'failed', error: dlErr.message });
            }
          }
          pageToken = listRes.data.nextPageToken;
        } while (pageToken);
      }

      // Detectar archivos borrados/removidos del Drive: eliminar local y de library
      const stale = await assets.find({ adminId: ADMIN_ID, driveFileId: { $nin: Array.from(liveIds) } }).toArray();
      for (const s of stale) {
        try {
          if (s.localPath && fs.existsSync(s.localPath)) {
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.unlink(s.localPath);
          }
        } catch (e) { /* silencioso */ }
        // eslint-disable-next-line no-await-in-loop
        await library.deleteOne({ source: 'drive', driveFileId: s.driveFileId });
        // eslint-disable-next-line no-await-in-loop
        await assets.deleteOne({ _id: s._id });
        stats.deleted++;
      }

      // Actualizar state
      const finalState = { startedAt: now, finishedAt: new Date(), running: false, stats };
      await db.collection('app_settings').updateOne(
        { key: SYNC_STATE_KEY },
        { $set: { key: SYNC_STATE_KEY, value: finalState } },
        { upsert: true },
      );

      return json({ ok: true, stats, details: details.slice(0, 100) });
    } catch (e) {
      if (e.message === 'DRIVE_NOT_CONNECTED') return err('Drive no conectado', 401);
      console.error('[drive/sync] error:', e.message);
      await db.collection('app_settings').updateOne(
        { key: SYNC_STATE_KEY },
        { $set: { key: SYNC_STATE_KEY, value: { finishedAt: new Date(), running: false, error: e.message } } },
        { upsert: true },
      );
      return err(`Error de sync: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/drive/sync/progress
  // Retorna estado del último/actual sync.
  // -------------------------------------------------------------------------
  if (route === '/drive/sync/progress' && method === 'GET') {
    const state = await db.collection('app_settings').findOne({ key: SYNC_STATE_KEY });
    return json(state?.value || { running: false, finishedAt: null });
  }

  // -------------------------------------------------------------------------
  // GET /api/drive/assets — lista assets sincronizados (para debug/preview)
  // -------------------------------------------------------------------------
  if (route === '/drive/assets' && method === 'GET') {
    const rows = await db.collection(DRIVE_COLLECTION_ASSETS)
      .find({ adminId: ADMIN_ID })
      .sort({ syncedAt: -1 })
      .limit(200)
      .toArray();
    return json(strip(rows));
  }

  return null;
}
