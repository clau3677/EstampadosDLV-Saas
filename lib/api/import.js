// /app/lib/api/import.js
// -------------------------------------------------------------------------
// Despachador delgado de importadores de catálogo por proveedor.
// -------------------------------------------------------------------------
//   /api/import/cottonext/*   → ./import/cottonext.js
//   /api/import/textilryu/*   → ./import/textilryu.js
//   /api/import/treck/*       → ./import/treck.js
// -------------------------------------------------------------------------
// Cada handler retorna:
//   • Response (si la ruta coincide y se procesó)
//   • null    (si la ruta no coincide → probar siguiente handler)
//
// Los helpers comunes (buildProductDoc, syncInventoryForVariants, applyMarkup,
// factories de refresh-prices/history/imported/sync-inventory/cron) están
// centralizados en ./import/_shared.js para máxima reutilización.
// -------------------------------------------------------------------------
import handleCottonext from './import/cottonext';
import handleTextilRyu from './import/textilryu';
import handleTreck     from './import/treck';

export default async function handleImport(ctx) {
  const { route } = ctx;
  if (!route.startsWith('/import')) return null;

  // Intentar cada handler en orden. El primero que matchee gana.
  const chain = [handleCottonext, handleTextilRyu, handleTreck];
  for (const fn of chain) {
    const res = await fn(ctx);
    if (res) return res;
  }

  return null;
}
