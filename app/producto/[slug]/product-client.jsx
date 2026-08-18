'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ShoppingBag, ChevronRight, Package, Loader2, Minus, Plus, Check, Info,
  Layers, Truck, Shield, Sparkles, Clock, MessageCircle, Palette, Award,
  ArrowRight, Star, Ruler,
  Share2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-store';
import { formatCLP } from '@/lib/format';
import { BUSINESS } from '@/lib/constants/business';
import ProductLandingAdminBar from '@/components/product-landing-admin-bar';

// Construye URL del thumbnail optimizado (WebP, q=80)
function thumbnailUrl(imagePath, width = 600) {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `/api/thumbnails?src=${encodeURIComponent(imagePath)}&w=${width}&format=webp&q=80`;
}

const CATEGORY_LABELS = {
  dtf_meter:        'DTF por metro',
  blank_apparel:    'Ropa Lisa',
  printed_apparel:  'Ropa Estampada',
  caps_hats:        'Gorra',
  merch:            'Merchandising',
  workwear:         'Ropa de Trabajo',
  apparel:          'Prenda',
  accessory:        'Accesorio',
  other:            'Otro',
};

const TRUST_BADGES = [
  { icon: Award,   text: 'Impresión 300 DPI garantizada' },
  { icon: Truck,   text: 'Despacho a todo Chile' },
  { icon: Shield,  text: 'Devolución si hay defectos' },
  { icon: Clock,   text: 'Producción en 24-48h' },
];

export default function ProductDetailPage({ initialProduct = null, initialProducts = null }) {
  const params = useParams();
  const slug = params?.slug;
  // SSR (auditoría jul-2026): el Server Component pasa el producto ya resuelto,
  // así el HTML inicial contiene nombre/precio/imágenes para Google.
  const [product, setProduct] = useState(initialProduct);
  const [allProducts, setAllProducts] = useState(Array.isArray(initialProducts) ? initialProducts : []);
  const [stockMap, setStockMap] = useState({});
  const [stockLoaded, setStockLoaded] = useState(false);
  const [inventoryHasStock, setInventoryHasStock] = useState(false);
  const [stockInfo, setStockInfo] = useState(null); // { onDemand, supplierInStock, supplier } para la variante seleccionada
  const [loading, setLoading] = useState(!initialProduct);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const add = useCart(s => s.add);
  const openCart = useCart(s => s.open);

  useEffect(() => {
    (async () => {
      // Con datos SSR ya pintados, solo revalidamos y traemos stock (que es dinámico).
      if (!initialProduct) setLoading(true);
      try {
        let p = initialProduct;
        if (!p || p.slug !== slug || allProducts.length === 0) {
          const products = await fetch('/api/products').then(r => r.json());
          const list = Array.isArray(products) ? products : [];
          setAllProducts(list);
          p = list.find(x => x.slug === slug);
          if (!p) { setProduct(null); return; }
          setProduct(p);
        }
        setSelectedImage(0);
        setSelectedVariantId(prev => prev || p.variants?.[0]?.id || null);
        // Meta Pixel - ViewContent event for catalog matching
        if (typeof window.fbq === 'function' && p?.id) {
          window.fbq('track', 'ViewContent', {
            content_ids: [p.id],
            content_type: 'product',
            content_name: p.name || '',
            content_category: p.category || '',
            value: p.price || 0,
            currency: 'CLP',
          });
        }

        const stockRows = await fetch(`/api/inventory/commercial?productId=${p.id}`).then(r => r.json());
        const stockForProduct = Array.isArray(stockRows) ? stockRows : [];
        const map = {};
        const infoMap = {}; // variante → { onDemand, supplierInStock, supplier }
        stockForProduct.forEach(s => {
          map[s.variantId] = s.quantity - (s.reservedQuantity || 0);
          infoMap[s.variantId] = {
            onDemand: !!s.onDemand,
            supplierInStock: s.supplierInStock !== false,
            supplier: s.supplier || null,
            location: s.location || null,
          };
        });
        // Fallback: si alguna variante no tiene fila de inventario por id,
        // buscar coincidencia por talla/color con una fila con stock > 0.
        const variantList = p.variants || [];
        variantList.forEach(v => {
          if (map[v.id] !== undefined) return;
          const size = v.attributes?.size;
          const color = v.attributes?.color;
          // Solo considerar filas de inventario que aún no mapean una variante conocida
          const mappedIds = new Set(Object.keys(map));
          const match = stockForProduct.find(s =>
            !mappedIds.has(s.variantId) &&
            (!size || s.attributes?.size === size || s.size === size) &&
            (!color || s.attributes?.color === color || s.color === color) &&
            ((s.quantity || 0) - (s.reservedQuantity || 0)) > 0
          );
          if (match) {
            map[v.id] = match.quantity - (match.reservedQuantity || 0);
            infoMap[v.id] = {
              onDemand: !!match.onDemand,
              supplierInStock: match.supplierInStock !== false,
              supplier: match.supplier || null,
              location: match.location || null,
            };
          }
        });
        setStockMap(map);
        // Red de seguridad: si el inventario tiene stock real de este producto,
        // nunca mostrar un "Sin stock" duro aunque el mapeo por variante falle.
        const hasStock = stockForProduct.some(s => ((s.quantity || 0) - (s.reservedQuantity || 0)) > 0);
        setInventoryHasStock(hasStock);
        setStockLoaded(true);
        // Inicializar info para la variante seleccionada
        const firstVariantId = p.variants?.[0]?.id || null;
        setStockInfo(infoMap[firstVariantId] || null);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Actualizar stockInfo cuando cambia la variante seleccionada
  useEffect(() => {
    // Re-fetch del stock para obtener info de la variante (filtrado por productId)
    if (!selectedVariantId || !product?.id) return;
    (async () => {
      try {
        const stockRows = await fetch(`/api/inventory/commercial?productId=${product.id}`).then(r => r.json());
        const s = (Array.isArray(stockRows) ? stockRows : []).find(
          r => r.variantId === selectedVariantId
        );
        if (s) {
          setStockInfo({
            onDemand: !!s.onDemand,
            supplierInStock: s.supplierInStock !== false,
            supplier: s.supplier || null,
            location: s.location || null,
          });
        } else {
          setStockInfo(null);
        }
      } catch { /* noop */ }
    })();
  }, [selectedVariantId, product?.id]);

  // Cuando cambia la variante (color/talla), actualizar la imagen principal
  // buscando la foto del color de la variante en la galería del producto.
  useEffect(() => {
    const v = product?.variants?.find(x => x.id === selectedVariantId);
    if (!v || !product?.images?.length) return;
    const color = v.attributes?.color || null;
    const size = v.attributes?.size || null;
    // 1) Buscar por la imagen propia de la variante
    if (v.image && product.images.includes(v.image)) {
      setSelectedImage(product.images.indexOf(v.image));
      return;
    }
    // 2) Buscar otra variante del MISMO color y misma talla que sí tenga imagen en la galería
    const sameAttr = product.variants?.find(x =>
      x.id !== v.id &&
      x.image &&
      product.images.includes(x.image) &&
      (color == null || (x.attributes?.color || null) === color) &&
      (size == null || (x.attributes?.size || null) === size)
    );
    if (sameAttr?.image) {
      setSelectedImage(product.images.indexOf(sameAttr.image));
      return;
    }
    // 3) Buscar cualquier variante del mismo color con imagen
    if (color != null) {
      const sameColor = product.variants?.find(x =>
        x.image &&
        product.images.includes(x.image) &&
        (x.attributes?.color || null) === color
      );
      if (sameColor?.image) {
        setSelectedImage(product.images.indexOf(sameColor.image));
        return;
      }
    }
  }, [selectedVariantId, product]);

  if (loading) return (
    <div className="container py-20 flex items-center justify-center text-slate-500">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando producto…
    </div>
  );

  if (!product) return (
    <div className="container py-20 text-center">
      <div className="text-6xl mb-3">🔍</div>
      <h1 className="text-2xl font-bold text-slate-900">Producto no encontrado</h1>
      <p className="text-slate-500 mt-2">Puede que haya sido movido o eliminado.</p>
      <Button asChild className="mt-6 bg-orange-500 hover:bg-orange-600">
        <Link href="/tienda">Volver al catálogo</Link>
      </Button>
    </div>
  );

  const selectedVariant = product.variants?.find(v => v.id === selectedVariantId) || product.variants?.[0];
  // Mientras el stock no ha cargado, no mostrar "Sin stock" (evita flash de agotado).
  // Red de seguridad: si el inventario confirma stock para el producto, la variante
  // sin fila propia no puede quedar marcada como agotada.
  const stockAvailable = stockLoaded ? (stockMap[selectedVariant?.id] ?? (inventoryHasStock ? 1 : 0)) : 1; // 1 = no agotado durante carga
  const outOfStock = stockLoaded && stockAvailable <= 0 && !inventoryHasStock;
  const price = selectedVariant?.price || product.basePrice;

  // Indicadores de proveedor (bajo pedido)
  const currentStockInfo = stockInfo || (stockMap ? {} : null);
  const isOnDemand = !!currentStockInfo?.onDemand;
  const supplierLabel = currentStockInfo?.supplier === 'cottonext' ? 'Cottonext'
    : currentStockInfo?.supplier === 'textilryu' ? 'Textil Ryu'
    : currentStockInfo?.supplier === 'treck' ? 'Treck'
    : null;
  const supplierOutOfStock = isOnDemand && currentStockInfo?.supplierInStock === false;

  const sizes = [...new Set(product.variants?.map(v => v.attributes?.size).filter(Boolean))];
  const colors = [...new Set(product.variants?.map(v => v.attributes?.color).filter(Boolean))];

  // Índice de la imagen de cada color (para pintar el borde de la miniatura correcta)
  const colorImageIndex = {};
  (product.variants || []).forEach(v => {
    const c = v.attributes?.color;
    if (c && v.image && product.images?.includes(v.image) && colorImageIndex[c] === undefined) {
      colorImageIndex[c] = product.images.indexOf(v.image);
    }
  });

  // Detectar si el producto tiene variantes de dimensiones (DTF)
  // Usa attributes (productos nuevos) o category code (productos antiguos sin attributes)
  const dtfCategoryCodes = ['dtftextil', 'dtfuv'];
  const productCodeNorm = (product.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hasDimensionVariants = product.variants?.some(v =>
    v.attributes?.widthCm !== undefined || v.attributes?.lengthCm !== undefined
  ) || dtfCategoryCodes.includes(productCodeNorm);

  const findVariantBy = (size, color) => (
    product.variants?.find(v =>
      (!size || v.attributes?.size === size) &&
      (!color || v.attributes?.color === color)
    )
  );

  const currentSize = selectedVariant?.attributes?.size;
  const currentColor = selectedVariant?.attributes?.color;

  const handleAdd = (openAfter = false) => {
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
    // Meta Pixel - AddToCart event for catalog matching
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'AddToCart', {
        content_ids: [product.id],
        content_type: 'product',
        content_name: product.name || '',
        content_category: product.category || '',
        value: price || 0,
        currency: 'CLP',
      });
    }
    toast.success('Agregado al carrito 🛒', { description: `${product.name} · ${selectedVariant.name}` });
    if (openAfter) openCart();
  };

  const related = allProducts.filter(p => p.id !== product.id && p.category === product.category && p.active !== false).slice(0, 4);

  return (
    <>
      {/* JSON-LD ya se genera en el server component (page.js) — no duplicar */}

      {/* Breadcrumb top ribbon */}
      <div className="bg-slate-50 border-b border-slate-200">
        <nav className="container flex items-center gap-1.5 text-xs text-slate-600 py-2.5">
          <Link href="/tienda" className="hover:text-orange-600 font-medium">Tienda</Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <Link href={`/tienda?cat=${product.category}`} className="hover:text-orange-600 font-medium">
            {CATEGORY_LABELS[product.category] || product.category}
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="text-slate-500 truncate">{product.name}</span>
        </nav>
      </div>

      {/* Admin bar: sólo se pinta si el usuario logueado es admin (auto-detecta) */}
      <div className="container pt-4">
        <ProductLandingAdminBar product={product} />
      </div>

      {/* MAIN */}
      <section className="container py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* IMAGE GALLERY */}
          <div className="lg:col-span-3">
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 shadow-xl aspect-square">
              {product.images?.[selectedImage] ? (
                <img
                  src={thumbnailUrl(product.images[selectedImage], 800)}
                  alt={product.name}
                  loading="eager"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Package className="h-32 w-32 text-slate-400/40" />
                </div>
              )}

              {/* Floating badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.featured && (
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-lg">
                    <Star className="h-3 w-3 mr-1 fill-white" />Destacado
                  </Badge>
                )}
                {product.category === 'dtf_meter' && (
                  <Badge className="bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white border-0 shadow-lg">
                    <Layers className="h-3 w-3 mr-1" />DTF por metro
                  </Badge>
                )}
              </div>

              {!stockLoaded && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
                  <div className="bg-white rounded-2xl px-6 py-4 text-center shadow-xl">
                    <Loader2 className="h-6 w-6 mx-auto text-orange-500 animate-spin mb-2" />
                    <div className="text-slate-600 text-sm font-medium">Cargando stock…</div>
                  </div>
                </div>
              )}
              {outOfStock && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="bg-white rounded-2xl px-6 py-4 text-center shadow-xl">
                    <div className="text-rose-600 font-bold">Sin stock</div>
                    <div className="text-xs text-slate-500 mt-1">Consulta reposición</div>
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnails */}
              {product.images?.length > 1 && (
              <div className="mt-4 grid grid-cols-5 gap-3">
                {product.images.map((img, i) => {
                  const isThumbColorMatch = currentColor && colorImageIndex[currentColor] === i;
                  return (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selectedImage === i || isThumbColorMatch
                        ? 'border-orange-500 ring-2 ring-orange-200 shadow-md'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={thumbnailUrl(img, 150)}
                      alt={`${product.name} - imagen ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* INFO */}
          <div className="lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
            {/* Category + rating */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700 border border-slate-200">
                {CATEGORY_LABELS[product.category] || product.category}
              </Badge>
              <div className="inline-flex items-center gap-0.5 text-amber-500">
                {[1,2,3,4,5].map(n => <Star key={n} className="h-3.5 w-3.5 fill-current" />)}
                <span className="ml-1 text-xs font-semibold text-slate-600">4.9 · 127 reseñas</span>
              </div>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
                {product.name}
              </h1>

              {/* Compartir en redes sociales */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Compartir</span>
                <button
                  onClick={() => {
                    const url = window.location.href;
                    const text = `Mira este producto: ${product.name}`;
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
                  }}
                  title="Compartir en Facebook"
                  className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                <button
                  onClick={() => {
                    const url = window.location.href;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${product.name} — ${url}`)}`, '_blank');
                  }}
                  title="Compartir en WhatsApp"
                  className="w-8 h-8 rounded-lg bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
                <button
                  onClick={() => {
                    const url = window.location.href;
                    const text = `${product.name} — ${url}`;
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'width=600,height=400');
                  }}
                  title="Compartir en X (Twitter)"
                  className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      toast.success('Enlace copiado');
                    }).catch(() => {
                      toast.error('No se pudo copiar');
                    });
                  }}
                  title="Copiar enlace"
                  className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-colors flex items-center justify-center"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <div className="text-4xl font-mono font-bold text-slate-900">{formatCLP(price)}</div>
              <div className="text-xs text-slate-500 font-medium">IVA incluido</div>
            </div>

            {/* Badge de proveedor (bajo pedido) */}
            {isOnDemand && (
              <div className="mt-3">
                {supplierOutOfStock ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <Clock className="h-3.5 w-3.5" />
                    Bajo pedido · {supplierLabel || 'Proveedor'} — Agotado, pedido especial 7-10 días hábiles
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold">
                    <Truck className="h-3.5 w-3.5" />
                    Bajo pedido · {supplierLabel || 'Proveedor'} — Entrega 5-7 días hábiles
                  </div>
                )}
              </div>
            )}

            {product.description && (
              <p className="mt-4 text-slate-600 leading-relaxed">{product.description}</p>
            )}

            {/* Info si es DTF por metro */}
            {product.category === 'dtf_meter' && (
              <div className="mt-4 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="text-sm text-slate-800">
                  <div className="font-bold text-orange-900">¿Tienes un diseño listo?</div>
                  <div className="mt-0.5 text-xs text-slate-700">
                    Usa el editor visual para cotizar por mm real usado.
                  </div>
                  <Link href="/gang-sheet"
                    className="mt-2 inline-flex items-center gap-1 text-orange-600 font-bold text-xs hover:text-orange-700">
                    Abrir Gang Sheet Builder <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* Selectores de variante */}
            <div className="mt-6 space-y-5">
              {sizes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-600">Talla</div>
                    <div className="text-xs text-slate-500">{currentSize && <>Seleccionado: <b>{currentSize}</b></>}</div>
                  </div>
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
                            min-w-[3.25rem] h-11 px-4 rounded-lg border-2 font-bold text-sm transition-all
                            ${isSelected ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-rose-50 text-orange-700 shadow-sm' :
                              targetVariant ? 'border-slate-200 hover:border-slate-400 text-slate-700 bg-white' :
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
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-600">Color</div>
                    <div className="text-xs text-slate-500">{currentColor && <>Seleccionado: <b>{currentColor}</b></>}</div>
                  </div>
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
                            px-4 h-11 rounded-lg border-2 font-semibold text-sm transition-all inline-flex items-center gap-1.5
                            ${isSelected ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-rose-50 text-orange-700 shadow-sm' :
                              targetVariant ? 'border-slate-200 hover:border-slate-400 text-slate-700 bg-white' :
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

              {/* Selector de variantes por dimensiones (DTF) */}
              {hasDimensionVariants && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-600">Tamaño</div>
                    <div className="text-xs text-slate-500">
                      {selectedVariant?.name && <>Seleccionado: <b>{selectedVariant.name}</b></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(product.variants || []).map((v) => {
                      const isSelected = v.id === selectedVariantId;
                      const stock = stockMap[v.id] ?? 0;
                      const noStock = stock <= 0;
                      return (
                        <button
                          key={v.id}
                          onClick={() => !noStock && setSelectedVariantId(v.id)}
                          disabled={noStock}
                          className={`
                            min-w-[4.5rem] px-4 h-11 rounded-lg border-2 font-bold text-sm transition-all
                            ${isSelected ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-rose-50 text-orange-700 shadow-sm' :
                              noStock ? 'border-slate-100 text-slate-300 line-through cursor-not-allowed' :
                              'border-slate-200 hover:border-slate-400 text-slate-700 bg-white'}
                          `}
                        >
                          {v.name || `${v.attributes?.widthCm || '?'}×${v.attributes?.lengthCm || '?'}cm`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cantidad */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Cantidad</div>
                <div className="flex items-center gap-1 w-fit rounded-lg border-2 border-slate-200">
                  <Button size="icon" variant="ghost" onClick={() => setQty(q => Math.max(1, q - 1))} className="h-11 w-11">
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-12 text-center font-mono font-bold text-slate-900 text-lg">{qty}</span>
                  <Button size="icon" variant="ghost" onClick={() => setQty(q => q + 1)} className="h-11 w-11">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Stock indicator */}
              <div className="flex items-center gap-2 text-xs">
                {!stockLoaded ? (
                  <>
                    <Loader2 className="h-3 w-3 text-orange-500 animate-spin" />
                    <span className="font-semibold text-slate-500">Verificando stock…</span>
                  </>
                ) : (
                  <>
                    <span className={`inline-flex h-2 w-2 rounded-full ${outOfStock ? 'bg-rose-500' : stockAvailable < 5 ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
                    <span className={`font-semibold ${outOfStock ? 'text-rose-600' : stockAvailable < 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {outOfStock
                        ? 'Sin stock disponible'
                        : stockAvailable < 5
                        ? `¡Últimas ${stockAvailable} unidades!`
                        : `${stockAvailable} unidades disponibles · listo para despacho`}
                    </span>
                  </>
                )}
              </div>

              {/* CTA principal */}
              <div className="pt-2 space-y-2">
                <Button
                  onClick={() => handleAdd(false)}
                  disabled={outOfStock}
                  size="lg"
                  className="w-full h-13 text-base bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 disabled:opacity-50 font-bold shadow-lg shadow-orange-500/20"
                >
                  <ShoppingBag className="h-5 w-5 mr-2" />
                  {outOfStock ? 'Sin stock' : `Agregar al carrito · ${formatCLP(price * qty)}`}
                </Button>
                <Button
                  onClick={() => handleAdd(true)}
                  disabled={outOfStock}
                  variant="outline"
                  size="lg"
                  className="w-full h-13 text-base border-2 border-slate-300 hover:border-orange-500 hover:text-orange-600 font-bold"
                >
                  Comprar ahora <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

              {/* WhatsApp */}
              <a
                href={BUSINESS.whatsapp.url(`Hola! Me interesa "${product.name}" · ${selectedVariant?.name || ''}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-center gap-2 w-full h-11 border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50 rounded-lg font-semibold text-sm transition-all"
              >
                <MessageCircle className="h-4 w-4" />
                ¿Dudas? Escríbenos por WhatsApp
              </a>
            </div>

            {/* Trust badges compactos */}
            <div className="mt-6 grid grid-cols-2 gap-2 pt-5 border-t border-slate-100">
              {TRUST_BADGES.map(t => (
                <div key={t.text} className="flex items-center gap-2 text-xs text-slate-600">
                  <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <t.icon className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <span className="font-medium">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-16 border-y border-slate-100">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-semibold mb-3">
              <Sparkles className="h-3 w-3" />¿Por qué elegirnos?
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Impresión DTF profesional en Chile</h2>
            <p className="mt-3 text-slate-600">Somos taller propio: no revendemos, imprimimos con máquinas Epson y Prestige de última generación.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Palette, title: 'Colores vivos y duraderos', desc: 'Tintas Epson genuinas de alta pigmentación. Resistentes a lavado y sol.' },
              { icon: Award,   title: '300 DPI reales', desc: 'Cada estampado sale con la máxima nitidez. Validamos DPI antes de imprimir.' },
              { icon: Truck,   title: 'Despachos a todo Chile', desc: 'Retiro en Quilpué o envío a domicilio en 24-72h con seguimiento.' },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-sm">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mt-4 font-bold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RELATED PRODUCTS */}
      {related.length > 0 && (
        <section className="container py-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest font-bold text-orange-600 mb-1">También te puede interesar</div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Productos relacionados</h2>
            </div>
            <Link href="/tienda" className="text-sm font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">
              Ver catálogo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => (
              <Link key={p.id} href={`/producto/${p.slug}`}
                className="group rounded-2xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-md transition-all overflow-hidden">
                <div className="aspect-square bg-slate-100 relative overflow-hidden">
                  {p.images?.[0] ? (
                    <img
                      src={thumbnailUrl(p.images[0], 200)}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Package className="h-16 w-16 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">{CATEGORY_LABELS[p.category] || p.category}</div>
                  <div className="mt-1 font-semibold text-slate-900 text-sm truncate">{p.name}</div>
                  <div className="mt-1.5 font-mono font-bold text-orange-600">{formatCLP(p.basePrice)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="container pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-orange-950 to-rose-950 p-8 md:p-12 text-white text-center shadow-2xl">
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="relative">
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight">¿Necesitas algo personalizado?</h3>
            <p className="mt-2 text-white/80">Cotizamos gratis diseños a medida, pedidos mayoristas y estampados especiales.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/contacto" className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-900 hover:bg-white/95 font-bold px-5 py-2.5 shadow-lg transition-all hover:scale-105">
                Contactar
              </Link>
              <a href={BUSINESS.whatsapp.url('Hola! Quiero cotizar un pedido personalizado')} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 transition-colors">
                <MessageCircle className="h-4 w-4" />WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
