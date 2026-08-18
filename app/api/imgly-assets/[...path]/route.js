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
  // Segmentos de versión que imgly agrega (v1.4.5, latest) y los archivos
  // reales. Se validan por presencia física en disco, no por whitelist estricta.
  'small',
  'medium',
  'v1.4.5',
  'v1.5',
  'latest',
  '1x_model.json',
  '1x_model.bin',
];

export async function GET(_req, { params }) {
  try {
    const parts = await params;
    let rel = (parts.path || []).join('/');
    if (!rel) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // imgly solicita los modelos con subdirectorios de versión:
    // models/small/v1.4.5/1x_model.bin, models/small/latest/1x_model.bin, etc.
    // Los archivos reales son planos: models/small y models/medium.
    // Mapeamos cualquier subpath de versión al archivo plano real.
    const MODEL_KEY = { 'small': 'models/small', 'medium': 'models/medium' };
    const m = rel.match(/^models\/(small|medium)(?:\/.*)?$/);
    if (m) rel = MODEL_KEY[m[1]];

    const full = path.resolve(IMG_ROOT, rel);
    if (!full.startsWith(IMG_ROOT)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Solo permitir 2 segmentos: directorio (whitelist) + archivo concreto.
    // Todos los assets viven planos: models/{small|medium} y
    // onnxruntime-web/*.wasm. imgly pide paths como
    // models/small/v1.4.5/1x_model.bin, pero los archivos reales están
    // en models/{small|medium} y models/medium — si imgly añade subdirectorios
    // de versión, se mapean al archivo real plano más cercano.
    const segs = rel.split('/').filter(Boolean);
    for (const s of segs) {
      if (s === '.' || s === '..' || s.startsWith('.') || !ALLOWED.includes(s)) {
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
    const headers = {
      'content-type': ct,
      'content-length': String(buf.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'accept-ranges': 'bytes',
    };
    // Soporte de Range: imgly descarga los modelos por tramos de bytes
    // (offsets del resources.json). Sin esto, algunas redes/proxies truncan.
    const range = _req.headers.get('range');
    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.slice(6).split('-');
      const start = startStr ? parseInt(startStr, 10) : 0;
      const end = endStr ? parseInt(endStr, 10) : buf.length - 1;
      const len = end - start + 1;
      const slice = buf.subarray(start, end + 1);
      headers['content-range'] = `bytes ${start}-${end}/${buf.length}`;
      headers['content-length'] = String(len);
      return new NextResponse(slice, { status: 206, headers });
    }
    return new NextResponse(buf, { headers });
  } catch (e) {
    console.error('[imgly-assets] error:', e.message);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
