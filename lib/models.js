/**
 * =============================================================================
 *  ESTAMPADOS DLV - ESQUEMA DE BASE DE DATOS (MongoDB Community Edition)
 * =============================================================================
 *  Este archivo define TODAS las colecciones del sistema.
 *  MongoDB Community es 100% gratis y open source - se instala en el VPS con:
 *    docker run -d --name mongo -p 27017:27017 -v mongo-data:/data/db mongo:7
 *
 *  Convenciones:
 *   - Todos los IDs son UUID v4 (no ObjectId) para portabilidad.
 *   - Todos los montos en CLP (pesos chilenos, sin decimales).
 *   - Todas las fechas en ISO 8601 (UTC).
 *   - Ancho útil máximo de lienzos DTF respetado por hardware:
 *        Epson R1390 = 31cm | Prestige R2 Pro = 33cm | DTF UV = variable
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Nombres de colecciones (usar SIEMPRE estas constantes en el backend)
// -----------------------------------------------------------------------------
export const COLLECTIONS = {
  USERS: 'users',
  CUSTOMERS: 'customers',                     // CRM: contactos unificados web + POS + WhatsApp
  PRODUCTS: 'products',                       // catálogo comercial
  COMMERCIAL_STOCK: 'commercial_stock',       // inventario 1: prendas, DTF x metro
  PRODUCTION_SUPPLIES: 'production_supplies', // inventario 2: film, tintas, poliamida
  ORDERS: 'orders',
  ORDER_ITEMS: 'order_items',
  GANG_SHEETS: 'gang_sheets',
  PRODUCTION_QUEUE: 'production_queue',
  POS_SESSIONS: 'pos_sessions',
  STOCK_MOVEMENTS: 'stock_movements',
  MAINTENANCE_LOGS: 'maintenance_logs',
  PRINTERS: 'printers',
  TAXONOMIES: 'taxonomies',                   // categorías, tipos, unidades, proveedores (editables)
  LANDING_PAGES: 'landing_pages',             // páginas SEO locales (/servicios/[slug])
  PAYMENT_TRANSACTIONS: 'payment_transactions', // registro de transacciones WebPay / MP
};

// -----------------------------------------------------------------------------
// Enums (constantes de dominio)
// -----------------------------------------------------------------------------
export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  CUSTOMER: 'customer',
};

export const PRINTERS = {
  EPSON_R1390: 'epson_r1390',       // DTF Textil - lienzo máx 31 cm
  PRESTIGE_R2_PRO: 'prestige_r2_pro', // DTF Textil - lienzo máx 33 cm
  DTF_UV: 'dtf_uv',                 // Rígidos - Blanco + Barniz
};

export const PRINTER_SPECS = {
  [PRINTERS.EPSON_R1390]: {
    name: 'Epson R1390',
    type: 'DTF Textil',
    maxWidthCm: 31,
    channels: ['C', 'M', 'Y', 'K', 'W'],
    useCase: 'Pedidos chicos',
  },
  [PRINTERS.PRESTIGE_R2_PRO]: {
    name: 'Prestige R2 Pro',
    type: 'DTF Textil',
    maxWidthCm: 33,
    channels: ['C', 'M', 'Y', 'K', 'W'],
    useCase: 'Pedidos grandes',
  },
  [PRINTERS.DTF_UV]: {
    name: 'DTF UV',
    type: 'Rígidos',
    maxWidthCm: 60,
    channels: ['C', 'M', 'Y', 'K', 'W', 'V'], // V = Varnish/Barniz
    useCase: 'Superficies rígidas (madera, acrílico, metal)',
  },
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  IN_PRODUCTION: 'in_production',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const PRODUCTION_STATUS = {
  NOT_STARTED: 'not_started',
  RECEIVED: 'received',
  PRINTING: 'printing',
  CURING: 'curing',
  READY: 'ready',
};

export const PRIORITY = { NORMAL: 'normal', EXPRESS: 'express' };

export const SALES_CHANNEL = { WEB: 'web', POS: 'pos', WHATSAPP: 'whatsapp' };

export const PAYMENT_METHOD = {
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  WEBPAY: 'webpay',
  MERCADOPAGO: 'mercadopago',
};

export const SUPPLY_TYPE = {
  FILM_PET: 'film_pet',      // en metros
  FILM_UV: 'film_uv',        // en metros
  INK_C: 'ink_cyan',         // ml
  INK_M: 'ink_magenta',      // ml
  INK_Y: 'ink_yellow',       // ml
  INK_K: 'ink_black',        // ml
  INK_W: 'ink_white',        // ml
  INK_V: 'ink_varnish',      // ml (solo UV)
  POLIAMIDA: 'poliamida',    // kg (polvo adhesivo termofusible)
};

export const PRODUCT_CATEGORY = {
  APPAREL: 'apparel',        // poleras, hoodies, etc.
  DTF_METER: 'dtf_meter',    // DTF por metro (fila corrida)
  ACCESSORY: 'accessory',    // parches, stickers pre-hechos
  OTHER: 'other',
};

// -----------------------------------------------------------------------------
// SCHEMAS (documentación de forma de cada documento)
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} User
 * @property {string} id                UUID v4
 * @property {string} email
 * @property {string} passwordHash      bcrypt hash
 * @property {'admin'|'operator'|'customer'} role
 * @property {string} fullName
 * @property {string} phone
 * @property {string} rut               RUT chileno formato 12.345.678-9
 * @property {Object} address           { street, comuna, city, region }
 * @property {Date}   createdAt
 * @property {Date?}  lastLoginAt
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} sku
 * @property {string} name
 * @property {string} slug              seo-friendly url
 * @property {'apparel'|'dtf_meter'|'accessory'|'other'} category
 * @property {string} subcategory
 * @property {string} description
 * @property {string[]} images
 * @property {number} basePrice         CLP
 * @property {number} cost              CLP
 * @property {ProductVariant[]} variants
 * @property {boolean} active
 * @property {Object} seoMeta           { title, description, keywords[] }
 * @property {Date}   createdAt
 * @property {Date}   updatedAt
 */

/**
 * @typedef {Object} ProductVariant
 * @property {string} id
 * @property {string} name              ej: "Talla M / Negro"
 * @property {string} sku
 * @property {number} price             CLP (puede diferir de basePrice)
 * @property {Object} attributes        { size, color, material, etc }
 */

/**
 * INVENTARIO 1 — Stock Comercial (prendas, DTF por metro pre-hecho)
 * @typedef {Object} CommercialStock
 * @property {string} id
 * @property {string} productId
 * @property {string} variantId
 * @property {number} quantity          disponible
 * @property {number} reservedQuantity  reservada en pedidos pagados no entregados
 * @property {string} location          ej: "Bodega Principal" / "Estante A3"
 * @property {number} minStockAlert     umbral para alerta
 * @property {Date}   updatedAt
 */

/**
 * INVENTARIO 2 — Insumos de Producción (film, tintas, poliamida)
 * Se descuenta AUTOMÁTICAMENTE por cada metro impreso.
 * @typedef {Object} ProductionSupply
 * @property {string} id
 * @property {string} code              ej: "INK-CYAN-001"
 * @property {string} name
 * @property {string} type              SUPPLY_TYPE
 * @property {'ml'|'meter'|'kg'|'unit'} unit
 * @property {number} currentQuantity
 * @property {number} minAlert
 * @property {number} cost              CLP por unidad
 * @property {string} supplier
 * @property {Date?}  lastRestockAt
 * @property {Date}   updatedAt
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} orderNumber       ej: "DLV-2025-000123"
 * @property {'web'|'pos'|'whatsapp'} channel
 * @property {string?} customerId       null si venta anónima en POS
 * @property {Object}  customerSnapshot { name, email, phone, rut } — congelado al crear
 * @property {string}  status           ORDER_STATUS
 * @property {string}  productionStatus PRODUCTION_STATUS (agregado del pedido)
 * @property {string}  priority         PRIORITY (express aplica recargo)
 * @property {number}  subtotal
 * @property {number}  discount
 * @property {number}  tax              IVA 19%
 * @property {number}  shipping
 * @property {number}  total
 * @property {string}  paymentMethod    PAYMENT_METHOD
 * @property {'pending'|'paid'|'refunded'} paymentStatus
 * @property {Object?} boleta           { number, url } — DTE SII
 * @property {'pickup'|'shipping'} deliveryMethod
 * @property {Object?} shippingAddress
 * @property {string}  notes
 * @property {Date}    createdAt
 * @property {Date?}   paidAt
 * @property {Date?}   deliveredAt
 */

/**
 * @typedef {Object} OrderItem
 * @property {string} id
 * @property {string} orderId
 * @property {'product'|'gang_sheet'} type
 * @property {string?} productId
 * @property {string?} variantId
 * @property {string?} gangSheetId
 * @property {string}  name
 * @property {number}  quantity
 * @property {number}  unitPrice
 * @property {number}  discount
 * @property {number}  totalPrice
 * @property {Object?} gangSheetSpec    { printerType, widthCm, lengthMm, designsCount }
 */

/**
 * Gang Sheet armado por el cliente en el editor visual
 * @typedef {Object} GangSheet
 * @property {string} id
 * @property {string?} orderId          null mientras es borrador
 * @property {string?} userId
 * @property {'dtf_textil'|'dtf_uv'} type
 * @property {string} printerTarget     PRINTERS - decidido por auto-routing
 * @property {number} canvasWidthCm     ≤ 31 (Epson) o ≤ 33 (Prestige) o UV
 * @property {number} canvasLengthMm    largo utilizado (base de cotización)
 * @property {GangDesign[]} designs
 * @property {string?} exportedPngUrl
 * @property {string?} exportedTiffUrl
 * @property {'draft'|'exported'|'sent_to_hotfolder'} exportStatus
 * @property {string?} hotFolderPath
 * @property {Date}    createdAt
 * @property {Date?}   exportedAt
 */

/**
 * @typedef {Object} GangDesign
 * @property {string} id
 * @property {string} imageUrl
 * @property {number} xMm
 * @property {number} yMm
 * @property {number} widthMm
 * @property {number} heightMm
 * @property {number} rotation          grados
 * @property {number} dpi               calculado desde imagen original
 * @property {string[]} warnings        ej: ["low_dpi", "off_canvas"]
 */

/**
 * Cola de producción por impresora (Kanban)
 * @typedef {Object} ProductionQueueItem
 * @property {string} id
 * @property {string} orderId
 * @property {string} orderItemId
 * @property {string} printer           PRINTERS
 * @property {string} status            PRODUCTION_STATUS
 * @property {string} priority          PRIORITY
 * @property {string?} assignedOperatorId
 * @property {Date?}   startedAt
 * @property {Date?}   completedAt
 * @property {string}  fileUrl
 * @property {number}  lengthMm
 * @property {Object}  inkConsumption   { c, m, y, k, w, v }
 * @property {number}  filmConsumption  metros
 * @property {string}  notes
 */

/**
 * @typedef {Object} PosSession
 * @property {string} id
 * @property {string} operatorId
 * @property {Date}   openedAt
 * @property {Date?}  closedAt
 * @property {number} openingCash
 * @property {number?} closingCash
 * @property {number} cashSales
 * @property {number} cardSales
 * @property {number} totalSales
 * @property {'open'|'closed'} status
 */

/**
 * Auditoría de TODO movimiento de stock (comercial + insumos)
 * @typedef {Object} StockMovement
 * @property {string} id
 * @property {'commercial_in'|'commercial_out'|'supply_in'|'supply_out'|'waste'|'adjustment'} type
 * @property {'order'|'production'|'restock'|'manual'} reference
 * @property {string} referenceId
 * @property {'product_variant'|'supply'} itemType
 * @property {string} itemId
 * @property {number} quantity          positivo o negativo
 * @property {number} balanceAfter
 * @property {string} operatorId
 * @property {string} reason
 * @property {Date}   createdAt
 */

/**
 * @typedef {Object} MaintenanceLog
 * @property {string} id
 * @property {string} printer
 * @property {'head_cleaning'|'nozzle_check'|'ink_replacement'|'head_replacement'|'other'} type
 * @property {string} performedBy
 * @property {Date}   performedAt
 * @property {string} notes
 * @property {number} cost
 */

// -----------------------------------------------------------------------------
// Helper para stripear _id de Mongo antes de retornar al cliente
// -----------------------------------------------------------------------------
export const strip = (doc) => {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(({ _id, ...rest }) => rest);
  const { _id, ...rest } = doc;
  return rest;
};
