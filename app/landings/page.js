'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Globe, Plus, Edit3, Trash2, Eye, ExternalLink, Loader2, Search, Copy,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { LandingEditDialog } from '@/components/landing-edit-dialog';
import { formatDateTime } from '@/lib/format';

export default function LandingsAdminPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // landing being edited (or {} for new)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/landings');
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { toast.error('Error al cargar'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(l =>
    !query ||
    l.slug?.toLowerCase().includes(query.toLowerCase()) ||
    l.h1?.toLowerCase().includes(query.toLowerCase()) ||
    l.location?.city?.toLowerCase().includes(query.toLowerCase())
  );

  const toggleActive = async (item) => {
    try {
      await fetch('/api/landings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      toast.success(item.active ? 'Landing desactivada' : 'Landing activada');
      load();
    } catch { toast.error('Error'); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch('/api/landings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDelete.id }),
      });
      if (!r.ok) throw new Error();
      toast.success('Eliminada');
      setConfirmDelete(null);
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const copyUrl = (slug) => {
    const url = `${window.location.origin}/servicios/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada', { description: url });
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Globe className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Landing Pages SEO</div>
            <div className="text-xs text-slate-500">Páginas locales para captar tráfico orgánico</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Buscar…" className="pl-9 h-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button onClick={() => setEditing({})} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Nueva Landing
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-slate-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <Globe className="h-8 w-8 mx-auto text-slate-400" />
              <div className="mt-3 font-semibold text-slate-700">Sin landing pages aún</div>
              <div className="text-xs mt-1">Crea la primera para empezar a captar tráfico orgánico local.</div>
              <Button onClick={() => setEditing({})} className="mt-4 bg-indigo-600 hover:bg-indigo-700">
                <Plus className="h-3.5 w-3.5 mr-1.5" />Nueva Landing
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">URL / Slug</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">H1</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Ubicación</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Activa</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-3">
                        <div className="font-mono text-xs text-slate-700">/servicios/{l.slug}</div>
                        <button onClick={() => copyUrl(l.slug)} className="text-[10px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 mt-0.5">
                          <Copy className="h-2.5 w-2.5" />copiar URL
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900 max-w-xs truncate">{l.h1}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {l.location?.city && (
                          <div>
                            <div>{l.location.city}</div>
                            <div className="text-[10px] text-slate-500">{l.location.region}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Switch checked={!!l.active} onCheckedChange={() => toggleActive(l)} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/servicios/${l.slug}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600" title="Ver página">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(l)} className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600" title="Editar">
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(l)} className="h-7 w-7 p-0 text-slate-500 hover:text-rose-600" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LandingEditDialog
        landing={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={load}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar landing?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la página <code>/servicios/{confirmDelete?.slug}</code> permanentemente y dejará de aparecer en Google (puede tardar días).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
