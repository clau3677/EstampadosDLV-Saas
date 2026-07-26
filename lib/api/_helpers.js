import { NextResponse } from 'next/server';
import path from 'path';

// CORS helper: reusable across all API modules
export const cors = (res) => {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
};

export const json = (data, init) => cors(NextResponse.json(data, init));
export const err = (message, status = 400) => cors(NextResponse.json({ error: message }, { status }));

// Where uploads land
export const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'designs');

// Slug utility (used for products, landings)
export const slugify = (str) =>
  (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// snake_case slug for taxonomy codes
export const codify = (str) =>
  (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export { NextResponse };
