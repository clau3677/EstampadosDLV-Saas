// /api/settings/* — configuración global de la empresa (datos bancarios, contacto, etc.)
// Persiste en la colección `app_settings` bajo el key `company_info`.
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';

const SETTINGS_COLLECTION = 'app_settings';
const COMPANY_KEY = 'company_info';

export const DEFAULT_SHIPPING = {
  pickup: {
    enabled: true,
    label: 'Retiro en taller',
    address: 'Galleguillos 1870, Quilpué',
    instructions: 'Te avisaremos cuando tu pedido esté listo para retirar.',
  },
  methods: [
    {
      key: 'standard',
      label: 'Envío estándar',
      carrier: 'Por coordinar',
      enabled: true,
      baseCost: 3990,
      etaMinDays: 2,
      etaMaxDays: 4,
    },
  ],
  zones: [
    {
      key: 'chile',
      label: 'Chile',
      regions: [],
      comunas: [],
      surcharge: 0,
      enabled: true,
    },
  ],
};

// Defaults que se usan si el admin nunca ha guardado nada.
// Sirven para que la web no se rompa en producción vacía.
const DEFAULTS = {
  companyName: 'Safebuildlv SpA',
  rut: '77.852.607-7',
  bankName: 'Banco Estado',
  accountType: 'Chequera Electrónica',
  accountNumber: '22870140049',
  accountHolder: 'Safebuildlv SpA',
  paymentEmail: 'estampadosdlv@gmail.com',
  contactEmail: 'estampadosdlv@gmail.com',
  contactPhone: '',
  address: '',
  instructions: '',
  shipping: DEFAULT_SHIPPING,
};

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 300) : fallback;
}

function cleanList(value, max = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, max);
}

function cleanMoney(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(Math.round(number), 1000000));
}

function cleanDays(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(Math.round(number), 90));
}

export function normalizeShipping(value) {
  const source = value && typeof value === 'object' ? value : {};
  const pickupSource = source.pickup && typeof source.pickup === 'object' ? source.pickup : {};
  const methodsSource = Array.isArray(source.methods) ? source.methods : DEFAULT_SHIPPING.methods;
  const zonesSource = Array.isArray(source.zones) ? source.zones : DEFAULT_SHIPPING.zones;

  const methods = methodsSource.slice(0, 20).map((method, index) => ({
    key: cleanText(method?.key, `method_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40),
    label: cleanText(method?.label, `Envío ${index + 1}`),
    carrier: cleanText(method?.carrier, 'Por coordinar'),
    enabled: method?.enabled !== false,
    baseCost: cleanMoney(method?.baseCost, 3990),
    etaMinDays: cleanDays(method?.etaMinDays, 2),
    etaMaxDays: Math.max(cleanDays(method?.etaMaxDays, 4), cleanDays(method?.etaMinDays, 2)),
  })).filter(method => method.key && method.label);

  const zones = zonesSource.slice(0, 50).map((zone, index) => ({
    key: cleanText(zone?.key, `zone_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40),
    label: cleanText(zone?.label, `Zona ${index + 1}`),
    regions: cleanList(zone?.regions),
    comunas: cleanList(zone?.comunas),
    surcharge: cleanMoney(zone?.surcharge, 0),
    enabled: zone?.enabled !== false,
  })).filter(zone => zone.key && zone.label);

  return {
    pickup: {
      enabled: pickupSource.enabled !== false,
      label: cleanText(pickupSource.label, DEFAULT_SHIPPING.pickup.label),
      address: cleanText(pickupSource.address, DEFAULT_SHIPPING.pickup.address),
      instructions: cleanText(pickupSource.instructions, DEFAULT_SHIPPING.pickup.instructions),
    },
    methods: methods.length ? methods : DEFAULT_SHIPPING.methods,
    zones: zones.length ? zones : DEFAULT_SHIPPING.zones,
  };
}

export async function loadCompany(db) {
  const doc = await db.collection(SETTINGS_COLLECTION).findOne({ key: COMPANY_KEY });
  const value = doc?.value || {};
  return { ...DEFAULTS, ...value, shipping: normalizeShipping(value.shipping) };
}

export default async function handleSettings(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/settings/company — lectura pública (usada en checkout/gracias)
  if (route === '/settings/company' && method === 'GET') {
    const data = await loadCompany(db);
    return json(data);
  }

  // PUT /api/settings/company — actualización sólo admin
  if (route === '/settings/company' && method === 'PUT') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') {
      return err('Sólo administradores pueden modificar la configuración de empresa', 403);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return err('JSON inválido', 400);
    }

    // Whitelist de campos permitidos + normalización (strings trim)
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (payload[k] === undefined) continue;
      if (k === 'shipping') {
        clean.shipping = normalizeShipping(payload.shipping);
      } else {
        clean[k] = typeof payload[k] === 'string' ? payload[k].trim() : payload[k];
      }
    }

    // Merge con lo existente (permite guardar sólo unos pocos campos)
    const current = await loadCompany(db);
    const merged = { ...current, ...clean, shipping: normalizeShipping(clean.shipping || current.shipping) };

    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: COMPANY_KEY },
      {
        $set: {
          key: COMPANY_KEY,
          value: merged,
          updatedAt: new Date(),
          updatedBy: user.email || user.id,
        },
      },
      { upsert: true },
    );

    return json({ ok: true, data: merged });
  }

  return null; // no aplica este handler
}
