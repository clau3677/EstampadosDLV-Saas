'use client';

import Link from 'next/link';
import { Package, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCLP } from '@/lib/format';

const CATEGORY_LABELS = {
  apparel:   'Prenda',
  dtf_meter: 'DTF por metro',
  accessory: 'Accesorio',
  other:     'Otro',
};

const CATEGORY_ICONS = {
  apparel:   Package,
  dtf_meter: Layers,
  accessory: Package,
  other:     Package,
};

const PLACEHOLDER_GRADIENTS = {
  apparel:   'from-slate-100 to-slate-200',
  dtf_meter: 'from-orange-50 to-rose-100',
  accessory: 'from-emerald-50 to-teal-100',
  other:     'from-blue-50 to-indigo-100',
};

export function ProductCard({ product }) {
  const hasImage = product.images?.length > 0;
  const mainImage = product.images?.[0];
  const Icon = CATEGORY_ICONS[product.category] || Package;
  const priceRange = product.variants?.length > 1
    ? product.variants.reduce((min, v) => Math.min(min, v.price), Infinity)
    : product.basePrice;

  return (
    <Link href={`/producto/${product.slug}`} className="group">
      <article className="flex flex-col h-full rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-lg transition-all overflow-hidden">
        <div className="relative aspect-[4/5] overflow-hidden">
          {hasImage ? (
            <img
              src={mainImage}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${PLACEHOLDER_GRADIENTS[product.category] || PLACEHOLDER_GRADIENTS.other} flex items-center justify-center`}>
              <Icon className="h-16 w-16 text-slate-400/40" />
            </div>
          )}
          <Badge variant="secondary" className="absolute top-3 left-3 bg-white/95 text-slate-700 border border-slate-200 backdrop-blur">
            {CATEGORY_LABELS[product.category] || product.category}
          </Badge>
        </div>

        <div className="flex-1 p-4">
          <h3 className="font-semibold text-slate-900 group-hover:text-orange-600 transition-colors leading-tight">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{product.description}</p>
          )}
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900 font-mono">{formatCLP(priceRange || product.basePrice)}</div>
              {product.variants?.length > 1 && (
                <div className="text-[10px] text-slate-500">{product.variants.length} variantes</div>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default ProductCard;
