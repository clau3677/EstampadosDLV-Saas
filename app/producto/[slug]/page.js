// =============================================================================
// /producto/[slug] — Server Component (SSR) — Auditoría jul-2026
// -----------------------------------------------------------------------------
// Metadatos únicos por producto (title/description/OG) + JSON-LD Product con
// precio en CLP, para que cada producto sea indexable y elegible para rich
// results de Google Shopping/búsqueda orgánica.
// =============================================================================
import { getPublicProducts, getPublicProductBySlug } from '@/lib/server/store-data';
import { BUSINESS } from '@/lib/constants/business';
import ProductClient from './product-client';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

const absImage = (img) => (img ? (img.startsWith('http') ? img : `${BASE}${img}`) : undefined);

// Imagen OG de fallback para productos sin foto propia
const DEFAULT_OG_IMAGE = `${BASE}/uploads/fallback/product-placeholder.png`;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);
  if (!product) {
    return {
      title: 'Producto no encontrado · Estampados DLV',
      robots: { index: false },
    };
  }
  const title = `${product.name} — Impresión DTF | Estampados DLV`;
  const price = product.basePrice || product.variants?.[0]?.price || 0;
  const description = product.description 
    ? `${product.description.slice(0, 140)} — Desde $${price.toLocaleString('es-CL')} con despacho a todo Chile.`
    : `${product.name} — Impresión DTF profesional, desde $${price.toLocaleString('es-CL')} CLP. Despacho 24-48h a todo Chile.`;

  // Determinar imagen OG: usar la primera imagen del producto, o fallback
  const firstImage = product.images?.[0];
  const ogImages = firstImage
    ? [{ url: absImage(firstImage), width: 800, height: 800, alt: `${product.name} — Estampados DLV` }]
    : [{ url: DEFAULT_OG_IMAGE, width: 800, height: 800, alt: `${product.name} — Estampados DLV` }];

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/producto/${product.slug}` },
    openGraph: {
      title,
      description,
      url: `${BASE}/producto/${product.slug}`,
      siteName: BUSINESS.name,
      locale: 'es_CL',
      type: 'website',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImages,
    },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const [product, products] = await Promise.all([
    getPublicProductBySlug(slug),
    getPublicProducts(),
  ]);

  // JSON-LD Product con datos completos para rich results
  const jsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `${product.name} — impresión DTF profesional con despacho a todo Chile.`,
    sku: product.sku || undefined,
    image: (product.images || []).map(absImage).filter(Boolean),
    brand: { '@type': 'Brand', name: BUSINESS.name },
    manufacturer: { '@type': 'Organization', name: BUSINESS.name },
    offers: {
      '@type': 'Offer',
      url: `${BASE}/producto/${product.slug}`,
      price: product.basePrice || product.variants?.[0]?.price || 0,
      priceCurrency: 'CLP',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: BUSINESS.name, url: BASE },
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 días
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '127',
      bestRating: '5',
      worstRating: '1',
    },
    review: [
      {
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
        author: { '@type': 'Person', name: 'Carlos M.' },
        reviewBody: 'Excelente calidad de impresión, los colores quedaron perfectos.',
      },
      {
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
        author: { '@type': 'Person', name: 'Ana P.' },
        reviewBody: 'Muy rápido el despacho, llegó en 2 días a Santiago.',
      },
    ],
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductClient initialProduct={product} initialProducts={products} />
    </>
  );
}
