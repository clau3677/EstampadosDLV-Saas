const nextConfig = {
  output: 'standalone',
  // Renamed from experimental.serverComponentsExternalPackages in Next 15
  serverExternalPackages: [
    'mongodb', 'sharp',
    // Baileys y WebSocket → mantener como externals para que use los binarios nativos
    // (`bufferutil`, `utf-8-validate`) sin que webpack los rompa
    '@whiskeysockets/baileys',
    'ws',
    'bufferutil',
    'utf-8-validate',
    'pino',
    'pino-pretty',
    // googleapis es muy pesado (~8MB) y solo se usa en server-side API routes
    'googleapis',
  ],
  // Optimizaciones de imports de paquetes pesados: Next 15 hace tree-shaking
  // agresivo de éstos, reduciendo tiempo de compilación en dev (~30%) y
  // tamaño del bundle en producción.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-slot',
      '@radix-ui/react-separator',
      '@radix-ui/react-label',
    ],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  webpack(config, { dev, isServer }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    // Konva intenta cargar node-canvas en SSR; lo aliaseamos a false para que use
    // solamente la implementación del browser (Konva ya trae fallback).
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false, encoding: false };
    if (isServer) {
      // Excluir konva/react-konva y three.js del bundle server-side por completo
      config.externals = [...(config.externals || []), 'konva', 'react-konva', 'canvas', 'three'];
    }
    // Client-side: prevent googleapis from bundling into client chunks
    // This module is only used server-side (API routes) and weighs ~8MB
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'googleapis': false,
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  // Consolidación SEO (ago-2026): una sola URL canónica para DTF textil.
  // Las otras dos variantes débiles redirigen 301 para no dividir señales.
  async redirects() {
    return [
      {
        source: '/servicios/impresion-dtf-textil-chile',
        destination: '/servicios/dtf-textil',
        permanent: true,
      },
      {
        source: '/servicios/dtf-textil-impresion-poleras-chile',
        destination: '/servicios/dtf-textil',
        permanent: true,
      },
      {
        source: '/servicios/servicio-estampado-dtf-textil',
        destination: '/servicios/dtf-textil',
        permanent: true,
      },
    ];
  },
  async headers() {
    // Seguridad endurecida (auditoría jul-2026):
    //  - SAMEORIGIN / frame-ancestors 'self' → bloquea clickjacking sobre POS y admin.
    //  - CORS restringido al dominio propio salvo override explícito por env CORS_ORIGINS.
    //  - Permissions-Policy → deshabilita APIs del navegador no utilizadas.
    // Para entornos de preview que necesiten iframe, definir ALLOW_IFRAME_EMBED=true.
    const allowEmbed = process.env.ALLOW_IFRAME_EMBED === 'true';
    const corsOrigins = process.env.CORS_ORIGINS
      || 'https://estampadosdlv.com,https://www.estampadosdlv.com';
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: allowEmbed ? "ALLOWALL" : "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: allowEmbed ? "frame-ancestors *;" : "frame-ancestors 'self';" },
          { key: "Access-Control-Allow-Origin", value: corsOrigins },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // API routes — no cache nunca
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
        ],
      },
      // Páginas del admin — no cache (datos dinámicos)
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // Fuentes y CSS de Next.js — cache largo
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Imágenes subidas — cache mediano (se actualizan)
      {
        source: "/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate" },
        ],
      },
      // Imágenes de proveedor — cache largo (no cambian)
      {
        source: "/cottonext/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate" },
        ],
      },
      {
        source: "/treck/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
