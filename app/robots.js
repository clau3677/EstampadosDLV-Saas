// SEO: robots.txt dinámico
// Bloquea rutas admin para que Google no las indexe.

export default function robots() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/kanban',
          '/pos',
          '/inventario',
          '/configuracion',
          '/landings',
          '/pre-prensa',
          '/mantenimiento',
          '/reportes',
          '/clientes',
          '/uploads/',  // imágenes de diseños privados
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
