// SEO: robots.txt dinámico
// Permite indexación de páginas públicas, bloquea rutas admin y privadas.
// IMPORTANTE: Googlebot y Googlebot-Image deben acceder a /uploads/ para ver las imágenes de productos
export default function robots() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: [
      // Regla para todos los bots en general
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
          // Archivos privados (pero NO /uploads/ que es público)
          '/hot_folders/',
        ],
      },
      // Googlebot: acceso completo excepto rutas admin
      {
        userAgent: 'Googlebot',
        allow: ['/', '/uploads/'],
        disallow: [
          '/api/',
          '/admin',
          '/kanban',
          '/pos',
          '/inventario',
          '/configuracion',
          '/pre-prensa',
          '/mantenimiento',
          '/reportes',
          '/clientes',
        ],
      },
      // Googlebot-Image: acceso a todo para indexar imágenes de productos
      {
        userAgent: 'Googlebot-Image',
        allow: '/',
      },
      // Bots de IA: restringir acceso a datos sensibles
      {
        userAgent: 'GPTBot',
        disallow: [
          '/api/',
          '/admin',
          '/hot_folders/',
        ],
      },
      {
        userAgent: 'ClaudeBot',
        disallow: [
          '/api/',
          '/admin',
          '/hot_folders/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
