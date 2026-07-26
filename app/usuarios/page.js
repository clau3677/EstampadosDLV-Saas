'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft, Users, Plus, Edit3, Trash2, Loader2, Save, Shield, ShoppingCart, User,
  Mail, Phone, IdCard, MapPin, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

const ROLE_META = {
  admin:    { label: 'Administrador', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: Shield },
  operator: { label: 'Operador / Cajero', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: ShoppingCart },
  customer: { label: 'Cliente',       color: 'bg-slate-100 text-slate-600 border-slate-300', icon: User },
};

const EMPTY = {
  fullName: '',
  email: '',
  role: 'operator',
  phone: '',
  rut: '',
  address: { street: '', comuna: '', city: '', region: '' },
  active: true,
};

export default function UsuariosPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [isNew, setIsNew] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/users');
      if (r.ok) setRows(await r.json());
    } catch (e) {
      toast.error('Error al cargar usuarios');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setIsNew(true);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setIsNew(false);
    setForm({
      ...EMPTY,
      ...row,
      address: row.address || { street: '', comuna: '', city: '', region: '' },
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.fullName.trim() || !form.email.trim()) {
      return toast.error('Nombre y email son obligatorios');
    }
    setSaving(true);
    try {
      const url = '/api/users';
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Error');
      toast.success(isNew ? 'Usuario creado' : 'Usuario actualizado');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    try {
      const r = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!r.ok) throw new Error();
      toast.success(!row.active ? 'Usuario activado' : 'Usuario desactivado');
      load();
    } catch { toast.error('Error al actualizar'); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDelete.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Error');
      toast.success('Usuario eliminado');
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  // -------- Filters --------
  const filtered = rows.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.fullName || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (u.rut || '').toLowerCase().includes(q);
  });

  const counts = {
    all: rows.length,
    admin: rows.filter(u => u.role === 'admin').length,
    operator: rows.filter(u => u.role === 'operator').length,
    customer: rows.filter(u => u.role === 'customer').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />Dashboard
        </Link>
        <div className="text-slate-300">/</div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Usuarios del sistema</h1>
            <div className="text-xs text-slate-500">Administradores, cajeros/operadores y clientes registrados</div>
          </div>
        </div>
        <div className="ml-auto">
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />Nuevo usuario
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, email, RUT..."
            className="h-10 pl-10 text-sm"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { k: 'all',      label: `Todos (${counts.all})` },
            { k: 'admin',    label: `Admin (${counts.admin})` },
            { k: 'operator', label: `Cajeros (${counts.operator})` },
            { k: 'customer', label: `Clientes (${counts.customer})` },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setFilterRole(t.k)}
              className={`px-3 h-10 rounded-md border text-xs font-semibold transition-all ${
                filterRole === t.k
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Users className="h-8 w-8 text-slate-400 mx-auto" />
            <div className="mt-3 text-sm font-medium">No hay usuarios que coincidan</div>
            <Button onClick={openNew} className="mt-4" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />Añadir primero
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(row => {
            const meta = ROLE_META[row.role] || ROLE_META.customer;
            const RoleIcon = meta.icon;
            return (
              <Card key={row.id} className={row.active === false ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <RoleIcon className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-900 truncate">{row.fullName}</div>
                      <Badge className={`text-[10px] h-4 mt-0.5 ${meta.color}`}>{meta.label}</Badge>
                    </div>
                    <Switch checked={row.active !== false} onCheckedChange={() => toggleActive(row)} />
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-400 shrink-0" /><span className="truncate">{row.email}</span></div>
                    {row.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-400 shrink-0" />{row.phone}</div>}
                    {row.rut && <div className="flex items-center gap-1.5"><IdCard className="h-3 w-3 text-slate-400 shrink-0" /><span className="font-mono">{row.rut}</span></div>}
                    {row.address?.comuna && (
                      <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-slate-400 shrink-0" /><span className="truncate">{row.address.comuna}, {row.address.city}</span></div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)} className="flex-1">
                      <Edit3 className="h-3 w-3 mr-1" />Editar
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => setConfirmDelete(row)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Crear/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {isNew ? 'Nuevo usuario' : `Editar ${form.fullName}`}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="col-span-full">
              <Label className="text-xs">Nombre completo *</Label>
              <Input
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                placeholder="Ej: Carlos Pérez"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value.toLowerCase() })}
                placeholder="cajero@estampadosdlv.cl"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Rol *</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (acceso total)</SelectItem>
                  <SelectItem value="operator">Cajero / Operador (POS + producción)</SelectItem>
                  <SelectItem value="customer">Cliente (comprador registrado)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">
                {form.role === 'admin' && 'Puede gestionar todo el sistema.'}
                {form.role === 'operator' && 'Puede operar el POS, ver Kanban, gestionar producción.'}
                {form.role === 'customer' && 'Cliente final (uso futuro con auth de tienda).'}
              </p>
            </div>

            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+56 9 1234 5678"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">RUT</Label>
              <Input
                value={form.rut}
                onChange={e => setForm({ ...form, rut: e.target.value })}
                placeholder="12.345.678-9"
                className="mt-1 font-mono"
              />
            </div>

            <div className="col-span-full pt-3 border-t">
              <div className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Dirección (opcional)</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Calle y número"
                  value={form.address.street}
                  onChange={e => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
                />
                <Input
                  placeholder="Comuna"
                  value={form.address.comuna}
                  onChange={e => setForm({ ...form, address: { ...form.address, comuna: e.target.value } })}
                />
                <Input
                  placeholder="Ciudad"
                  value={form.address.city}
                  onChange={e => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                />
                <Input
                  placeholder="Región (ej. RM)"
                  value={form.address.region}
                  onChange={e => setForm({ ...form, address: { ...form.address, region: e.target.value } })}
                />
              </div>
            </div>

            <div className="col-span-full flex items-center gap-2 text-xs cursor-pointer pt-2">
              <Switch checked={form.active !== false} onCheckedChange={v => setForm({ ...form, active: v })} />
              <span>Usuario activo (habilitado para operar)</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {isNew ? 'Crear usuario' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{confirmDelete?.fullName}</b> ({confirmDelete?.email}). Si tiene sesiones POS o pedidos, no se podrá eliminar — desactívalo con el toggle en su lugar para preservar historial.
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
