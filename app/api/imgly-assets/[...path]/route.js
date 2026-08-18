import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Servidor dinámico de los assets del removedor de fondo (modelos ONNX, WASM
// y resources.json). Next.js en modo standalone SOLO sirve archivos estáticos
// que existían al momento del build; cualquier archivo nuevo en
// public/assets/imgly/ devolvería 404. Esta ruta los sirve siempre frescos.
// ============================================================================

const IMG_ROOT = path.join('/var/www/estampadosdlv/public/assets/imgly');

const ALLOWED = [
  'resources.json',
  'models',
  'onnxruntime-web',
];

export async function GET(_req, { params }) {
  try {
    const parts = await params;
    const rel = (parts.path || []).join('/');
    if (!rel) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const full = path.resolve(IMG_ROOT, rel);
    if (!full.startsWith(IMG_ROOT)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Solo permitir nombres de archivos/directorios de la whitelist
    const segs = rel.split('/').filter(Boolean);
    for (const s of segs) {
      if (!ALLOWED.includes(s) && s !== segs[segs.length - 1]) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const ct = full.endsWith('.json')
      ? 'application/json'
      : full.endsWith('.wasm')
        ? 'application/wasm'
        : 'application/octet-stream';

    const buf = fs.readFileSync(full);
    return new NextResponse(buf, {
      headers: {
        'content-type': ct,
        'content-length': String(buf.length),
        'cache-control': 'public, max-age=31536000, immutable',
        'accept-ranges': 'bytes',
      },
    });
  } catch (e) {
    console.error('[imgly-assets] error:', e.message);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
