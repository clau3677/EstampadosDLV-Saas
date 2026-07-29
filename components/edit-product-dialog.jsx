'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Trash2, Star, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TaxonomySelect } from '@/components/taxonomy-select';
import { ProductImagesUpload } from '@/components/product-images-upload';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const COMMON_COLORS = ['Negro', 'Blanco', 'Gris', 'Azul', 'Rojo', 'Verde', 'Amarillo', 'Naranjo'];

// Detección de categoría DTF (igual que new-product-dialog)
function normalizeCode(code) {
  return (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const DIMENSION_CATEGORIES = ['dtftextil', 'dtfuv'];
function isDimensionProduct(categoryCode) {
  return DIMENSION_CATEGORIES.includes(normalizeCode(categoryCode));
}

// Variante vacía según tipo
function emptyVariant(isDimension) {
  return isDimension
    ? { id: undefined, name: '', widthCm: '', lengthCm: '', price: '', _initialStock: 0, _existing: false }
    : { id: undefined, name: '', size: '', color: '', price: '', _initialStock: 0, _existing: false };
}

// Convertir variante existente al formato de edición
function variantToEditForm(v, productBasePrice, isDimension) {
  if (isDimension) {
    return {
      id: v.id,
      name: v.name || '',
      widthCm: v.attributes?.widthCm || '',
      lengthCm: v.attributes?.lengthCm || '',
      price: v.price || productBasePrice || 0,
      sku: v.sku || '',
      _existing: true,
    };
  }
  return {
    id: v.id,
    name: v.name || '',
    size: v.attributes?.size || '',
    color: v.attributes?.color || '',
    price: v.price || productBasePrice || 0,
    sku: v.sku || '',
    _existing: true,
  };
}

export function EditProductDialog({ product, open, onOpenChange, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [variants, setVariants] = useState([]);

  // Detectar si es producto de dimensiones
  const isDimension = isDimensionProduct(form.category);

  useEffect(() => {
    if (open && product) {
      const dim = isDimensionProduct(product.category);
      setForm({
        name: product.name || '', sku: product.sku || '',
        category: product.category || '', subcategory: product.subcategory || '',
        description: product.description || '',
        basePrice: product.basePrice || 0, cost: product.cost || 0,
        images: product.images || [],
        featured: !!product.featured,
      });
      setVariants((product.variants || []).map(v => variantToEditForm(v, product.basePrice, dim)));
    }
  }, [open, product]);

  // Re-corregir variantes cuando el producto DTF antiguo no tiene widthCm/lengthCm
  // pero sí es de categoría DTF: extraer dimensiones del nombre de la variante (ej: "28x10")
  useEffect(() => {
    if (!open || !product) return;
    const dim = isDimensionProduct(form.category);
    if (!dim) return;
    setVariants(prev => prev.map(v => {
      // Si ya tiene widthCm/lengthCm, dejarlo
      if (v.widthCm || v.lengthCm) return v;
      // Si es variante existente sin dimensiones en attributes, intentar extraer del nombre
      if (v._existing && v.name) {
        const match = v.name.match(/(\d+)[\s]*[×xX*][\s]*(\d+)/);
        if (match) {
          return { ...v, widthCm: match[1], lengthCm: match[2] };
        }
      }
      return v;
    }));
  }, [open, form.category]);

  // Cuando cambia la categoría, reconstruir variantes si cambia el tipo
  useEffect(() => {
    if (!open || !product) return;
    const newDim = isDimensionProduct(form.category);
    setVariants(prev => {
      const wasDim = prev.length > 0 && 'widthCm' in prev[0];
      if (wasDim !== newDim && prev.length > 0) {
        // Cambió el tipo: mapear lo que se pueda
        return prev.map(v => {
          if (newDim) {
            return { ...v, size: undefined, color: undefined, widthCm: v.widthCm || '', lengthCm: v.lengthCm || '' };
          } else {
            return { ...v, widthCm: undefined, lengthCm: undefined, size: v.size || '', color: v.color || '' };
          }
        });
      }
      return prev;
    });
  }, [form.category, open, product]);

  const updateVariant = (i, patch) => setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const removeVariant = (i) => setVariants((vs) => vs.filter((_, idx) => idx !== i));
  const addVariant = () => setVariants((vs) => [...vs, emptyVariant(isDimension)]);

  if (!product) return null;

  const submit = async () => {
    if (!form.name || !form.category) return toast.error('Nombre y categoría requeridos');
    setSaving(true);
    try {
      const preparedVariants = variants.map(v => {
        const attrs = {};
        if (isDimension) {
          if (v.widthCm) attrs.widthCm = Number(v.widthCm) || 0;
          if (v.lengthCm) attrs.lengthCm = Number(v.lengthCm) || 0;
        } else {
          if (v.size && v.size !== 'none') attrs.size = v.size;
          if (v.color) attrs.color = v.color;
        }
        const label = v.name || (isDimension
          ? `${v.widthCm || '?'}×${v.lengthCm || '?'}cm`
          : [v.size, v.color].filter(Boolean).filter(x => x !== 'none').join(' / ') || 'Único');
        return {
          id: v.id,
          name: label,
          sku: v.sku || undefined,
          price: Number(v.price) || Number(form.basePrice) || 0,
          attributes: attrs,
          ...(v._existing ? {} : { _initialStock: Number(v._initialStock) || 0 }),
        };
      });

      const r = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          name: form.name, sku: form.sku, category: form.category, subcategory: form.subcategory,
          description: form.description,
          basePrice: Number(form.basePrice) || 0, cost: Number(form.cost) || 0,
          images: form.images,
          featured: !!form.featured,
          variants: preparedVariants,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Producto actualizado');
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Información general</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Nombre *</Label>
                <Input value={form.name || ''} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">SKU base</Label>
                <Input value={form.sku || ''} onChange={(e) => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label className="text-xs">Categoría *</Label>
                <TaxonomySelect kind="product_category" value={form.category}
                  onChange={(v) => setForm(f => ({ ...f, category: v }))} />
              </div>
              <div>
                <Label className="text-xs">Precio base (CLP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <Input type="number" min="0" className="pl-6 font-mono" value={form.basePrice || 0}
                    onChange={(e) => setForm(f => ({ ...f, basePrice: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Costo (CLP)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <Input type="number" min="0" className="pl-6 font-mono" value={form.cost || 0}
                    onChange={(e) => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Descripción</Label>
                <Textarea rows={2} value={form.description || ''}
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

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Fotos ({form.images?.length || 0}/8)</div>
            <ProductImagesUpload value={form.images || []} onChange={(images) => setForm(f => ({ ...f, images }))} />
          </div>

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
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg bg-slate-50 border border-slate-200">
                  {/* Nombre variante */}
                  <div className="col-span-3">
                    <Label className="text-[10px]">Nombre variante</Label>
                    <Input
                      className="h-9"
                      placeholder={isDimension ? '31×50cm' : 'M / Negro'}
                      value={v.name || ''}
                      onChange={(e) => updateVariant(i, { name: e.target.value })}
                    />
                  </div>

                  {isDimension ? (
                    <>
                      {/* Ancho */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Ancho (cm)</Label>
                        <Input
                          type="number" min="1" max="60" className="h-9 font-mono"
                          placeholder="31"
                          value={v.widthCm || ''}
                          onChange={(e) => updateVariant(i, { widthCm: e.target.value })}
                        />
                      </div>
                      {/* Largo */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Largo (cm)</Label>
                        <Input
                          type="number" min="1" max="1000" className="h-9 font-mono"
                          placeholder="50"
                          value={v.lengthCm || ''}
                          onChange={(e) => updateVariant(i, { lengthCm: e.target.value })}
                        />
                      </div>
                      {/* Precio */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Precio (CLP)</Label>
                        <Input type="number" className="h-9 font-mono" min="0" value={v.price || 0}
                          onChange={(e) => updateVariant(i, { price: e.target.value })} />
                      </div>
                      {/* Stock */}
                      {!v._existing ? (
                        <div className="col-span-2">
                          <Label className="text-[10px]">Stock inicial</Label>
                          <Input type="number" className="h-9 font-mono" min="0" value={v._initialStock || 0}
                            onChange={(e) => updateVariant(i, { _initialStock: e.target.value })} />
                        </div>
                      ) : (
                        <div className="col-span-2 pb-1.5 text-[10px] text-slate-500 self-end">Stock existente</div>
                      )}
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
                        <Input className="h-9" value={v.color || ''} placeholder="Negro"
                          onChange={(e) => updateVariant(i, { color: e.target.value })} list={`e-colors-${i}`} />
                        <datalist id={`e-colors-${i}`}>{COMMON_COLORS.map(c => <option key={c} value={c} />)}</datalist>
                      </div>
                      {/* Precio */}
                      <div className="col-span-2">
                        <Label className="text-[10px]">Precio (CLP)</Label>
                        <Input type="number" className="h-9 font-mono" min="0" value={v.price || 0}
                          onChange={(e) => updateVariant(i, { price: e.target.value })} />
                      </div>
                      {/* Stock */}
                      {!v._existing ? (
                        <div className="col-span-2">
                          <Label className="text-[10px]">Stock inicial</Label>
                          <Input type="number" className="h-9 font-mono" min="0" value={v._initialStock || 0}
                            onChange={(e) => updateVariant(i, { _initialStock: e.target.value })} />
                        </div>
                      ) : (
                        <div className="col-span-2 pb-1.5 text-[10px] text-slate-500 self-end">Stock existente</div>
                      )}
                    </>
                  )}
                  {/* Eliminar */}
                  <div className="col-span-1">
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => removeVariant(i)}
                      disabled={variants.length === 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Al eliminar una variante existente, su stock también se eliminará.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditProductDialog;
