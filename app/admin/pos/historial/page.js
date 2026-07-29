'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, History, User, Calendar, Loader2, Receipt,
  CircleDot, CheckCircle2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function PosHistorialPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/pos/sessions');
      if (r.ok) setSessions(await r.json());
    } finally { setLoading(false); }
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    setDetail({ session: null, sales: [] });
    try {
      const r = await fetch(`/api/pos/sessions/${id}`);
      if (r.ok) setDetail(await r.json());
    } finally { setDetailLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/pos" className="text-slate-400 hover:text-slate-600 text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />POS
        </Link>
        <div className="text-slate-300">/</div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center">
            <History className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Historial de Caja</h1>
            <div className="text-xs text-slate-500">Sesiones abiertas y cerradas · Arqueos</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — Lista */}
        <div className="lg:col-span-2 space-y-2">
          {loading ? (
            <div className="h-40 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : sessions.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-slate-500">Aún no hay sesiones registradas.</CardContent></Card>
          ) : sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadDetail(s.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                detail?.session?.id === s.id ? 'border-orange-400 bg-orange-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {s.status === 'open'
                    ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded"><CircleDot className="h-2.5 w-2.5" />ABIERTA</span>
                    : <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"><CheckCircle2 className="h-2.5 w-2.5" />CERRADA</span>
                  }
                  <span className="text-xs text-slate-500 font-mono">{fmtDate(s.openedAt)}</span>
                </div>
                <span className="font-mono text-sm font-bold text-slate-900">{formatCLP(s.totalSales || 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-700 flex items-center gap-1"><User className="h-3 w-3" />{s.operatorName}</div>
                <div className="text-[11px] text-slate-500">{s.salesCount} venta{s.salesCount === 1 ? '' : 's'}</div>
              </div>
              {s.status === 'closed' && s.difference !== null && s.difference !== 0 && (
                <div className={`mt-2 text-[10px] font-semibold flex items-center gap-1 ${s.difference > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                  {s.difference > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  Diferencia: {s.difference >= 0 ? '+' : ''}{formatCLP(s.difference)}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* RIGHT — Detalle */}
        <div className="lg:col-span-3">
          {!detail ? (
            <Card className="border-dashed h-full"><CardContent className="p-8 text-center text-sm text-slate-500">← Selecciona una sesión para ver su detalle y ventas.</CardContent></Card>
          ) : detailLoading ? (
            <div className="h-40 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg text-slate-900">{detail.session.operatorName}</h2>
                      <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" />
                        Abierta: {fmtDate(detail.session.openedAt)}
                        {detail.session.closedAt && ` · Cerrada: ${fmtDate(detail.session.closedAt)}`}
                      </div>
                    </div>
                    {detail.session.status === 'open'
                      ? <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">Abierta</Badge>
                      : <Badge className="bg-slate-100 text-slate-700 border border-slate-300">Cerrada</Badge>
                    }
                  </div>
                </div>

                {/* Resumen */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-slate-50 p-3 border">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Ventas</div>
                    <div className="font-mono font-bold text-xl">{detail.session.salesCount}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Total facturado</div>
                    <div className="font-mono font-bold text-xl">{formatCLP(detail.session.totalSales || 0)}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
                    <div className="text-[10px] uppercase text-emerald-700 font-semibold">Efectivo neto</div>
                    <div className="font-mono font-bold text-xl text-emerald-800">{formatCLP(detail.session.totalCash || 0)}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                    <div className="text-[10px] uppercase text-blue-700 font-semibold">Tarjeta + Transf.</div>
                    <div className="font-mono font-bold text-xl text-blue-800">{formatCLP((detail.session.totalCard || 0) + (detail.session.totalTransfer || 0))}</div>
                  </div>
                </div>

                {/* Arqueo (si cerrada) */}
                {detail.session.status === 'closed' && (
                  <div className={`rounded-xl border-2 p-3 space-y-1.5 ${
                    detail.session.difference === 0 ? 'border-emerald-300 bg-emerald-50/50' :
                    detail.session.difference > 0 ? 'border-blue-300 bg-blue-50/50' :
                    'border-rose-300 bg-rose-50/50'
                  }`}>
                    <div className="text-[10px] uppercase font-bold text-slate-600">ARQUEO DE CIERRE</div>
                    <div className="flex justify-between text-sm"><span>Apertura:</span><span className="font-mono">{formatCLP(detail.session.openingCash || 0)}</span></div>
                    <div className="flex justify-between text-sm"><span>+ Efectivo neto vendido:</span><span className="font-mono">{formatCLP(detail.session.totalCash || 0)}</span></div>
                    <div className="flex justify-between text-sm border-t pt-1"><span>Esperado en caja:</span><span className="font-mono font-semibold">{formatCLP(detail.session.expectedCash || 0)}</span></div>
                    <div className="flex justify-between text-sm"><span>Contado en cierre:</span><span className="font-mono font-semibold">{formatCLP(detail.session.closingCash || 0)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-1.5">
                      <span>Diferencia:</span>
                      <span className={`font-mono ${detail.session.difference === 0 ? 'text-emerald-700' : detail.session.difference > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                        {detail.session.difference >= 0 ? '+' : ''}{formatCLP(detail.session.difference)}
                        {detail.session.difference === 0 && ' ✓'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Ventas de la sesión */}
                <div>
                  <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" />VENTAS DE ESTA SESIÓN
                  </div>
                  {detail.sales.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-4 text-center border border-dashed rounded-lg">Sin ventas aún.</div>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {detail.sales.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border hover:bg-slate-100">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-800">{s.orderNumber}</span>
                              <span className="text-[10px] text-slate-500">{fmtDate(s.paidAt || s.createdAt)}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 truncate">
                              {s.customerSnapshot?.name || 'Cliente presencial'}
                              {s.customerSnapshot?.rut && ` · ${s.customerSnapshot.rut}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <div className="font-mono font-bold text-sm">{formatCLP(s.total)}</div>
                            {s.change > 0 && <div className="text-[10px] text-orange-600">Vuelto {formatCLP(s.change)}</div>}
                          </div>
                          <a
                            href={`/api/tickets/${s.id}?format=thermal`}
                            target="_blank" rel="noreferrer"
                            className="p-1.5 hover:bg-white rounded"
                            title="Imprimir ticket"
                          >
                            <Receipt className="h-3.5 w-3.5 text-slate-600" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.session.notes && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-slate-700">
                    <span className="font-semibold text-amber-800">Notas: </span>{detail.session.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
