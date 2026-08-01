// SEO: robots.txt dinámico
// Permite indexación de páginas públicas, bloquea rutas admin y privadas.

export default function robots() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Rutas administrativas
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
          '/admin',
          // Rutas de autenticación
          '/login',
          '/registro',
          '/mi-cuenta',
          '/checkout',
          // Archivos privados
          '/uploads/',
          '/hot_folders/',
        ],
      },
      {
        userAgent: 'GPTBot',
        disallow: [
          '/api/',
          '/admin',
          '/uploads/',
        ],
      },
      {
        userAgent: 'ClaudeBot',
        disallow: [
          '/api/',
          '/admin',
          '/uploads/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
