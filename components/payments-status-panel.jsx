'use client';

// ============================================================================
// PaymentsStatusPanel
// Muestra el estado actual de las pasarelas de pago configuradas (WebPay + MP)
// y explica al admin qué claves faltan y de dónde obtenerlas.
// ----------------------------------------------------------------------------
// No permite editar las claves desde la UI (por seguridad — las claves de
// pago viven en .env del servidor). Cuando el admin las agrega y reinicia,
// este panel refleja el nuevo estado.
// ============================================================================
import { useEffect, useState } from 'react';
import {
  CreditCard, CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  Copy, Check, Wallet, RefreshCw, KeyRound, Info, TestTube,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const WEBHOOK_PATH = '/api/payments/mercadopago/webpay-return-not-used';

export default function PaymentsStatusPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/payments/status', { cache: 'no-store' });
      if (r.ok) setStatus(await r.json());
    } catch (e) {
      toast.error('No se pudo cargar el estado', { description: e.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const mpWebhookUrl = `${baseUrl}/api/payments/mercadopago/webhook`;
  const webpayReturnUrl = `${baseUrl}/checkout/webpay-return`;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      toast.success('Copiado al portapapeles');
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-slate-500">Cargando estado de pasarelas…</CardContent></Card>
  );
  if (!status) return null;

  const { webpay, mercadopago } = status;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-orange-500" />
            Pasarelas de Pago
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configura WebPay Plus y MercadoPago para cobrar en línea.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refrescar
        </Button>
      </div>

      {/* Info: dónde van las claves */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <b>¿Dónde se pegan las claves?</b> Las claves de las pasarelas viven en el archivo <code className="bg-white/60 px-1 rounded">.env</code> del servidor
            (no en la interfaz — por seguridad). Después de editar el <code className="bg-white/60 px-1 rounded">.env</code>, reinicia el servicio
            (<code className="bg-white/60 px-1 rounded">pm2 restart estampados-dlv</code>) y refresca esta página.
          </div>
        </CardContent>
      </Card>

      {/* WebPay Plus */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-red-50 to-red-100/50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <img src="https://www.transbank.cl/public/img/logos/logo-webpay.svg" alt="WebPay" className="h-6" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              WebPay Plus <span className="text-slate-600 font-normal">· Transbank</span>
            </CardTitle>
            <ModeBadge mode={webpay.mode} />
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            {webpay.mode === 'production' ? (
              webpay.productionReady ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                                     : <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-blue-500 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-slate-900">
                {webpay.mode === 'production' ? (
                  webpay.productionReady ? 'Configurado en PRODUCCIÓN'
                                         : 'Producción activada pero faltan claves'
                ) : 'Sandbox activo — pruebas OK'}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {webpay.mode === 'production' ? (
                  webpay.productionReady
                    ? 'Los pagos con tarjeta se cobran realmente. Los clientes pueden pagar sin restricción.'
                    : '⚠️ TBK_ENV=production pero faltan TBK_COMMERCE_CODE o TBK_API_KEY_SECRET. Los pagos fallarán.'
                ) : (
                  'Las claves sandbox públicas de Transbank ya están cargadas. Puedes probar con tarjetas de prueba antes de pasar a producción.'
                )}
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 space-y-1 text-sm">
            <div className="font-semibold text-slate-700 flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Variables en .env</div>
            <EnvRow name="TBK_ENV" value={webpay.mode === 'production' ? 'production' : 'integration'} placeholder="integration" />
            <EnvRow name="TBK_COMMERCE_CODE" placeholder="597055555532 (sandbox)" note={webpay.mode === 'production' ? 'clave privada' : 'sandbox público'} />
            <EnvRow name="TBK_API_KEY_SECRET" placeholder="579B532A... (sandbox)" note={webpay.mode === 'production' ? 'clave privada' : 'sandbox público'} />
          </div>

          <div className="rounded-lg border bg-white p-3 space-y-2 text-sm">
            <div className="font-semibold text-slate-700 mb-1">URL de retorno (configurar en dashboard Transbank)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 bg-slate-100 rounded text-xs font-mono break-all">{webpayReturnUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(webpayReturnUrl, 'webpay-return')}>
                {copiedKey === 'webpay-return' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <a href="https://www.transbank.cl/webpay-plus" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Solicitar afiliación
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="https://www.transbankdevelopers.cl/documentacion/como_empezar#tarjetas-de-prueba" target="_blank" rel="noreferrer">
                <TestTube className="h-3.5 w-3.5 mr-1" /> Tarjetas de prueba
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="https://portaltransbank.cl" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Portal Transbank
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* MercadoPago */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-sky-50 to-blue-100/50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5 text-sky-600" />
              MercadoPago <span className="text-slate-600 font-normal">· Checkout Pro</span>
            </CardTitle>
            <ModeBadge mode={mercadopago.mode} />
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            {mercadopago.enabled ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-slate-400 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-slate-900">
                {mercadopago.enabled ? (
                  mercadopago.mode === 'production' ? 'Configurado en PRODUCCIÓN'
                  : mercadopago.mode === 'sandbox' ? 'Configurado en TEST'
                  : 'Configurado (modo desconocido)'
                ) : 'No configurado'}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {mercadopago.enabled
                  ? (mercadopago.mode === 'production'
                      ? 'Los pagos por MP se procesan realmente. El webhook debe estar configurado en el dashboard.'
                      : 'Modo TEST: solo funcionan tarjetas de prueba de MercadoPago.')
                  : 'Falta pegar MP_ACCESS_TOKEN en el .env. Sigue las instrucciones más abajo.'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 space-y-1 text-sm">
            <div className="font-semibold text-slate-700 flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Variables en .env</div>
            <EnvRow name="MP_ACCESS_TOKEN" placeholder="APP_USR-... (prod) o TEST-... (sandbox)" note={mercadopago.enabled ? '✓ presente' : 'falta'} missing={!mercadopago.enabled} />
            <EnvRow name="MP_PUBLIC_KEY"   placeholder="APP_USR-... (para Checkout Bricks)" note="opcional" />
            <EnvRow name="MP_WEBHOOK_SECRET" placeholder="..." note={mercadopago.hasWebhookSecret ? '✓ presente' : 'recomendado'} missing={!mercadopago.hasWebhookSecret && mercadopago.enabled} />
          </div>

          <div className="rounded-lg border bg-white p-3 space-y-2 text-sm">
            <div className="font-semibold text-slate-700">URL del Webhook (pegar en dashboard MercadoPago)</div>
            <p className="text-xs text-slate-500">
              Ir a <b>Tus aplicaciones → Notificaciones → Configurar</b> y pegar esta URL con evento <b>payment</b>:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 bg-slate-100 rounded text-xs font-mono break-all">{mpWebhookUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(mpWebhookUrl, 'mp-webhook')}>
                {copiedKey === 'mp-webhook' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <a href="https://www.mercadopago.cl/developers/panel/app" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Panel de desarrolladores
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/your-integrations/notifications/webhooks" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Configurar webhooks
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards" target="_blank" rel="noreferrer">
                <TestTube className="h-3.5 w-3.5 mr-1" /> Tarjetas de prueba
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Métodos siempre habilitados */}
      <Card>
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-slate-500" />
            Métodos sin API (siempre habilitados)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span><b>Transferencia bancaria</b> — cliente sube comprobante en /checkout/gracias</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span><b>Efectivo</b> — al retirar en local</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModeBadge({ mode }) {
  const config = {
    production:      { color: 'bg-emerald-500 text-white',   label: 'PRODUCCIÓN' },
    sandbox:         { color: 'bg-blue-500 text-white',      label: 'SANDBOX/TEST' },
    not_configured:  { color: 'bg-slate-300 text-slate-700', label: 'NO CONFIGURADO' },
    unknown:         { color: 'bg-amber-500 text-white',     label: 'MODO DESCONOCIDO' },
  }[mode] || { color: 'bg-slate-300 text-slate-700', label: mode?.toUpperCase() };
  return <Badge className={`${config.color} font-bold text-xs`}>{config.label}</Badge>;
}

function EnvRow({ name, value, placeholder, note, missing }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${missing ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-700'}`}>
        {name}
      </code>
      <span className="text-xs text-slate-400">=</span>
      <code className="text-xs font-mono text-slate-500 truncate flex-1">
        {value || placeholder}
      </code>
      {note && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${missing ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
          {note}
        </span>
      )}
    </div>
  );
}
