// ============================================================================
// Templates de emails transaccionales — HTML responsive + text fallback
//
// Diseño: layout centrado 600px, colores DLV (slate + emerald), sin imágenes
// externas (todo inline SVG o texto) para máxima entregabilidad y velocidad.
// ============================================================================
import { formatCLP } from '@/lib/format';

const BRAND = {
  name: 'Estampados DLV',
  color: '#059669',      // emerald-600
  colorDark: '#065f46',  // emerald-800
  colorLight: '#d1fae5', // emerald-100
  textColor: '#0f172a',  // slate-900
  mutedColor: '#64748b', // slate-500
  bgColor: '#f8fafc',    // slate-50
  cardColor: '#ffffff',
};

function shell({ title, previewText, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.textColor};line-height:1.5;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${BRAND.bgColor};">${previewText || ''}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bgColor};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:8px 0 20px 0;text-align:center;">
          <div style="display:inline-block;padding:10px 18px;background:linear-gradient(135deg,${BRAND.color},${BRAND.colorDark});border-radius:12px;color:#fff;font-weight:700;font-size:18px;letter-spacing:0.3px;">
            ${BRAND.name}
          </div>
        </td></tr>
        <!-- Card -->
        <tr><td style="background-color:${BRAND.cardColor};border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
          ${contentHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 8px 8px 8px;text-align:center;color:${BRAND.mutedColor};font-size:12px;">
          <div>${BRAND.name} · DTF & DTF UV · Chile</div>
          <div style="margin-top:6px;">Este mail se generó automáticamente. Si necesitas ayuda, respóndenos directamente 💬</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function itemsTable(items) {
  if (!items?.length) return '';
  const rows = items.map((it) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:500;">${escapeHtml(it.name || '—')}</div>
        ${it.gangSheetSpec ? `<div style="color:${BRAND.mutedColor};font-size:12px;margin-top:2px;">Ancho ${it.gangSheetSpec.widthCm}cm · Largo ${(it.gangSheetSpec.lengthMm / 10).toFixed(1)}cm</div>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:center;color:${BRAND.mutedColor};">${it.quantity || 1}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:500;">${formatCLP(it.totalPrice || it.unitPrice || 0)}</td>
    </tr>
  `).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;font-size:14px;">
      <thead>
        <tr style="color:${BRAND.mutedColor};font-size:11px;text-transform:uppercase;letter-spacing:0.4px;">
          <th align="left" style="padding-bottom:8px;font-weight:600;">Producto</th>
          <th align="center" style="padding-bottom:8px;font-weight:600;">Cant.</th>
          <th align="right" style="padding-bottom:8px;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------

export function tplOrderConfirmation({ orderNumber, customerName, total, items, deliveryMethod, shippingAddress, paymentMethod }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const entrega = deliveryMethod === 'shipping' ? 'Envío a domicilio' : 'Retiro en tienda';
  const paymentLabel = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    webpay: 'WebPay',
    mercadopago: 'MercadoPago',
  }[paymentMethod] || paymentMethod || '—';
  const addr = shippingAddress && deliveryMethod === 'shipping'
    ? `<div style="margin-top:12px;padding:12px;background:${BRAND.bgColor};border-radius:8px;font-size:13px;">
        <div style="color:${BRAND.mutedColor};font-size:11px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Dirección de envío</div>
        <div>${escapeHtml(shippingAddress.street || '')}${shippingAddress.comuna ? `, ${escapeHtml(shippingAddress.comuna)}` : ''}${shippingAddress.city ? `, ${escapeHtml(shippingAddress.city)}` : ''}</div>
      </div>` : '';

  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">¡Gracias, ${escapeHtml(name)}! 👋</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">Recibimos tu pedido correctamente y ya lo estamos revisando.</p>

    <div style="padding:14px 16px;background:${BRAND.colorLight};border-radius:10px;border-left:3px solid ${BRAND.color};margin-bottom:8px;">
      <div style="font-size:11px;color:${BRAND.colorDark};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Número de pedido</div>
      <div style="font-size:20px;font-weight:700;color:${BRAND.textColor};margin-top:2px;">${escapeHtml(orderNumber)}</div>
    </div>

    ${itemsTable(items)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Método de pago</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(paymentLabel)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Entrega</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(entrega)}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 4px 0;border-top:2px solid ${BRAND.textColor};font-weight:700;font-size:16px;">Total</td>
        <td style="padding:12px 0 4px 0;border-top:2px solid ${BRAND.textColor};text-align:right;font-weight:700;font-size:16px;color:${BRAND.colorDark};">${formatCLP(total)}</td>
      </tr>
    </table>

    ${addr}

    <p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.mutedColor};">
      Te enviaremos otro email cuando tu pedido entre a producción y otro cuando esté listo 🖨️
    </p>`;

  const text = `¡Gracias ${name}!

Recibimos tu pedido ${orderNumber} en Estampados DLV.

Total: ${formatCLP(total)}
Pago: ${paymentLabel}
Entrega: ${entrega}

Te avisaremos cuando entre a producción y cuando esté listo.

— Estampados DLV`;

  return {
    subject: `Recibimos tu pedido ${orderNumber} · Estampados DLV`,
    html: shell({ title: `Pedido ${orderNumber}`, previewText: `Confirmación de tu pedido por ${formatCLP(total)}`, contentHtml }),
    text,
  };
}

export function tplOrderInProduction({ orderNumber, customerName, printerName }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const eq = printerName ? ` en <strong>${escapeHtml(printerName)}</strong>` : '';
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">Tu pedido entró a producción 🖨️</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">${escapeHtml(name)}, ya estamos imprimiendo tu diseño${eq}.</p>

    <div style="padding:14px 16px;background:${BRAND.colorLight};border-radius:10px;border-left:3px solid ${BRAND.color};margin-bottom:20px;">
      <div style="font-size:11px;color:${BRAND.colorDark};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Pedido</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px;">${escapeHtml(orderNumber)}</div>
    </div>

    <p style="margin:0;font-size:14px;color:${BRAND.textColor};">Nuestro proceso incluye impresión CMYK+Blanco, curado con poliamida y control de calidad. Te escribimos apenas esté listo.</p>`;

  const text = `${name}, tu pedido ${orderNumber} ya entró a producción${printerName ? ' en ' + printerName : ''}. Te avisamos cuando esté listo. — Estampados DLV`;

  return {
    subject: `Tu pedido ${orderNumber} entró a producción 🖨️`,
    html: shell({ title: `${orderNumber} en producción`, previewText: 'Estamos imprimiendo tu pedido', contentHtml }),
    text,
  };
}

export function tplOrderReady({ orderNumber, customerName, deliveryMethod }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const cta = deliveryMethod === 'shipping'
    ? 'Estamos preparando el envío. Recibirás el detalle del courier pronto.'
    : '¡Ya puedes pasar a retirarlo cuando gustes! Nuestro horario está en la web.';
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">¡Tu pedido está listo! ✅</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">${escapeHtml(name)}, terminamos de producir tu pedido 🎉</p>

    <div style="padding:14px 16px;background:${BRAND.colorLight};border-radius:10px;border-left:3px solid ${BRAND.color};margin-bottom:20px;">
      <div style="font-size:11px;color:${BRAND.colorDark};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Pedido</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px;">${escapeHtml(orderNumber)}</div>
    </div>

    <p style="margin:0;font-size:14px;color:${BRAND.textColor};">${escapeHtml(cta)}</p>`;

  const text = `¡${name}, tu pedido ${orderNumber} está listo! ${deliveryMethod === 'shipping' ? 'Estamos preparando el envío.' : 'Pasa a retirarlo cuando gustes.'} — Estampados DLV`;

  return {
    subject: `¡Tu pedido ${orderNumber} está listo! ✅`,
    html: shell({ title: `${orderNumber} listo`, previewText: 'Terminamos de producir tu pedido', contentHtml }),
    text,
  };
}

export function tplPaymentApproved({ orderNumber, customerName, total }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">¡Pago confirmado! ✅</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">${escapeHtml(name)}, recibimos y validamos tu transferencia.</p>

    <div style="padding:14px 16px;background:${BRAND.colorLight};border-radius:10px;border-left:3px solid ${BRAND.color};margin-bottom:20px;">
      <div style="font-size:11px;color:${BRAND.colorDark};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Pedido pagado</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px;">${escapeHtml(orderNumber)}</div>
      <div style="font-size:13px;margin-top:4px;color:${BRAND.mutedColor};">Total: <strong style="color:${BRAND.textColor};">${formatCLP(total || 0)}</strong></div>
    </div>

    <p style="margin:0;font-size:14px;color:${BRAND.textColor};">Tu pedido pasa a producción ahora. Te avisamos apenas esté listo 🖨️</p>`;

  const text = `¡${name}, confirmamos tu pago del pedido ${orderNumber} por ${formatCLP(total || 0)}! Ya pasó a producción. — Estampados DLV`;

  return {
    subject: `Pago confirmado · Pedido ${orderNumber} ✅`,
    html: shell({ title: `Pago confirmado ${orderNumber}`, previewText: 'Recibimos y validamos tu transferencia', contentHtml }),
    text,
  };
}

export function tplPaymentRejected({ orderNumber, customerName, reason }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const reasonHtml = reason
    ? `<p style="margin:0 0 12px 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:6px;font-size:13px;color:#991b1b;"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>`
    : '';
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#b91c1c;">No pudimos confirmar tu pago ⚠️</h1>
    <p style="margin:0 0 16px 0;color:${BRAND.mutedColor};font-size:14px;">${escapeHtml(name)}, revisamos el comprobante que subiste para el pedido <strong style="color:${BRAND.textColor};">${escapeHtml(orderNumber)}</strong> y necesitamos que subas uno nuevo.</p>

    ${reasonHtml}

    <div style="padding:14px 16px;background:#fff7ed;border-radius:10px;border-left:3px solid #f97316;margin-bottom:20px;">
      <div style="font-size:11px;color:#9a3412;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Qué hacer ahora</div>
      <div style="font-size:14px;margin-top:6px;color:${BRAND.textColor};">Vuelve a la pantalla de confirmación de tu pedido y sube un nuevo comprobante. Si tienes dudas, respondemos directamente por este mismo email 💬</div>
    </div>

    <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">Tu pedido sigue reservado 24h. Después se cancela automáticamente si no se sube un nuevo comprobante.</p>`;

  const text = `${name}, no pudimos confirmar tu pago del pedido ${orderNumber}.${reason ? ' Motivo: ' + reason + '.' : ''} Por favor sube otro comprobante. — Estampados DLV`;

  return {
    subject: `⚠️ Comprobante rechazado · Pedido ${orderNumber}`,
    html: shell({ title: `Comprobante rechazado ${orderNumber}`, previewText: 'Necesitamos que subas un nuevo comprobante', contentHtml }),
    text,
  };
}

export function tplReviewRequest({ orderNumber, customerName, googleUrl, facebookUrl }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">¿Qué te pareció tu pedido? ⭐</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">${escapeHtml(name)}, esperamos que estés disfrutando tu pedido <strong>${escapeHtml(orderNumber)}</strong>.</p>
    <p style="margin:0 0 20px 0;font-size:14px;color:${BRAND.textColor};">
      Tu opinión nos ayuda muchísimo a seguir creciendo y a que más personas conozcan nuestro trabajo.
      ¿Nos regalarías una reseña? Toma menos de un minuto.
    </p>
    ${googleUrl ? `
    <div style="text-align:center;margin-bottom:12px;">
      <a href="${googleUrl}" style="display:inline-block;padding:12px 28px;background:${BRAND.color};color:#ffffff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Dejar reseña en Google ⭐</a>
    </div>` : ''}
    ${facebookUrl ? `
    <div style="text-align:center;">
      <a href="${facebookUrl}" style="display:inline-block;padding:10px 24px;background:#1877F2;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Recomendar en Facebook</a>
    </div>` : ''}
    <p style="margin:20px 0 0 0;font-size:13px;color:${BRAND.mutedColor};">¡Gracias por preferir Estampados DLV! ✨</p>`;

  const text = `${name}, ¿qué te pareció tu pedido ${orderNumber}? Déjanos una reseña en Google: ${googleUrl || ''} — Estampados DLV`;

  return {
    subject: `¿Qué te pareció tu pedido ${orderNumber}? ⭐`,
    html: shell({ title: 'Cuéntanos tu experiencia', previewText: 'Tu opinión nos ayuda a crecer', contentHtml }),
    text,
  };
}
export function tplNewGangSheet({ orderNumber, customerName, customerPhone, printerLabel, lengthMm, designsCount, total }) {
  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;">Nuevo pliego Gang Sheet 🖨️</h1>
    <p style="margin:0 0 20px 0;color:${BRAND.mutedColor};font-size:14px;">Un cliente ha confirmado un pedido de impresión DTF con Gang Sheet Builder.</p>
    <div style="padding:14px 16px;background:${BRAND.colorLight};border-radius:10px;border-left:3px solid ${BRAND.color};margin-bottom:16px;">
      <div style="font-size:11px;color:${BRAND.colorDark};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Número de pedido</div>
      <div style="font-size:20px;font-weight:700;color:${BRAND.textColor};margin-top:2px;">${escapeHtml(orderNumber)}</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Cliente</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(customerName || 'Anónimo')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Teléfono</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(customerPhone || '—')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Impresora</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(printerLabel)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Largo del pliego</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${(lengthMm / 10).toFixed(1)} cm</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.mutedColor};">Diseños en el pliego</td>
        <td style="padding:6px 0;text-align:right;font-weight:500;">${designsCount}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 4px 0;border-top:2px solid ${BRAND.textColor};font-weight:700;font-size:16px;">Total</td>
        <td style="padding:12px 0 4px 0;border-top:2px solid ${BRAND.textColor};text-align:right;font-weight:700;font-size:16px;color:${BRAND.colorDark};">${formatCLP(total)}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.mutedColor};">
      Este pliego ya está en la cola de producción. Revisa en el panel de Pre-Prensa para exportar y enviar a la impresora.
    </p>`;
  const text = `Nuevo pliego Gang Sheet · ${orderNumber}
Cliente: ${customerName || 'Anónimo'}
Teléfono: ${customerPhone || '—'}
Impresora: ${printerLabel}
Largo: ${(lengthMm / 10).toFixed(1)} cm
Diseños: ${designsCount}
Total: ${formatCLP(total)}
Ya está en cola de producción.`;
  return {
    subject: `Nuevo pliego Gang Sheet · ${orderNumber}`,
    html: shell({ title: `Nuevo pliego ${orderNumber}`, previewText: `Nuevo pedido de Gang Sheet por ${formatCLP(total)}`, contentHtml }),
    text,
  };
}
