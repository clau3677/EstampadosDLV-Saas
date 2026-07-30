const nextConfig = {
  output: 'standalone',
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
  ],
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
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
