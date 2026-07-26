'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ShoppingBag, ChevronRight, Package, Loader2,
  Minus, Plus, Check, Info, Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-store';
import { formatCLP } from '@/lib/format';

const CATEGORY_LABELS = {
  apparel:   'Prenda',
  dtf_meter: 'DTF por metro',
  accessory: 'Accesorio',
  other:     'Otro',
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug;
  const [product, setProduct] = useState(null);
  const [stockMap, setStockMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const add = useCart(s => s.add);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const products = await fetch('/api/products').then(r => r.json());
        const p = (Array.isArray(products) ? products : []).find(x => x.slug === slug);
        if (!p) { setProduct(null); return; }
        setProduct(p);
        setSelectedVariantId(p.variants?.[0]?.id || null);

        // Cargar stock para todas las variantes
        const stockRows = await fetch('/api/inventory/commercial').then(r => r.json());
        const stockForProduct = (Array.isArray(stockRows) ? stockRows : []).filter(s => s.productId === p.id);
        const map = {};
        stockForProduct.forEach(s => { map[s.variantId] = s.quantity - (s.reservedQuantity || 0); });
        setStockMap(map);
      } finally { setLoading(false); }
    })();
  }, [slug]);

  if (loading) return (
    <div className="container py-20 flex items-center justify-center text-slate-500">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando producto…
    </div>
  );

  if (!product) return (
    <div className="container py-20 text-center">
      <div className="text-5xl mb-3">🔍</div>
      <h1 className="text-2xl font-bold text-slate-900">Producto no encontrado</h1>
      <p className="text-slate-500 mt-2">Puede que haya sido movido o eliminado.</p>
      <Button asChild className="mt-6 bg-orange-500 hover:bg-orange-600">
        <Link href="/tienda">Volver al catálogo</Link>
      </Button>
    </div>
  );

  const selectedVariant = product.variants?.find(v => v.id === selectedVariantId) || product.variants?.[0];
  const stockAvailable = stockMap[selectedVariant?.id] ?? 0;
  const outOfStock = stockAvailable <= 0;
  const price = selectedVariant?.price || product.basePrice;

  // Extraer tallas y colores únicos para selectores
  const sizes = [...new Set(product.variants?.map(v => v.attributes?.size).filter(Boolean))];
  const colors = [...new Set(product.variants?.map(v => v.attributes?.color).filter(Boolean))];

  const findVariantBy = (size, color) => {
    return product.variants?.find(v =>
      (!size || v.attributes?.size === size) &&
      (!color || v.attributes?.color === color)
    );
  };

  const currentSize = selectedVariant?.attributes?.size;
  const currentColor = selectedVariant?.attributes?.color;

  const handleAdd = () => {
    if (outOfStock) return toast.error('Sin stock disponible');
    if (qty > stockAvailable) return toast.error(`Sólo hay ${stockAvailable} unidades disponibles`);
    add({
      productId: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      variantName: selectedVariant.name,
      price,
      image: product.images?.[0] || null,
    }, qty);
    toast.success('Agregado al carrito', { description: `${product.name} · ${selectedVariant.name}` });
  };

  return (
    <div className="container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
        <Link href="/tienda" className="hover:text-slate-800">Catálogo</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-700">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* IMAGE GALLERY */}
        <div>
          <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative">
            {product.images?.[selectedImage] ? (
              <img
                src={product.images[selectedImage]}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                <Package className="h-24 w-24 text-slate-400/50" />
              </div>
            )}
          </div>
          {product.images?.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === i ? 'border-orange-500 ring-2 ring-orange-200' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INFO */}
        <div>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700 border border-slate-200">
            {CATEGORY_LABELS[product.category] || product.category}
          </Badge>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-slate-900">{product.name}</h1>
          <div className="mt-3 text-3xl font-mono font-bold text-slate-900">{formatCLP(price)}</div>
          {product.description && (
            <p className="mt-4 text-slate-600 leading-relaxed">{product.description}</p>
          )}

          {/* Info si es DTF por metro */}
          {product.category === 'dtf_meter' && (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-700">
                <span className="font-semibold">¿Tienes un diseño listo?</span> Usa el{' '}
                <Link href="/gang-sheet" className="text-orange-700 font-semibold underline underline-offset-2 hover:text-orange-800">
                  Gang Sheet Builder <Layers className="h-3 w-3 inline" />
                </Link>{' '}
                para cotizar por mm real usado.
              </div>
            </div>
          )}

          {/* Selectores de variante */}
          <div className="mt-6 space-y-4">
            {sizes.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Talla</div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const targetVariant = findVariantBy(s, currentColor);
                    const isSelected = s === currentSize;
                    return (
                      <button
                        key={s}
                        onClick={() => targetVariant && setSelectedVariantId(targetVariant.id)}
                        disabled={!targetVariant}
                        className={`
                          min-w-[3rem] h-10 px-3 rounded-lg border-2 font-semibold text-sm transition-all
                          ${isSelected ? 'border-orange-500 bg-orange-50 text-orange-700' :
                            targetVariant ? 'border-slate-200 hover:border-slate-400 text-slate-700' :
                            'border-slate-100 text-slate-300 line-through cursor-not-allowed'}
                        `}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {colors.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Color</div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => {
                    const targetVariant = findVariantBy(currentSize, c);
                    const isSelected = c === currentColor;
                    return (
                      <button
                        key={c}
                        onClick={() => targetVariant && setSelectedVariantId(targetVariant.id)}
                        disabled={!targetVariant}
                        className={`
                          px-3 h-10 rounded-lg border-2 font-medium text-sm transition-all inline-flex items-center gap-1.5
                          ${isSelected ? 'border-orange-500 bg-orange-50 text-orange-700' :
                            targetVariant ? 'border-slate-200 hover:border-slate-400 text-slate-700' :
                            'border-slate-100 text-slate-300 line-through cursor-not-allowed'}
                        `}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cantidad + Add */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" onClick={() => setQty(q => Math.max(1, q - 1))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-12 text-center font-mono font-bold text-slate-900">{qty}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(q => q + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  size="lg"
                  onClick={handleAdd}
                  disabled={outOfStock}
                  className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-base font-semibold"
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {outOfStock ? 'Sin stock' : `Agregar · ${formatCLP(price * qty)}`}
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`inline-flex h-2 w-2 rounded-full ${outOfStock ? 'bg-rose-500' : stockAvailable < 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className={`font-medium ${outOfStock ? 'text-rose-600' : 'text-slate-600'}`}>
                  {outOfStock ? 'Sin stock' : stockAvailable < 5 ? `Últimas ${stockAvailable} unidades` : `${stockAvailable} unidades disponibles`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
