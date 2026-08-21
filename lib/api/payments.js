// /app/lib/api/payments.js
// ============================================================================
// Endpoints /api/payments/*
// Integraciones con WebPay Plus (Transbank) y MercadoPago Chile.
// ----------------------------------------------------------------------------
//   • GET  /api/payments/status                        — estado público de pasarelas
//   • POST /api/payments/webpay/create                 — inicia transacción Webpay
//   • POST /api/payments/webpay/confirm                — confirma retorno Webpay (token_ws)
//   • POST /api/payments/mercadopago/create-preference — crea preference MP
//   • POST /api/payments/mercadopago/webhook           — recibe IPN notifications
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, ORDER_STATUS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { webpayTx, isMPConfigured, mpCreatePreference, mpFetchPayment } from '@/lib/payments';
import { consumeReservedStockForOrder } from './orders';

// ----------------------------------------------------------------------------
// Determina el entorno de las pasarelas de pago.
// Retorna un objeto describiendo qué está habilitado y en qué modo.
// ----------------------------------------------------------------------------
function paymentsStatus() {
  const tbkEnv = String(process.env.TBK_ENV || 'integration').toLowerCase();
  const isWebpayProd = tbkEnv === 'production';
  // Sandbox de Transbank SIEMPRE está disponible con credenciales públicas.
  const webpayEnabled = true;

  const mpEnabled = isMPConfigured();
  const mpToken   = process.env.MP_ACCESS_TOKEN || '';
  const mpMode    = mpToken.startsWith('TEST-') ? 'sandbox'
                  : mpToken.startsWith('APP_USR-') ? 'production'
                  : mpToken ? 'unknown' : 'not_configured';

  const webpayMode = isWebpayProd ? 'production' : 'sandbox';

  return {
    webpay: {
      enabled: webpayEnabled,
      mode: webpayMode,
      productionReady: isWebpayProd &&
                       !!process.env.TBK_COMMERCE_CODE &&
                       !!process.env.TBK_API_KEY_SECRET,
    },
    mercadopago: {
      enabled: mpEnabled,
      mode: mpMode,
      hasWebhookSecret: !!process.env.MP_WEBHOOK_SECRET,
    },
    // Otros métodos siempre disponibles (no requieren keys)
    transfer: { enabled: true },
    cash: { enabled: true },
  };
}

// ----------------------------------------------------------------------------
// Marca un pedido como PAID en Mongo tras confirmación exitosa del gateway.
// La actualización y el consumo de stock son idempotentes ante webhooks repetidos.
// ----------------------------------------------------------------------------
async function markOrderPaid(db, orderId, provider, transactionRef, extra = {}) {
  const orders = db.collection(COLLECTIONS.ORDERS);
  const current = await orders.findOne({ id: orderId });
  if (!current) return { ok: false, reason: 'order_not_found' };

  if (current.paymentStatus === 'paid') {
    if (current.stockReservationStatus !== 'consumed') {
      await consumeReservedStockForOrder(db, orderId, current.orderNumber);
    }
    return { ok: true, alreadyPaid: true };
  }

  const now = new Date();
  const update = {
    status: ORDER_STATUS.PAID,
    paymentStatus: 'paid',
    paymentConfirmedAt: now,
    paymentProvider: provider,
    paymentTransactionRef: transactionRef,
    updatedAt: now,
    ...extra,
  };
  const result = await orders.updateOne(
    { id: orderId, paymentStatus: { $ne: 'paid' } },
    { $set: update },
  );
  if (result.matchedCount !== 1) return { ok: true, alreadyPaid: true };

  // Consumir stock reservado → stock físico (pago confirmado por pasarela).
  // Si falla, se propaga para que el gateway pueda reintentar y no se oculte
  // una inconsistencia de inventario.
  const updated = await orders.findOne({ id: orderId });
  await consumeReservedStockForOrder(db, orderId, updated?.orderNumber || current.orderNumber);
  return { ok: true, paid: true };
}

// ----------------------------------------------------------------------------
// Registra una transacción en payment_transactions (auditoría/logs).
// ----------------------------------------------------------------------------
async function logTransaction(db, doc) {
  await db.collection(COLLECTIONS.PAYMENT_TRANSACTIONS).insertOne({
    id: uuidv4(),
    createdAt: new Date(),
    ...doc,
  });
}

// ============================================================================
export default async function handlePayments(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/payments')) return null;

  // -------------------------------------------------------------------------
  // GET /api/payments/status — estado público de pasarelas
  // -------------------------------------------------------------------------
  if (route === '/payments/status' && method === 'GET') {
    return json(paymentsStatus());
  }

  // -------------------------------------------------------------------------
  // POST /api/payments/webpay/create { orderNumber }
  // Inicia una transacción WebPay Plus. Devuelve { url, token } — el frontend
  // debe hacer POST a { url } con { token_ws: token } (o simplemente redirigir
  // a `url?token_ws=token` cuando Webpay lo requiera con GET).
  // -------------------------------------------------------------------------
  if (route === '/payments/webpay/create' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const orderNumber = String(body.orderNumber || '').trim();
    if (!orderNumber) return err('orderNumber requerido', 400);

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber });
    if (!order) return err('pedido no encontrado', 404);
    if (order.paymentStatus === 'paid') return err('pedido ya pagado', 409);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/checkout/webpay-return`;

    // buyOrder debe ser <= 26 chars. sessionId <= 61.
    // Nuestro orderNumber DLV-2025-XXXXXX cabe holgado.
    const buyOrder = orderNumber.slice(0, 26);
    const sessionId = `sess-${order.id.slice(0, 40)}`;
    const amount = Math.round(Number(order.total || 0));
    if (amount < 50) return err('monto inválido (mínimo $50)', 400);

    try {
      const tx = webpayTx();
      const resp = await tx.create(buyOrder, sessionId, amount, returnUrl);
      // resp = { token, url }

      await logTransaction(db, {
        provider: 'webpay',
        action: 'create',
        orderId: order.id,
        orderNumber,
        buyOrder,
        sessionId,
        amount,
        token: resp.token,
        returnUrl,
        response: resp,
      });

      return json({
        ok: true,
        redirectUrl: `${resp.url}?token_ws=${resp.token}`,
        url: resp.url,
        token: resp.token,
      });
    } catch (e) {
      console.error('[webpay/create] error:', e);
      return err(`Webpay error: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/payments/webpay/confirm { token_ws }
  // Confirma la transacción tras el retorno de Transbank. Debe llamarse UNA vez.
  // -------------------------------------------------------------------------
  if (route === '/payments/webpay/confirm' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const tokenWs = String(body.token_ws || body.tokenWs || '').trim();
    if (!tokenWs) return err('token_ws requerido', 400);

    try {
      const tx = webpayTx();
      const resp = await tx.commit(tokenWs);
      // resp incluye: vci, amount, status, buy_order, session_id, card_detail,
      //   accounting_date, transaction_date, authorization_code, payment_type_code,
      //   response_code, installments_amount, installments_number, balance

      const approved = resp.response_code === 0 && resp.status === 'AUTHORIZED';
      const orderNumber = resp.buy_order;
      const order = await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber });

      await logTransaction(db, {
        provider: 'webpay',
        action: 'confirm',
        orderId: order?.id || null,
        orderNumber,
        token: tokenWs,
        amount: resp.amount,
        approved,
        response: resp,
      });

      if (order && approved) {
        await markOrderPaid(db, order.id, 'webpay', resp.authorization_code, {
          paymentToken: tokenWs,
          paymentCardLast4: resp.card_detail?.card_number || null,
          paymentAmount: resp.amount,
        });
      }

      return json({
        ok: approved,
        approved,
        orderNumber,
        amount: resp.amount,
        authorizationCode: resp.authorization_code,
        responseCode: resp.response_code,
        cardLast4: resp.card_detail?.card_number || null,
      });
    } catch (e) {
      console.error('[webpay/confirm] error:', e);
      return err(`Webpay confirm error: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/payments/mercadopago/create-preference { orderNumber }
  // Crea una MP Preference y devuelve el redirectUrl (init_point o sandbox_init_point).
  // -------------------------------------------------------------------------
  if (route === '/payments/mercadopago/create-preference' && method === 'POST') {
    if (!isMPConfigured()) return err('MercadoPago no configurado (falta MP_ACCESS_TOKEN)', 503);

    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const orderNumber = String(body.orderNumber || '').trim();
    if (!orderNumber) return err('orderNumber requerido', 400);

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber });
    if (!order) return err('pedido no encontrado', 404);
    if (order.paymentStatus === 'paid') return err('pedido ya pagado', 409);

    // Traer los items del pedido para armar la preferencia
    const orderItems = await db.collection(COLLECTIONS.ORDER_ITEMS)
      .find({ orderId: order.id }).toArray();

    const items = orderItems.length > 0
      ? orderItems.map(it => ({
          id: it.productId || it.variantId,
          title: it.productName || it.name || `Item ${it.productId}`,
          quantity: Number(it.quantity) || 1,
          unitPrice: Math.round(Number(it.unitPrice ?? it.price ?? 0)),
        }))
      : [{
          id: order.id,
          title: `Pedido ${orderNumber}`,
          quantity: 1,
          unitPrice: Math.round(Number(order.total || 0)),
        }];

    // Agregar shipping como item extra si aplica
    if (order.shipping && Number(order.shipping) > 0) {
      items.push({
        id: 'shipping',
        title: 'Envío a domicilio',
        quantity: 1,
        unitPrice: Math.round(Number(order.shipping)),
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    try {
      const pref = await mpCreatePreference({
        orderNumber,
        items,
        backUrls: {
          success: `${baseUrl}/checkout/gracias?order=${orderNumber}&mp=approved`,
          failure: `${baseUrl}/checkout/gracias?order=${orderNumber}&mp=failure`,
          pending: `${baseUrl}/checkout/gracias?order=${orderNumber}&mp=pending`,
        },
        webhookUrl: `${baseUrl}/api/payments/mercadopago/webhook`,
        payerEmail: order.customer?.email || null,
      });

      await logTransaction(db, {
        provider: 'mercadopago',
        action: 'create_preference',
        orderId: order.id,
        orderNumber,
        preferenceId: pref.id,
        response: pref,
      });

      return json({
        ok: true,
        preferenceId: pref.id,
        redirectUrl: pref.redirectUrl,
        initPoint: pref.initPoint,
        sandboxInitPoint: pref.sandboxInitPoint,
      });
    } catch (e) {
      console.error('[mercadopago/create-preference] error:', e);
      return err(`MercadoPago error: ${e.message}`, 500);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/payments/mercadopago/webhook
  // Notificación IPN de MercadoPago. Consulta el pago y actualiza la orden.
  //
  // Formatos comunes:
  //   ?type=payment&data.id=<paymentId>     (notification.action = 'payment.created')
  //   Body JSON: { action, api_version, data: { id }, type, ... }
  // -------------------------------------------------------------------------
  if (route === '/payments/mercadopago/webhook' && method === 'POST') {
    const url = new URL(request.url);
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }

    const type = String(body.type || url.searchParams.get('type') || '').toLowerCase();
    const paymentId = String(
      body?.data?.id ||
      url.searchParams.get('data.id') ||
      url.searchParams.get('id') || ''
    ).trim();

    // Loguear siempre la notificación recibida (para auditoría)
    await logTransaction(db, {
      provider: 'mercadopago',
      action: 'webhook_received',
      type,
      paymentId,
      body,
      queryParams: Object.fromEntries(url.searchParams.entries()),
    });

    // MercadoPago espera respuesta rápida (200) para no reintentar demasiado.
    // Si no es un 'payment' o no hay id, respondemos 200 sin procesar.
    if (type !== 'payment' || !paymentId) {
      return json({ ok: true, ignored: true, reason: 'not a payment notification' });
    }

    if (!isMPConfigured()) {
      console.warn('[mp/webhook] recibido pero MP no está configurado');
      return json({ ok: true, ignored: true, reason: 'MP not configured' });
    }

    try {
      const payment = await mpFetchPayment(paymentId);
      const status = payment.status;                       // approved | rejected | pending | in_process | ...
      const orderNumber = payment.external_reference;      // el que enviamos al crear la preference

      const order = orderNumber
        ? await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber })
        : null;

      await logTransaction(db, {
        provider: 'mercadopago',
        action: 'webhook_processed',
        paymentId,
        status,
        orderNumber,
        orderId: order?.id || null,
        paymentDetail: {
          amount: payment.transaction_amount,
          currency: payment.currency_id,
          statusDetail: payment.status_detail,
          payerEmail: payment.payer?.email,
          method: payment.payment_method_id,
        },
      });

      if (order && status === 'approved') {
        await markOrderPaid(db, order.id, 'mercadopago', String(paymentId), {
          paymentAmount: payment.transaction_amount,
          paymentMethodDetail: payment.payment_method_id,
        });
      }

      return json({ ok: true, paymentId, status, orderNumber });
    } catch (e) {
      console.error('[mp/webhook] error procesando payment:', e);
      // 503 permite que MercadoPago reintente; el consumo de stock es idempotente.
      return err(`MercadoPago webhook temporalmente no disponible: ${e.message}`, 503);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/payments/transactions?orderNumber=X — histórico de una orden
  // (útil para el admin para debuggear estados de pago)
  // -------------------------------------------------------------------------
  if (route === '/payments/transactions' && method === 'GET') {
    const user = await getUserFromRequest(request);
    if (!user || !['admin', 'operator'].includes(user.role)) return err('No autorizado', 403);
    const url = new URL(request.url);
    const orderNumber = url.searchParams.get('orderNumber');
    const filter = orderNumber ? { orderNumber } : {};
    const rows = await db.collection(COLLECTIONS.PAYMENT_TRANSACTIONS)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return json(strip(rows));
  }

  return null;
}
