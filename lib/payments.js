// ============================================================================
// Payment providers helper — Webpay Plus (Transbank) + MercadoPago Chile
// Usa credenciales públicas de sandbox de Transbank cuando TBK_ENV=integration.
// ============================================================================

import {
  WebpayPlus, Options, Environment,
  IntegrationApiKeys, IntegrationCommerceCodes,
} from 'transbank-sdk';

export function webpayTx() {
  const isProd = process.env.TBK_ENV === 'production';
  const opts = new Options(
    isProd ? process.env.TBK_COMMERCE_CODE : IntegrationCommerceCodes.WEBPAY_PLUS,
    isProd ? process.env.TBK_API_KEY_SECRET : IntegrationApiKeys.WEBPAY,
    isProd ? Environment.Production : Environment.Integration,
  );
  return new WebpayPlus.Transaction(opts);
}

export function isMPConfigured() {
  return !!process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN.length > 5;
}

export async function mpCreatePreference({ orderNumber, items, backUrls, webhookUrl, payerEmail }) {
  if (!isMPConfigured()) throw new Error('MercadoPago no está configurado. Falta MP_ACCESS_TOKEN en .env');

  // Dynamic import para no cargar el SDK si no está configurado
  const { MercadoPagoConfig, Preference } = await import('mercadopago');
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const pref = new Preference(client);

  const result = await pref.create({
    body: {
      items: items.map((it, i) => ({
        id: it.id || `item-${i}`,
        title: it.title,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        currency_id: 'CLP',
      })),
      external_reference: orderNumber,
      back_urls: backUrls,
      auto_return: 'approved',
      notification_url: webhookUrl,
      payer: payerEmail ? { email: payerEmail } : undefined,
    },
  });

  return {
    id: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
    redirectUrl: process.env.TBK_ENV === 'production'
      ? result.init_point
      : (result.sandbox_init_point || result.init_point),
  };
}

export async function mpFetchPayment(paymentId) {
  if (!isMPConfigured()) throw new Error('MercadoPago no configurado');
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  return r.json();
}
