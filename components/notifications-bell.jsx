'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, Clock, PackageMinus, ShoppingCart, CheckCircle2, Wrench, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const REFRESH_MS = 60_000;

function fmtDaysUntil(days) {
  if (days === null || days === undefined || Number.isNaN(days)) return '';
  if (days < 0) {
    const d = Math.abs(days);
    return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  }
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [maint, setMaint] = useState({ overdue: [], dueSoon: [], counts: { overdue: 0, dueSoon: 0 } });
  const [inv, setInv] = useState({ suppliesLow: [], commercialLow: [], totalSuppliesLow: 0, totalCommercialLow: 0 });
  const [lastFetch, setLastFetch] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const [mRes, iRes] = await Promise.allSettled([
        fetch('/api/maintenance/alerts', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/reports/inventory-alerts', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (mRes.status === 'fulfilled' && mRes.value && !mRes.value.error) {
        setMaint({
          overdue: mRes.value.overdue || [],
          dueSoon: mRes.value.dueSoon || [],
          counts: mRes.value.counts || { overdue: 0, dueSoon: 0 },
        });
      }
      if (iRes.status === 'fulfilled' && iRes.value && !iRes.value.error) {
        setInv({
          suppliesLow: iRes.value.suppliesLow || [],
          commercialLow: iRes.value.commercialLow || [],
          totalSuppliesLow: iRes.value.totalSuppliesLow || 0,
          totalCommercialLow: iRes.value.totalCommercialLow || 0,
        });
      }
      setLastFetch(new Date());
    } catch (e) {
      // No romper el header por un error de red
      console.warn('[NotificationsBell] load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load({ silent: true });
    const id = setInterval(() => load({ silent: true }), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const totalOverdue = maint.counts.overdue || 0;
  const totalDueSoon = maint.counts.dueSoon || 0;
  const totalSuppliesLow = inv.totalSuppliesLow || 0;
  const totalCommercialLow = inv.totalCommercialLow || 0;
  const totalCount = totalOverdue + totalDueSoon + totalSuppliesLow + totalCommercialLow;
  const hasCritical = totalOverdue > 0 || totalCommercialLow > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-full p-2 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          aria-label={`Notificaciones${totalCount ? ` (${totalCount})` : ''}`}
        >
          <Bell className={cn('h-5 w-5', totalCount ? 'text-slate-700' : 'text-slate-500')} />
          {totalCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow-sm',
                hasCritical ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
              )}
            >
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
          {totalCount > 0 && hasCritical && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500/40 animate-ping pointer-events-none" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[95vw] p-0 shadow-xl border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="h-4 w-4 text-slate-700" />
              {totalCount > 0 && (
                <span className={cn(
                  'absolute -top-1 -right-1 h-2 w-2 rounded-full',
                  hasCritical ? 'bg-rose-500' : 'bg-amber-500'
                )} />
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Notificaciones</h3>
            {totalCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {totalCount}
              </Badge>
            )}
          </div>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="p-1 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
            aria-label="Actualizar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-slate-600', refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[420px]">
          <div className="p-2">
            {loading && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Cargando…</div>
            )}

            {!loading && totalCount === 0 && (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-slate-900">Todo en orden</p>
                <p className="text-xs text-slate-500 mt-1">No hay alertas críticas ni mantenimientos vencidos.</p>
              </div>
            )}

            {/* Maintenance overdue */}
            {maint.overdue.length > 0 && (
              <Section
                icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
                title="Mantenimientos vencidos"
                count={maint.overdue.length}
                tone="rose"
                href="/mantenimiento"
                onNavigate={() => setOpen(false)}
              >
                {maint.overdue.slice(0, 4).map((it, idx) => (
                  <NotifRow
                    key={`ov-${idx}`}
                    tone="rose"
                    title={it.typeLabel || it.type}
                    subtitle={it.printerName || it.printerCode}
                    meta={fmtDaysUntil(it.daysUntilDue)}
                  />
                ))}
                {maint.overdue.length > 4 && (
                  <MoreRow n={maint.overdue.length - 4} />
                )}
              </Section>
            )}

            {/* Maintenance due soon */}
            {maint.dueSoon.length > 0 && (
              <Section
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                title="Mantenimientos próximos"
                count={maint.dueSoon.length}
                tone="amber"
                href="/mantenimiento"
                onNavigate={() => setOpen(false)}
              >
                {maint.dueSoon.slice(0, 4).map((it, idx) => (
                  <NotifRow
                    key={`ds-${idx}`}
                    tone="amber"
                    title={it.typeLabel || it.type}
                    subtitle={it.printerName || it.printerCode}
                    meta={fmtDaysUntil(it.daysUntilDue)}
                  />
                ))}
                {maint.dueSoon.length > 4 && (
                  <MoreRow n={maint.dueSoon.length - 4} />
                )}
              </Section>
            )}

            {/* Commercial stock zero */}
            {inv.commercialLow.length > 0 && (
              <Section
                icon={<ShoppingCart className="h-4 w-4 text-rose-500" />}
                title="Sin stock comercial"
                count={inv.totalCommercialLow}
                tone="rose"
                href="/inventario?tab=commercial"
                onNavigate={() => setOpen(false)}
              >
                {inv.commercialLow.slice(0, 4).map((it, idx) => (
                  <NotifRow
                    key={`cl-${idx}`}
                    tone="rose"
                    title={it.productName}
                    subtitle={it.variant}
                    meta={`disp: ${it.available}`}
                  />
                ))}
                {inv.commercialLow.length > 4 && (
                  <MoreRow n={inv.commercialLow.length - 4} />
                )}
              </Section>
            )}

            {/* Supplies low */}
            {inv.suppliesLow.length > 0 && (
              <Section
                icon={<PackageMinus className="h-4 w-4 text-amber-500" />}
                title="Insumos bajo mínimo"
                count={inv.totalSuppliesLow}
                tone="amber"
                href="/inventario"
                onNavigate={() => setOpen(false)}
              >
                {inv.suppliesLow.slice(0, 4).map((it, idx) => (
                  <NotifRow
                    key={`sl-${idx}`}
                    tone="amber"
                    title={it.name}
                    subtitle={it.category}
                    meta={`${it.currentStock} / ${it.minimumStock} ${it.unit || ''}`}
                  />
                ))}
                {inv.suppliesLow.length > 4 && (
                  <MoreRow n={inv.suppliesLow.length - 4} />
                )}
              </Section>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50/60">
          <Link
            href="/mantenimiento"
            className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
            onClick={() => setOpen(false)}
          >
            <Wrench className="h-3.5 w-3.5" />
            Ir a mantenimiento
          </Link>
          <span className="text-[10px] text-slate-400">
            {lastFetch ? `actualizado ${lastFetch.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ icon, title, count, tone = 'slate', href, onNavigate, children }) {
  const toneClasses = {
    rose: 'text-rose-700 bg-rose-50',
    amber: 'text-amber-800 bg-amber-50',
    slate: 'text-slate-700 bg-slate-50',
  };
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide">{title}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', toneClasses[tone])}>{count}</span>
        </div>
        {href && (
          <Link
            href={href}
            onClick={onNavigate}
            className="text-[11px] font-medium text-orange-600 hover:text-orange-700"
          >
            Ver
          </Link>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NotifRow({ tone = 'slate', title, subtitle, meta }) {
  const dotClasses = {
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-400',
  };
  return (
    <div className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-slate-50 transition-colors">
      <div className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', dotClasses[tone])} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
          {meta && <span className="text-[11px] text-slate-500 whitespace-nowrap">{meta}</span>}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-500 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function MoreRow({ n }) {
  return (
    <div className="px-4 py-1 text-[11px] text-slate-500 italic">
      + {n} {n === 1 ? 'más' : 'más'}…
    </div>
  );
}

export default NotificationsBell;
