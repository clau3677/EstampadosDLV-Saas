// POST /api/uploads/design — sube imagen y extrae metadata (DPI real)
import { v4 as uuidv4 } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { json, err, UPLOAD_DIR } from './_helpers';

export default async function handleUploads(ctx) {
  const { method, route, request } = ctx;

  if (!(route === '/uploads/design' && method === 'POST')) return null;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return err('file requerido');

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const id = uuidv4();
  const filename = `${id}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await writeFile(filepath, buffer);

  let meta = {};
  try {
    meta = await sharp(buffer).metadata();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('sharp metadata failed', e);
  }
  const dpi = Math.round(meta.density || 72);
  const url = `/uploads/designs/${filename}`;

  return json({
    id,
    url,
    originalName: file.name,
    widthPx: meta.width || 0,
    heightPx: meta.height || 0,
    format: meta.format,
    dpi,
    sizeBytes: buffer.length,
  });
}
