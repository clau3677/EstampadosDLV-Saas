// =============================================================================
// /tienda — Server Component (SSR/ISR) — Auditoría jul-2026
// -----------------------------------------------------------------------------
// Antes: página 100% client-side → Google indexaba HTML sin productos.
// Ahora: los productos se consultan en servidor y llegan renderizados en el
// HTML inicial (fallbackData de SWR), con revalidación cliente transparente.
// Incluye metadatos OpenGraph + JSON-LD (Store + ItemList) para rich results.
// =============================================================================
import { Suspense } from 'react';
import { getPublicProducts, getProductCategories } from '@/lib/server/store-data';
import { BUSINESS } from '@/lib/constants/business';
import TiendaClient from './tienda-client';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Tienda · Estampados DLV — Impresión DTF profesional en Chile',
  description:
    'Compra DTF por metro, poleras, polerones, gorras y merchandising personalizado. ' +
    'Impresión DTF y DTF UV a 300 DPI con despacho 24-48h a todo Chile desde Quilpué.',
  alternates: { canonical: `${BASE}/tienda` },
  openGraph: {
    title: 'Tienda · Estampados DLV — Impresión DTF profesional en Chile',
    description: 'DTF por metro, prendas estampadas y merchandising con entrega 24-48h a todo Chile.',
    url: `${BASE}/tienda`,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
    images: [
      {
        url: `${BASE}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Estampados DLV - Tienda de impresión DTF profesional en Chile',
      },
    ],
  },
};

function buildJsonLd(products) {
  // Política de envío compartida
  const shippingDetails = {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: '3490', currency: 'CLP' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CL' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
    },
  };

  // Política de devolución compartida
  const returnPolicy = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'CL',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 10,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/FreeReturn',
  };

  const store = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: BUSINESS.name,
    description: 'Taller de impresión DTF y DTF UV profesional en Chile.',
    url: `${BASE}/tienda`,
    telephone: BUSINESS.phone.intl,
    email: BUSINESS.email.primary,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${BUSINESS.address.street}, ${BUSINESS.address.unit}`,
      addressLocality: BUSINESS.address.city,
      addressRegion: BUSINESS.address.region,
      addressCountry: BUSINESS.address.countryCode,
    },
    hasMerchantReturnPolicy: returnPolicy,
    shippingDetails,
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: (products || []).slice(0, 30).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        description: p.description || undefined,
        image: p.images?.[0] ? (p.images[0].startsWith('http') ? p.images[0] : `${BASE}${p.images[0]}`) : undefined,
        url: `${BASE}/producto/${p.slug}`,
        offers: {
          '@type': 'Offer',
          price: p.basePrice || p.variants?.[0]?.price || 0,
          priceCurrency: 'CLP',
          availability: 'https://schema.org/InStock',
          validFrom: new Date().toISOString().split('T')[0],
          shippingDetails,
          hasMerchantReturnPolicy: returnPolicy,
        },
      },
    })),
  };
  return [store, itemList];
}

export default async function TiendaPage() {
  const [products, categories] = await Promise.all([
    getPublicProducts(),
    getProductCategories(),
  ]);
  const jsonLd = buildJsonLd(products);

  return (
    <>
      {jsonLd.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}
      <Suspense fallback={null}>
        <TiendaClient initialProducts={products} initialCategories={categories} />
      </Suspense>
    </>
  );
}
