// /api/settings/* — configuración global de la empresa (datos bancarios, contacto, etc.)
// Persiste en la colección `app_settings` bajo el key `company_info`.
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';

const SETTINGS_COLLECTION = 'app_settings';
const COMPANY_KEY = 'company_info';

// Defaults que se usan si el admin nunca ha guardado nada.
// Sirven para que la web no se rompa en producción vacía.
const DEFAULTS = {
  companyName: 'Estampados DLV SpA',
  rut: '77.123.456-7',
  bankName: 'BancoEstado',
  accountType: 'Cuenta Vista',
  accountNumber: '12345678',
  accountHolder: 'Estampados DLV SpA',
  paymentEmail: 'pagos@estampadosdlv.cl',
  contactEmail: 'contacto@estampadosdlv.cl',
  contactPhone: '',
  address: '',
  instructions: '',
};

async function loadCompany(db) {
  const doc = await db.collection(SETTINGS_COLLECTION).findOne({ key: COMPANY_KEY });
  return { ...DEFAULTS, ...(doc?.value || {}) };
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
      if (payload[k] !== undefined) {
        clean[k] = typeof payload[k] === 'string' ? payload[k].trim() : payload[k];
      }
    }

    // Merge con lo existente (permite guardar sólo unos pocos campos)
    const current = await loadCompany(db);
    const merged = { ...current, ...clean };

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
