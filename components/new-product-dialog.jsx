'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, PackagePlus, Star, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TaxonomySelect } from '@/components/taxonomy-select';
import { ProductImagesUpload } from '@/components/product-images-upload';
import { formatCLP } from '@/lib/format';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const COMMON_COLORS = ['Negro', 'Blanco', 'Gris', 'Azul', 'Rojo', 'Verde', 'Amarillo', 'Naranjo'];

// Categorías que usan variantes de dimensiones (ancho x largo) en lugar de talla/color
// Se detecta por el código de la categoría (normalizado a minúsculas, sin espacios ni guiones)
function normalizeCode(code) {
  return (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const DIMENSION_CATEGORIES = ['dtftextil', 'dtfuv'];

// Variantes por defecto según el tipo de producto
const emptyVariant = (isDimension) => isDimension
  ? { name: '', widthCm: '', lengthCm: '', price: '', initialStock: 0 }
  : { name: '', size: '', color: '', price: '', initialStock: 0 };

function isDimensionProduct(categoryCode) {
  return DIMENSION_CATEGORIES.includes(normalizeCode(categoryCode));
}

export function NewProductDialog({ onCreated, trigger }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', category: '', subcategory: '',
    description: '', basePrice: '', cost: '', images: [], featured: false,
  });
  const [variants, setVariants] = useState([emptyVariant(false)]);

  // Detectar si es producto de dimensiones (por categoría, no subcategoría)
  const isDimension = isDimensionProduct(form.category);

  useEffect(() => {
    if (open) {
      setForm({ name: '', sku: '', category: '', subcategory: '', description: '', basePrice: '', cost: '', images: [], featured: false });
      setVariants([emptyVariant(false)]);
    }
  }, [open]);

  // Cuando cambia la categoría, resetear variantes al tipo correcto
  useEffect(() => {
    const newIsDim = isDimensionProduct(form.category);
    setVariants((prev) => {
      const wasDim = prev.length > 0 && 'widthCm' in prev[0];
      if (wasDim !== newIsDim) {
        return [emptyVariant(newIsDim)];
      }
      return prev;
    });
  }, [form.category]);

  const updateVariant = (i, patch) => setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const removeVariant = (i) => setVariants((vs) => vs.filter((_, idx) => idx !== i));
  const addVariant = () => setVariants((vs) => [...vs, emptyVariant(isDimension)]);

  const submit = async () => {
    if (!form.name || !form.category) return toast.error('Nombre y categoría son obligatorios');
    setSaving(true);
    try {
      const preparedVariants = variants
        .filter(v => v.name || (isDimension ? (v.widthCm || v.lengthCm) : (v.size || v.color)))
        .map((v) => {
          const attrs = {};
          if (isDimension) {
            if (v.widthCm) attrs.widthCm = Number(v.widthCm) || 0;
            if (v.lengthCm) attrs.lengthCm = Number(v.lengthCm) || 0;
          } else {
            if (v.size && v.size !== 'none') attrs.size = v.size;
            if (v.color) attrs.color = v.color;
          }
          const label = v.name || (isDimension
            ? `${v.widthCm || '?'}cm × ${v.lengthCm || '?'}cm`
            : [v.size, v.color].filter(Boolean).filter(x => x !== 'none').join(' / ') || 'Único');
          return {
            name: label,
            price: Number(v.price) || Number(form.basePrice) || 0,
            attributes: attrs,
            initialStock: Number(v.initialStock) || 0,
          };
        });

      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, sku: form.sku, category: form.category, subcategory: form.subcategory,
          description: form.description, basePrice: Number(form.basePrice) || 0, cost: Number(form.cost) || 0,
          images: form.images, variants: preparedVariants, featured: !!form.featured,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success('Producto creado', {
        description: `${data.product.name} · ${data.stockRows} variante${data.stockRows !== 1 ? 's' : ''}`,
      });
      setOpen(false);
      onCreated?.(data);
    } catch (e) {
      toast.error('Error al crear producto', { description: e.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
            <PackagePlus className="h-3.5 w-3.5 mr-1.5" />Nuevo Producto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info general */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Información general</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Nombre *</Label>
                <Input
                  placeholder={isDimension ? 'Ej: Láminas DTF Textil 31cm' : 'Ej: Polera Algodón Premium'}
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">SKU base (opcional)</Label>
                <Input
                  placeholder="DTF-TEXTIL-31"
                  value={form.sku}
                  onChange={(e) => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <Label className="text-xs">Categoría *</Label>
                <TaxonomySelect
                  kind="product_category"
                  value={form.category}
                  onChange={(v) => setForm(f => ({ ...f, category: v }))}
                  placeholder="Elige o crea…"
                />
              </div>
              <div>
                <Label className="text-xs">Precio base (CLP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <Input type="number" min="0" className="pl-6 font-mono" value={form.basePrice}
                    onChange={(e) => setForm(f => ({ ...f, basePrice: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Costo (CLP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <Input type="number" min="0" className="pl-6 font-mono" value={form.cost}
                    onChange={(e) => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Descripción</Label>
                <Textarea rows={2} placeholder="Detalles del producto para la tienda web…" value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    form.featured ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <Star className={`h-5 w-5 shrink-0 ${form.featured ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">Producto destacado</div>
                    <div className="text-xs text-slate-500">Aparece automáticamente en landings SEO en modo &quot;Destacados&quot;.</div>
                  </div>
                  <Switch
                    checked={!!form.featured}
                    onCheckedChange={(v) => setForm(f => ({ ...f, featured: v }))}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Fotos */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Fotos ({form.images.length}/8)</div>
            <ProductImagesUpload
              value={form.images}
              onChange={(images) => setForm(f => ({ ...f, images }))}
            />
          </div>

          {/* Variantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Variantes ({variants.length})
                </div>
                {isDimension && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">
                    <Ruler className="h-2.5 w-2.5" /> Ancho × Largo (cm)
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={addVariant}>
                <Plus className="h-3.5 w-3.5 mr-1" />Agregar variante
              </Button>
            </div>

            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className={`grid gap-2 items-end p-2 rounded-lg border ${
                  isDimension ? 'grid-cols-12' : 'grid-cols-12'
                } bg-slate-50 border-slate-200`}>
                  {/* Nombre de variante (siempre visible) */}
                  <div className="col-span-3">
                    <Label className="text-[10px]">Nombre variante</Label>
                    <Input
                      className="h-9"
                      placeholder={isDimension ? '31×50cm' : 'M / Negro'}
                      value={v.name}
                      onChange={(e) => updateVariant(i, { name: e.target.value })}
                    />
                  </div>

                  {isDimension ? (
                    <>
                      {/* Ancho en cm */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Ancho (cm)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="60"
                          className="h-9 font-mono"
                          placeholder="31"
                          value={v.widthCm}
                          onChange={(e) => updateVariant(i, { widthCm: e.target.value })}
                        />
                      </div>
                      {/* Largo en cm */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Largo (cm)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="1000"
                          className="h-9 font-mono"
                          placeholder="50"
                          value={v.lengthCm}
                          onChange={(e) => updateVariant(i, { lengthCm: e.target.value })}
                        />
                      </div>
                      {/* Precio */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Precio (CLP)</Label>
                        <Input
                          type="number"
                          className="h-9 font-mono"
                          min="0"
                          placeholder={form.basePrice || '0'}
                          value={v.price}
                          onChange={(e) => updateVariant(i, { price: e.target.value })}
                        />
                      </div>
                      {/* Stock inicial */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Stock</Label>
                        <Input
                          type="number"
                          className="h-9 font-mono"
                          min="0"
                          value={v.initialStock}
                          onChange={(e) => updateVariant(i, { initialStock: e.target.value })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Talla */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Talla</Label>
                        <Select value={v.size || undefined} onValueChange={(size) => updateVariant(i, { size })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— sin talla</SelectItem>
                            {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Color */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Color</Label>
                        <Input className="h-9" placeholder="Negro" value={v.color}
                          onChange={(e) => updateVariant(i, { color: e.target.value })} list={`colors-${i}`} />
                        <datalist id={`colors-${i}`}>{COMMON_COLORS.map(c => <option key={c} value={c} />)}</datalist>
                      </div>
                      {/* Precio */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Precio (CLP)</Label>
                        <Input type="number" className="h-9 font-mono" min="0" placeholder={form.basePrice || '0'}
                          value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} />
                      </div>
                      {/* Stock inicial */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Stock inicial</Label>
                        <Input type="number" className="h-9 font-mono" min="0" value={v.initialStock}
                          onChange={(e) => updateVariant(i, { initialStock: e.target.value })} />
                      </div>
                    </>
                  )}
                  {/* Eliminar */}
                  <div className="col-span-1">
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                      disabled={variants.length === 1}
                      onClick={() => removeVariant(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : 'Crear producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewProductDialog;
