/**
 * Utilidades compartidas del módulo de prospección:
 * normalización de emails, teléfonos, dominios y nombres.
 * Todas las claves de deduplicación/supresión pasan por aquí.
 */

export function normalizeEmail(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  // quitar alias: usuario+tag@dominio → usuario@dominio (Gmail)
  const [local, domain] = e.split('@');
  const base = local.split('+')[0].replace(/\./g, ''); // Gmail ignora puntos
  return `${base}@${domain}`;
}

export function emailDomain(email) {
  const e = normalizeEmail(email);
  return e ? e.split('@')[1] : null;
}

/**
 * Normaliza teléfono chileno a E.164 (Ej: +56912345678).
 * Acepta formatos: 912345678, +56 9 1234 5678, 56912345678, etc.
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9+]/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('569') && d.length === 12) {
    // +56 + celular de 9 dígitos
  } else if (d.startsWith('56') && d.length === 11) {
    d = '56' + d.slice(2); // ya correcto
  } else if (d.length === 9 && d.startsWith('9')) {
    d = '56' + d; // celular chileno sin país
  } else if (d.startsWith('56') && d.length === 10) {
    d = '569' + d.slice(2); // fijo corto: asumir celular incompleto → inválido
    return null;
  } else {
    return null; // formato desconocido
  }
  return '+' + d;
}

export function normalizeName(name) {
  if (!name) return null;
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const CHILE_DLV = {
  // Estampados DLV: Quilpué, Quinta Región
  lat: -33.0473,
  lon: -71.4428,
  company: 'Estampados DLV',
  phone: '+56954169052',
  contact: 'Sandra Vásquez',
  calendarLink: 'https://wa.me/56954169052',
  website: 'https://estampadosdlv.com',
};

export default {
  normalizeEmail,
  emailDomain,
  normalizePhone,
  normalizeName,
  CHILE_DLV,
};
