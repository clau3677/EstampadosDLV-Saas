// ============================================================================
// Cola de Notificaciones Logísticas (Email + WhatsApp)
//
// Diseñada para:
// 1. No bloquear el flujo principal (best-effort async).
// 2. Reintentar fallos temporales (SMTP caído, red).
// 3. Dejar mensajes de WhatsApp como 'pending' si no hay sesión activa.
// 4. Evitar duplicados (deduplicación por orderId + event).
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import * as emailNotify from '@/lib/email/notifications';
import * as waNotify from '@/lib/whatsapp/notifications';

const QUEUE_COLL = 'notification_jobs';

/**
 * Encola una notificación para un pedido.
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.event     p.ej. 'order_packed', 'order_ready'
 * @param {Array}  params.channels  ['email', 'whatsapp']
 * @param {Object} [params.payload] datos extra (carrier, trackingCode, etc)
 */
export async function enqueueNotification({ orderId, event, channels = ['email', 'whatsapp'], payload = {} }) {
  if (!orderId || !event) return;
  
  try {
    const db = await getDb();
    const timestamp = new Date();
    
    const jobs = channels.map(channel => ({
      id: uuidv4(),
      orderId,
      event,
      channel,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: channel === 'email' ? 5 : 3,
      runAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      error: null,
    }));

    // Insertar solo si no existe un job idéntico pendiente o enviado recientemente (1h)
    // para evitar spam por clics repetidos en el panel admin.
    for (const job of jobs) {
      const existing = await db.collection(QUEUE_COLL).findOne({
        orderId: job.orderId,
        event: job.event,
        channel: job.channel,
        status: { $in: ['pending', 'sent'] },
        createdAt: { $gt: new Date(Date.now() - 3600000) }
      });
      
      if (!existing) {
        await db.collection(QUEUE_COLL).insertOne(job);
      }
    }

    // Disparar procesamiento asíncrono (no bloquea)
    processQueue().catch(e => console.error('[queue] background process error:', e.message));

  } catch (e) {
    console.error('[queue] failed to enqueue:', e.message);
  }
}

/**
 * Procesa los trabajos pendientes de la cola.
 */
export async function processQueue() {
  const db = await getDb();
  const now = new Date();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);

  // Si el proceso murió durante un envío, liberar jobs que llevan mucho tiempo reclamados.
  await db.collection(QUEUE_COLL).updateMany(
    { status: 'processing', processingAt: { $lt: staleBefore } },
    { $set: { status: 'pending', runAt: now, updatedAt: now, error: 'Reclamado tras worker interrumpido' } },
  );

  const pendingJobs = await db.collection(QUEUE_COLL)
    .find({ status: 'pending', runAt: { $lte: now } })
    .sort({ runAt: 1 })
    .limit(20)
    .toArray();

  for (const job of pendingJobs) {
    const claim = await db.collection(QUEUE_COLL).updateOne(
      { id: job.id, status: 'pending' },
      { $set: { status: 'processing', processingAt: new Date(), updatedAt: new Date() } },
    );
    if (claim.matchedCount !== 1) continue;
    await processJob(db, { ...job, status: 'processing' });
  }
}

async function processJob(db, job) {
  const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: job.orderId });
  if (!order) {
    await db.collection(QUEUE_COLL).updateOne({ id: job.id }, { 
      $set: { status: 'failed', error: 'Order not found', updatedAt: new Date() } 
    });
    return;
  }

  let result = { ok: false, reason: 'unknown' };

  try {
    if (job.channel === 'email') {
      result = await sendEmailNotification(job.event, order, job.payload);
    } else if (job.channel === 'whatsapp') {
      result = await sendWhatsappNotification(job.event, order, job.payload);
    }

    if (result.ok) {
      await db.collection(QUEUE_COLL).updateOne({ id: job.id }, { 
        $set: { status: 'sent', sentAt: new Date(), updatedAt: new Date(), error: null },
        $unset: { processingAt: '' },
      });
    } else {
      // Si es WhatsApp y la razón es que no está conectado, lo dejamos en pending
      // pero movemos el runAt hacia adelante (backoff) para no saturar el loop.
      const isWaDisconnected = job.channel === 'whatsapp' && String(result.reason || '').includes('not_connected');
      
      const nextAttempt = job.attempts + 1;
      if (nextAttempt >= job.maxAttempts && !isWaDisconnected) {
        await db.collection(QUEUE_COLL).updateOne({ id: job.id }, { 
          $set: { status: 'failed', attempts: nextAttempt, error: result.error || result.reason, updatedAt: new Date() },
          $unset: { processingAt: '' },
        });
      } else {
        // Backoff: 2min, 10min, 30min...
        const delayMin = isWaDisconnected ? 15 : Math.pow(5, nextAttempt); 
        await db.collection(QUEUE_COLL).updateOne({ id: job.id }, { 
          $set: { 
            status: 'pending',
            attempts: nextAttempt, 
            runAt: new Date(Date.now() + delayMin * 60000),
            updatedAt: new Date(),
            error: result.error || result.reason
          },
          $unset: { processingAt: '' },
        });
      }
    }
  } catch (e) {
    console.error(`[queue] error processing job ${job.id}:`, e.message);
    await db.collection(QUEUE_COLL).updateOne({ id: job.id }, { 
      $set: { status: 'pending', error: e.message, runAt: new Date(Date.now() + 300000), updatedAt: new Date() },
      $unset: { processingAt: '' },
    });
  }
}

async function sendEmailNotification(event, order, payload) {
  switch (event) {
    case 'order_confirmation': return emailNotify.notifyOrderConfirmationByEmail({ order });
    case 'order_in_production': return emailNotify.notifyOrderInProductionByEmail({ order, printerName: payload.printerName });
    case 'order_ready': return emailNotify.notifyOrderReadyByEmail({ order });
    case 'order_packed': return emailNotify.notifyOrderPackedByEmail({ order });
    case 'order_handed_to_courier': return emailNotify.notifyOrderHandedToCourierByEmail({ 
      order, 
      carrier: payload.carrier, 
      trackingCode: payload.trackingCode, 
      trackingUrl: payload.trackingUrl 
    });
    case 'order_delivered': return emailNotify.notifyOrderDeliveredByEmail({ order, proofUrl: payload.proofUrl });
    default: return { ok: false, reason: `unsupported_event:${event}` };
  }
}

async function sendWhatsappNotification(event, order, payload) {
  switch (event) {
    case 'order_confirmation': return waNotify.notifyOrderConfirmation({ order });
    case 'order_in_production': return waNotify.notifyOrderInProduction({ order, printerName: payload.printerName });
    case 'order_ready': return waNotify.notifyOrderReady({ order });
    // WhatsApp templates para empaquetado/despacho/entrega se pueden añadir a lib/whatsapp/notifications.js
    // Por ahora usamos los existentes o marcamos como no soportado para no fallar.
    case 'order_packed': return waNotify.notifyOrderReady({ order }); // Reutilizar 'listo' como fallback
    case 'order_handed_to_courier': return waNotify.sendManualMessage({ 
      phone: order.customerSnapshot?.phone,
      text: `Hola ${order.customerSnapshot?.name?.split(' ')[0] || ''} 👋, tu pedido ${order.orderNumber} ya fue entregado a ${payload.carrier}. Tracking: ${payload.trackingCode || 'en proceso'}. — Estampados DLV`
    });
    case 'order_delivered': return waNotify.notifyReviewRequest({ order }); // Reutilizar pedido de reseña como cierre
    default: return { ok: false, reason: `unsupported_event:${event}` };
  }
}

/** Handler administrativo para ver y forzar la cola */
export async function handleNotificationQueue(ctx) {
  const { method, route, db, request } = ctx;
  if (!route.startsWith('/notifications/queue')) return null;

  // Solo admin
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return err('No autorizado', 403);

  if (route === '/notifications/queue' && method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending';
    const jobs = await db.collection(QUEUE_COLL).find({ status }).sort({ createdAt: -1 }).limit(100).toArray();
    return json(jobs);
  }

  if (route === '/notifications/queue/run' && method === 'POST') {
    await processQueue();
    return json({ ok: true, message: 'Queue processing triggered' });
  }

  if (route === '/notifications/queue/retry' && method === 'POST') {
    const { id } = await request.json();
    if (!id) return err('id requerido');
    await db.collection(QUEUE_COLL).updateOne({ id }, { $set: { status: 'pending', runAt: new Date(), attempts: 0 } });
    return json({ ok: true });
  }

  return null;
}
