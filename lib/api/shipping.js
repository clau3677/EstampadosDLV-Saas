// /api/shipping/options GET — opciones públicas de entrega
// /api/shipping/quote GET — cotización pública validada por zona y método
import { json, err } from './_helpers';
import { loadCompany, normalizeShipping } from './settings';

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesZone(zone, region, comuna) {
  if (zone.enabled === false) return false;
  const regionValue = normalized(region);
  const comunaValue = normalized(comuna);
  const regions = (zone.regions || []).map(normalized);
  const comunas = (zone.comunas || []).map(normalized);
  if (comunas.length && comunaValue && comunas.includes(comunaValue)) return true;
  if (regions.length && regionValue && regions.includes(regionValue)) return true;
  return !regions.length && !comunas.length;
}

function selectZone(zones, region, comuna) {
  const exact = zones.find(zone => zone.enabled !== false
    && comuna
    && (zone.comunas || []).map(normalized).includes(normalized(comuna)));
  if (exact) return exact;
  const byRegion = zones.find(zone => zone.enabled !== false
    && region
    && (zone.regions || []).map(normalized).includes(normalized(region)));
  if (byRegion) return byRegion;
  return zones.find(zone => matchesZone(zone, region, comuna)) || null;
}

export function buildShippingQuote(company, {
  deliveryMethod = 'pickup',
  shippingMethodKey,
  region = '',
  comuna = '',
} = {}) {
  const shipping = normalizeShipping(company?.shipping);

  if (deliveryMethod === 'pickup') {
    if (!shipping.pickup.enabled) return { ok: false, error: 'El retiro en taller no está disponible' };
    return {
      ok: true,
      deliveryMethod: 'pickup',
      methodKey: 'pickup',
      label: shipping.pickup.label,
      carrier: 'Taller Estampados DLV',
      cost: 0,
      etaMinDays: 0,
      etaMaxDays: 0,
      zoneKey: null,
      pickup: shipping.pickup,
    };
  }

  if (deliveryMethod !== 'shipping') return { ok: false, error: 'Método de entrega inválido' };

  const methods = shipping.methods.filter(method => method.enabled !== false);
  if (!methods.length) return { ok: false, error: 'No hay métodos de despacho disponibles' };
  const method = methods.find(item => item.key === shippingMethodKey) || methods[0];
  const zone = selectZone(shipping.zones, region, comuna);
  if (!zone) return { ok: false, error: 'No hay cobertura de despacho para la zona indicada' };

  return {
    ok: true,
    deliveryMethod: 'shipping',
    methodKey: method.key,
    label: method.label,
    carrier: method.carrier,
    cost: method.baseCost + zone.surcharge,
    baseCost: method.baseCost,
    surcharge: zone.surcharge,
    etaMinDays: method.etaMinDays,
    etaMaxDays: method.etaMaxDays,
    zoneKey: zone.key,
    zoneLabel: zone.label,
  };
}

function publicMethod(method, zone) {
  return {
    key: method.key,
    label: method.label,
    carrier: method.carrier,
    cost: method.baseCost + (zone?.surcharge || 0),
    baseCost: method.baseCost,
    surcharge: zone?.surcharge || 0,
    etaMinDays: method.etaMinDays,
    etaMaxDays: method.etaMaxDays,
    zoneKey: zone?.key || null,
    zoneLabel: zone?.label || null,
  };
}

export default async function handleShipping(ctx) {
  const { method, route, db, request } = ctx;
  if ((route !== '/shipping/options' && route !== '/shipping/quote') || method !== 'GET') return null;

  const url = new URL(request.url);
  const deliveryMethod = url.searchParams.get('deliveryMethod') || 'shipping';
  const region = url.searchParams.get('region') || '';
  const comuna = url.searchParams.get('comuna') || '';
  const shippingMethodKey = url.searchParams.get('methodKey') || '';
  const company = await loadCompany(db);

  if (route === '/shipping/quote') {
    const quote = buildShippingQuote(company, { deliveryMethod, shippingMethodKey, region, comuna });
    return quote.ok ? json(quote) : err(quote.error, 400);
  }

  const shipping = normalizeShipping(company.shipping);
  const zone = selectZone(shipping.zones, region, comuna);
  const methods = shipping.methods
    .filter(item => item.enabled !== false)
    .map(methodItem => publicMethod(methodItem, zone));

  return json({
    pickup: shipping.pickup,
    methods,
    zone: zone ? { key: zone.key, label: zone.label, surcharge: zone.surcharge } : null,
    coverage: Boolean(zone),
  });
}
