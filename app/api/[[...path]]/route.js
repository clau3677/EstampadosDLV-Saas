// ============================================================================
// API monolithic router (thin) — despacha por dominio a módulos en /app/lib/api/*.js
// Todos los endpoints siguen expuestos idénticos bajo /api/* (contrato inmutable).
// ============================================================================
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { cors } from '@/lib/api/_helpers';

// Domain handlers — cada uno inspecciona la ruta y devuelve NextResponse o null si no aplica
import handleDashboard    from '@/lib/api/dashboard';
import handleSeed         from '@/lib/api/seed';
import handleProducts     from '@/lib/api/products';
import handleInventory    from '@/lib/api/inventory';
import handleOrders       from '@/lib/api/orders';
import handleUploads      from '@/lib/api/uploads';
import handleGangSheets   from '@/lib/api/gang-sheets';
import handleProduction   from '@/lib/api/production';
import handleTaxonomies   from '@/lib/api/taxonomies';
import handleLandings     from '@/lib/api/landings';
import handlePrinters     from '@/lib/api/printers';
import handlePos          from '@/lib/api/pos';
import handleTickets      from '@/lib/api/tickets';
import handleUsers        from '@/lib/api/users';

// Orden importa poco (cada handler filtra por su(s) ruta(s)), pero ponemos primero los más
// usados para tener latencia consistente en producción.
const HANDLERS = [
  handleDashboard,
  handleProducts,
  handleInventory,
  handleOrders,
  handleProduction,
  handleGangSheets,
  handleUploads,
  handleTaxonomies,
  handleLandings,
  handlePrinters,
  handlePos,
  handleTickets,
  handleUsers,
  handleSeed,         // pesado, poco frecuente
];

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }));
}

async function handle(request, { params }) {
  const { path: routePath = [] } = await params;
  const route = '/' + routePath.join('/');
  const method = request.method;

  try {
    const db = await getDb();
    const ctx = { request, method, route, db };

    for (const h of HANDLERS) {
      const res = await h(ctx);
      if (res) return res;
    }

    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }));

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('API Error:', route, method, error);
    return cors(NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 }));
  }
}

export const GET    = handle;
export const POST   = handle;
export const PUT    = handle;
export const DELETE = handle;
export const PATCH  = handle;
