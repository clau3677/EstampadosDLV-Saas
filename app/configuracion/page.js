'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Settings2, Plus, Trash2, Edit3, Loader2, Save,
  Tag, Beaker, Ruler, Truck, Printer, Building2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { invalidateTaxonomyCache } from '@/components/taxonomy-select';
import PrintersManager from '@/components/printers-manager';
import CompanySettingsPanel from '@/components/company-settings-panel';

const KINDS = [
  { key: 'product_category', label: 'Categorías', icon: Tag,    desc: 'Categorías de productos comerciales.',        color: 'from-orange-500 to-rose-500' },
  { key: 'supply_type',      label: 'Tipos de Insumo', icon: Beaker, desc: 'Tipos de material de producción (tintas, films…).', color: 'from-teal-500 to-emerald-500' },
  { key: 'unit',             label: 'Unidades',  icon: Ruler,  desc: 'Unidades de medida (m, ml, kg, un…).',         color: 'from-blue-500 to-indigo-500' },
  { key: 'supplier',         label: 'Proveedores', icon: Truck,  desc: 'Proveedores para reposición de insumos.',      color: 'from-purple-500 to-fuchsia-500' },
];

export default function ConfiguracionPage() {
  const [tab, setTab] = useState('company');
  const [data, setData] = useState({});
  const [printersCount, setPrintersCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);          // taxonomy being edited
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const loadPrintersCount = async () => {
    try {
      const r = await fetch('/api/printers');
      if (r.ok) {
        const arr = await r.json();
        setPrintersCount(Array.isArray(arr) ? arr.length : 0);
      }
    } catch { /* ignore */ }
  };

  const loadKind = async (kind) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/taxonomies?kind=${kind}`);
      const arr = await r.json();
      setData(d => ({ ...d, [kind]: Array.isArray(arr) ? arr : [] }));
    } catch (e) {
      toast.error('Error al cargar');
    } finally { setLoading(false); }
  };

  // Al montar, precargar TODOS los tipos para tener los contadores correctos
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [taxos] = await Promise.all([
          Promise.all(KINDS.map(k => fetch(`/api/taxonomies?kind=${k.key}`).then(r => r.json()).catch(() => []))),
          loadPrintersCount(),
        ]);
        const map = {};
        KINDS.forEach((k, i) => { map[k.key] = Array.isArray(taxos[i]) ? taxos[i] : []; });
        setData(map);
      } finally { setLoading(false); }
    })();
  }, []);

  // Refrescar el conteo de equipos cuando el usuario entra a la tab "printers" o vuelve a otra
  useEffect(() => { loadPrintersCount(); }, [tab]);

  useEffect(() => {
    // Solo recargamos taxonomías si la tab activa es una de las conocidas (no company/printers)
    if (tab && KINDS.some(k => k.key === tab)) loadKind(tab);
  }, [tab]);

  const currentItems = data[tab] || [];

  const createItem = async () => {
    const label = newLabel.trim();
    if (!label) return;
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: tab, label }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      invalidateTaxonomyCache(tab);
      setNewLabel('');
      setAddingNew(false);
      toast.success(`${data.label} agregado`);
      loadKind(tab);
    } catch (e) {
      toast.error(e.message || 'Error');
    }
  };

  const updateItem = async () => {
    if (!editing?.id) return;
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, label: editing.label }),
      });
      if (!r.ok) throw new Error();
      invalidateTaxonomyCache(tab);
      toast.success('Guardado');
      setEditing(null);
      loadKind(tab);
    } catch (e) {
      toast.error('Error al guardar');
    }
  };

  const deleteItem = async () => {
    if (!confirmDelete?.id) return;
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDelete.id }),
      });
      if (!r.ok) throw new Error();
      invalidateTaxonomyCache(tab);
      toast.success('Eliminado');
      setConfirmDelete(null);
      loadKind(tab);
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <Settings2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Configuración</div>
            <div className="text-xs text-slate-500">Empresa, datos bancarios, categorías, unidades, equipos y proveedores</div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-100/60 flex-wrap h-auto">
          <TabsTrigger value="company" className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />Empresa & Pagos
          </TabsTrigger>
          {KINDS.map(k => (
            <TabsTrigger key={k.key} value={k.key} className="text-xs">
              <k.icon className="h-3.5 w-3.5 mr-1.5" />{k.label} ({(data[k.key] || []).length})
            </TabsTrigger>
          ))}
          <TabsTrigger value="printers" className="text-xs">
            <Printer className="h-3.5 w-3.5 mr-1.5" />Equipos ({printersCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <CompanySettingsPanel />
        </TabsContent>

        <TabsContent value="printers" className="mt-4">
          <PrintersManager onCountChange={setPrintersCount} />
        </TabsContent>

        {KINDS.map(k => (
          <TabsContent key={k.key} value={k.key} className="mt-4">
            <Card className="border-slate-200/70">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center shadow-md`}>
                      <k.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900">{k.label}</h2>
                      <p className="text-xs text-slate-500">{k.desc}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => { setAddingNew(true); setNewLabel(''); }} className="bg-orange-500 hover:bg-orange-600">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo
                  </Button>
                </div>

                {/* Add inline row */}
                {addingNew && (
                  <div className="flex gap-2 items-center mb-3 p-2 rounded-lg bg-orange-50 border border-orange-200">
                    <Input
                      autoFocus
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Nombre del nuevo item…"
                      onKeyDown={(e) => { if (e.key === 'Enter') createItem(); if (e.key === 'Escape') { setAddingNew(false); setNewLabel(''); } }}
                    />
                    <Button size="sm" onClick={createItem} disabled={!newLabel.trim()} className="bg-orange-500 hover:bg-orange-600">
                      Crear
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewLabel(''); }}>
                      Cancelar
                    </Button>
                  </div>
                )}

                {loading ? (
                  <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando…
                  </div>
                ) : currentItems.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-slate-400 text-sm italic">
                    Sin registros. Agrega el primero ↑
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Etiqueta</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Código</th>
                          {k.key === 'supply_type' && <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Unidad sugerida</th>}
                          <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentItems.map(item => (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="px-3 py-2 font-medium text-slate-900">{item.label}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                            {k.key === 'supply_type' && (
                              <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.extras?.unit || '—'}</td>
                            )}
                            <td className="px-3 py-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => setEditing({ ...item })} className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600">
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(item)} className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={editing?.label || ''} autoFocus
              onChange={(e) => setEditing(ed => ({ ...ed, label: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && updateItem()} />
            <div className="text-[11px] text-slate-500 mt-2 font-mono">Código: {editing?.code}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={updateItem} className="bg-blue-600 hover:bg-blue-700">
              <Save className="h-3.5 w-3.5 mr-1.5" />Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &quot;{confirmDelete?.label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no elimina los productos o insumos que usan esta etiqueta,
              pero ya no aparecerá en el desplegable al crear nuevos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} className="bg-rose-600 hover:bg-rose-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
