'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Wrench, ArrowLeft, Plus, RefreshCw, AlertTriangle, Clock, Printer,
  Calendar, DollarSign, Activity, Trash2, Pencil, CheckCircle2, TrendingDown,
} from 'lucide-react';
import { formatCLP } from '@/lib/format';

// Timeline con colores por tipo
const TYPE_COLORS = {
  nozzle_check:       'bg-blue-100 text-blue-700 border-blue-300',
  head_cleaning:      'bg-cyan-100 text-cyan-700 border-cyan-300',
  deep_cleaning:      'bg-indigo-100 text-indigo-700 border-indigo-300',
  ink_change:         'bg-purple-100 text-purple-700 border-purple-300',
  head_replacement:   'bg-rose-100 text-rose-700 border-rose-300',
  damper_replacement: 'bg-orange-100 text-orange-700 border-orange-300',
  capping_station:    'bg-amber-100 text-amber-700 border-amber-300',
  firmware_update:    'bg-slate-100 text-slate-700 border-slate-300',
  general_service:    'bg-emerald-100 text-emerald-700 border-emerald-300',
  repair:             'bg-red-100 text-red-700 border-red-300',
  other:              'bg-gray-100 text-gray-700 border-gray-300',
};

export default function MantenimientoPage() {
  const [types, setTypes] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const [t, p, l, a, k] = await Promise.all([
      fetch('/api/maintenance/types').then((r) => r.json()),
      fetch('/api/printers').then((r) => r.json()),
      fetch('/api/maintenance?limit=100').then((r) => r.json()),
      fetch('/api/maintenance/alerts').then((r) => r.json()),
      fetch('/api/maintenance/kpis?days=90').then((r) => r.json()),
    ]);
    setTypes(t.types || []);
    setPrinters(Array.isArray(p) ? p : []);
    setLogs(Array.isArray(l) ? l : []);
    setAlerts(a);
    setKpis(k);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTimeline = async (code) => {
    setSelectedPrinter(code);
    const r = await fetch(`/api/maintenance/timeline/${code}`).then((x) => x.json());
    setTimeline(r);
  };

  const totalAlerts = (alerts?.counts?.overdue || 0) + (alerts?.counts?.dueSoon || 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mantenimiento</h1>
              <p className="text-slate-500 mt-1 text-sm">Registros, alertas y programación por impresora</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refrescar
            </Button>
            <Button onClick={() => { setShowForm(true); setEditing(null); }} className="gap-1.5 bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4" /> Nuevo registro
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi icon={AlertTriangle} label="Vencidas" value={alerts?.counts?.overdue || 0} color="rose" />
        <Kpi icon={Clock} label="Próximas 7d" value={alerts?.counts?.dueSoon || 0} color="amber" />
        <Kpi icon={DollarSign} label="Costo 90d" value={formatCLP(kpis?.totalCost || 0)} color="purple" />
        <Kpi icon={Activity} label="Eventos 90d" value={kpis?.totalEvents || 0} color="blue" />
      </div>

      {/* Formulario modal */}
      {showForm && (
        <MaintenanceForm
          types={types}
          printers={printers}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); if (selectedPrinter) loadTimeline(selectedPrinter); }}
        />
      )}

      <Tabs defaultValue="alertas" className="w-full">
        <TabsList>
          <TabsTrigger value="alertas">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Alertas {totalAlerts > 0 && <Badge className="ml-1.5 bg-rose-500 h-4 px-1.5 text-[10px]">{totalAlerts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="registros"><Wrench className="h-3.5 w-3.5 mr-1.5" />Registros</TabsTrigger>
          <TabsTrigger value="timeline"><Printer className="h-3.5 w-3.5 mr-1.5" />Por impresora</TabsTrigger>
          <TabsTrigger value="kpis"><Activity className="h-3.5 w-3.5 mr-1.5" />KPIs</TabsTrigger>
        </TabsList>

        {/* ALERTAS */}
        <TabsContent value="alertas" className="space-y-4">
          <AlertList
            title="Vencidas"
            icon={AlertTriangle}
            color="rose"
            items={alerts?.overdue || []}
            emptyText="✅ Sin mantenciones vencidas"
          />
          <AlertList
            title="Próximas 7 días"
            icon={Clock}
            color="amber"
            items={alerts?.dueSoon || []}
            emptyText="Sin próximas urgencias"
          />
          <AlertList
            title="Próximas 30 días"
            icon={Calendar}
            color="blue"
            items={alerts?.dueLater || []}
            emptyText="Sin próximas"
          />
        </TabsContent>

        {/* REGISTROS */}
        <TabsContent value="registros" className="space-y-2">
          {logs.length === 0 ? (
            <Card><CardContent className="text-center text-sm text-slate-400 py-10">Aún no hay registros de mantenimiento.</CardContent></Card>
          ) : logs.map((log) => (
            <LogRow key={log.id} log={log} onEdit={() => { setEditing(log); setShowForm(true); }} onDeleted={load} />
          ))}
        </TabsContent>

        {/* TIMELINE POR IMPRESORA */}
        <TabsContent value="timeline" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {printers.map((p) => (
              <Button
                key={p.code}
                variant={selectedPrinter === p.code ? 'default' : 'outline'}
                size="sm"
                onClick={() => loadTimeline(p.code)}
                className="gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                {p.name || p.code}
              </Button>
            ))}
          </div>

          {selectedPrinter && timeline && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Kpi icon={Activity} label="Eventos" value={timeline.stats?.totalEvents || 0} color="blue" />
                <Kpi icon={DollarSign} label="Costo total" value={formatCLP(timeline.stats?.totalCost || 0)} color="purple" />
                <Kpi
                  icon={Calendar}
                  label="Último evento"
                  value={timeline.stats?.lastEvent ? new Date(timeline.stats.lastEvent).toLocaleDateString('es-CL') : '—'}
                  color="emerald"
                />
                <Kpi
                  icon={Clock}
                  label="Próxima"
                  value={timeline.stats?.nextDue ? new Date(timeline.stats.nextDue).toLocaleDateString('es-CL') : '—'}
                  color="amber"
                />
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Historial · {timeline.printer?.name || selectedPrinter}</CardTitle>
                  <CardDescription>{timeline.events?.length || 0} evento{timeline.events?.length === 1 ? '' : 's'}</CardDescription>
                </CardHeader>
                <CardContent>
                  {(!timeline.events || timeline.events.length === 0) ? (
                    <div className="text-center text-sm text-slate-400 py-8">Sin eventos</div>
                  ) : (
                    <div className="relative">
                      {/* Línea vertical */}
                      <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
                      <div className="space-y-4">
                        {timeline.events.map((ev) => (
                          <div key={ev.id} className="relative pl-9">
                            <div className={`absolute left-0 top-1 h-7 w-7 rounded-full border-2 border-white shadow ${TYPE_COLORS[ev.type] || TYPE_COLORS.other} flex items-center justify-center`}>
                              <Wrench className="h-3.5 w-3.5" />
                            </div>
                            <div className="rounded-lg border bg-white p-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{ev.typeLabel}</span>
                                  <Badge variant="outline" className="text-[10px]">{new Date(ev.date).toLocaleDateString('es-CL')}</Badge>
                                </div>
                                {ev.cost > 0 && <span className="text-sm font-semibold text-slate-700">{formatCLP(ev.cost)}</span>}
                              </div>
                              {ev.notes && <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{ev.notes}</div>}
                              <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-slate-500">
                                {ev.operatorName && <span>👤 {ev.operatorName}</span>}
                                {ev.hoursOperated > 0 && <span>⏱ {ev.hoursOperated}h operando</span>}
                                {ev.nextDueDate && <span>📅 Próx: {new Date(ev.nextDueDate).toLocaleDateString('es-CL')}</span>}
                                {ev.suppliesConsumed?.length > 0 && <span>📦 {ev.suppliesConsumed.length} insumo{ev.suppliesConsumed.length === 1 ? '' : 's'}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* KPIs */}
        <TabsContent value="kpis" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Costo por impresora (últimos 90 días)</CardTitle>
            </CardHeader>
            <CardContent>
              {(!kpis?.byPrinter || kpis.byPrinter.length === 0) ? (
                <div className="text-sm text-slate-400 text-center py-6">Sin data</div>
              ) : (
                <div className="space-y-2">
                  {kpis.byPrinter.map((p) => (
                    <div key={p.printerCode} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{p.printerName || p.printerCode}</div>
                        <div className="text-xs text-slate-500">{p.events} evento{p.events === 1 ? '' : 's'}{p.corrective > 0 && ` · ${p.corrective} correctivos`}</div>
                      </div>
                      <div className="text-lg font-semibold">{formatCLP(p.cost)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Eventos por tipo</CardTitle>
              </CardHeader>
              <CardContent>
                {(!kpis?.byType || kpis.byType.length === 0) ? (
                  <div className="text-sm text-slate-400 text-center py-6">Sin data</div>
                ) : (
                  <div className="space-y-2">
                    {kpis.byType.map((t) => (
                      <div key={t.type} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${TYPE_COLORS[t.type] || TYPE_COLORS.other}`}>{t.label}</Badge>
                        </div>
                        <div className="flex gap-3 text-slate-500 text-xs">
                          <span>{t.count} eventos</span>
                          {t.cost > 0 && <span>· {formatCLP(t.cost)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" /> MTBF (Correctivos)
                </CardTitle>
                <CardDescription>Días promedio entre reparaciones</CardDescription>
              </CardHeader>
              <CardContent>
                {(!kpis?.mtbf || kpis.mtbf.length === 0) ? (
                  <div className="text-sm text-emerald-600 text-center py-6 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Sin correctivos registrados
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kpis.mtbf.map((m) => (
                      <div key={m.printerCode} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="text-sm">{m.printerCode}</div>
                        <div className="text-lg font-semibold">{m.mtbfDays} días</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FORM
// ---------------------------------------------------------------------------
function MaintenanceForm({ types, printers, editing, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    printerCode: editing?.printerCode || printers[0]?.code || '',
    type: editing?.type || types[0]?.code || 'general_service',
    date: editing?.date ? editing.date.slice(0, 16) : new Date().toISOString().slice(0, 16),
    notes: editing?.notes || '',
    cost: editing?.cost || 0,
    operatorName: editing?.operatorName || '',
    hoursOperated: editing?.hoursOperated || 0,
    nextDueDate: editing?.nextDueDate ? editing.nextDueDate.slice(0, 10) : '',
    partsReplacedText: editing?.partsReplaced?.join(', ') || '',
  });

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        partsReplaced: form.partsReplacedText.split(',').map(s => s.trim()).filter(Boolean),
        cost: Number(form.cost) || 0,
        hoursOperated: Number(form.hoursOperated) || 0,
      };
      delete body.partsReplacedText;
      const url = editing ? `/api/maintenance/${editing.id}` : '/api/maintenance';
      const method = editing ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success(editing ? 'Actualizado ✅' : 'Registro creado ✅');
      onSaved();
    } catch (e) {
      toast.error('Fallo: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-orange-300 bg-orange-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{editing ? 'Editar registro' : 'Nuevo registro de mantenimiento'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-600 block mb-1">Impresora *</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={form.printerCode}
              onChange={e => setForm({ ...form, printerCode: e.target.value })}
            >
              {printers.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Tipo *</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              {types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Fecha</label>
            <Input type="datetime-local" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Próximo mantenimiento (opcional)</label>
            <Input type="date" value={form.nextDueDate} onChange={e => setForm({ ...form, nextDueDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Costo CLP</label>
            <Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Horas operando (acumuladas)</label>
            <Input type="number" step="0.1" value={form.hoursOperated} onChange={e => setForm({ ...form, hoursOperated: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 block mb-1">Operador responsable</label>
            <Input value={form.operatorName} onChange={e => setForm({ ...form, operatorName: e.target.value })} placeholder="Nombre del técnico" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 block mb-1">Repuestos reemplazados (separados por coma)</label>
            <Input value={form.partsReplacedText} onChange={e => setForm({ ...form, partsReplacedText: e.target.value })} placeholder="Cabezal, damper, capping station" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600 block mb-1">Notas / observaciones</label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
            {saving ? 'Guardando…' : (editing ? 'Actualizar' : 'Crear registro')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
const KPI_COLORS = {
  emerald: 'from-emerald-500 to-emerald-600',
  blue:    'from-blue-500 to-blue-600',
  purple:  'from-purple-500 to-fuchsia-600',
  amber:   'from-amber-500 to-orange-600',
  rose:    'from-rose-500 to-red-600',
};

function Kpi({ icon: Icon, label, value, color = 'emerald' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-1 truncate">{value}</div>
          </div>
          <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${KPI_COLORS[color]} flex items-center justify-center text-white shadow-md shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertList({ title, icon: Icon, color, items, emptyText }) {
  const colorClass = {
    rose:  'text-rose-600 bg-rose-50 border-rose-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    blue:  'text-blue-700 bg-blue-50 border-blue-200',
  }[color];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={`text-base flex items-center gap-2 ${color === 'rose' ? 'text-rose-600' : color === 'amber' ? 'text-amber-700' : 'text-blue-700'}`}>
          <Icon className="h-4 w-4" /> {title} <Badge variant="secondary" className="ml-1">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-6">{emptyText}</div>
        ) : (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg border p-3 ${colorClass}`}>
                <div>
                  <div className="text-sm font-medium">{it.printerName} · {it.typeLabel}</div>
                  <div className="text-xs opacity-80">Última: {new Date(it.lastDate).toLocaleDateString('es-CL')}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {it.daysUntilDue < 0
                      ? `Hace ${Math.abs(it.daysUntilDue)}d`
                      : it.daysUntilDue === 0 ? 'Hoy'
                      : `En ${it.daysUntilDue}d`}
                  </div>
                  <div className="text-[10px] opacity-70">{new Date(it.nextDueDate).toLocaleDateString('es-CL')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({ log, onEdit, onDeleted }) {
  const remove = async () => {
    if (!confirm('¿Eliminar este registro?')) return;
    await fetch(`/api/maintenance/${log.id}`, { method: 'DELETE' });
    toast.success('Eliminado');
    onDeleted();
  };
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-full border-2 ${TYPE_COLORS[log.type] || TYPE_COLORS.other} flex items-center justify-center shrink-0`}>
          <Wrench className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{log.printerName || log.printerCode}</span>
            <Badge variant="outline" className="text-[10px]">{log.typeLabel}</Badge>
            <Badge variant="secondary" className="text-[10px]">{new Date(log.date).toLocaleDateString('es-CL')}</Badge>
            {log.cost > 0 && <span className="text-xs text-slate-500 ml-auto">{formatCLP(log.cost)}</span>}
          </div>
          {log.notes && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{log.notes}</div>}
          <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-2">
            {log.operatorName && <span>👤 {log.operatorName}</span>}
            {log.hoursOperated > 0 && <span>⏱ {log.hoursOperated}h</span>}
            {log.nextDueDate && <span>📅 Próx: {new Date(log.nextDueDate).toLocaleDateString('es-CL')}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={remove}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
