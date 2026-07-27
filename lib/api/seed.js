// POST /api/seed — carga datos demo chilenos (idempotente: borra + inserta)
import { v4 as uuidv4 } from 'uuid';
import {
  COLLECTIONS, PRINTERS, PRINTER_SPECS, ROLES, SUPPLY_TYPE,
  PRODUCT_CATEGORY, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY,
  SALES_CHANNEL, PAYMENT_METHOD,
} from '@/lib/models';
import { json } from './_helpers';
import { hashPassword } from '@/lib/auth/password';

export default async function handleSeed(ctx) {
  const { method, route, db } = ctx;
  if (!(route === '/seed' && method === 'POST')) return null;

  // Limpiar colecciones (para permitir re-seed idempotente en dev)
  for (const c of Object.values(COLLECTIONS)) {
    await db.collection(c).deleteMany({});
  }

  const now = new Date();

  // USERS — con passwords bcrypt reales para poder loguearse.
  //   Admin:    estampadosdlv@gmail.com / EstampadosDLV2025!
  //   Operator: operador@estampadosdlv.cl / operador123
  //   Cliente:  cliente@example.cl / cliente123
  const adminId = uuidv4();
  const operatorId = uuidv4();
  const customerId = uuidv4();
  const [adminHash, operatorHash, customerHash] = await Promise.all([
    hashPassword('EstampadosDLV2025!'),
    hashPassword('operador123'),
    hashPassword('cliente123'),
  ]);
  await db.collection(COLLECTIONS.USERS).insertMany([
    { id: adminId, email: 'estampadosdlv@gmail.com', passwordHash: adminHash, role: ROLES.ADMIN,
      fullName: 'Diego López', phone: '+56912345678', rut: '12.345.678-9',
      address: { street: 'Galleguillos 1870', comuna: 'Quilpué', city: 'Quilpué', region: 'Valparaíso' },
      active: true, createdAt: now, lastLoginAt: now },
    { id: operatorId, email: 'operador@estampadosdlv.cl', passwordHash: operatorHash, role: ROLES.OPERATOR,
      fullName: 'Carla Muñoz', phone: '+56987654321', rut: '15.678.234-K',
      address: { street: 'Los Alerces 456', comuna: 'Maipú', city: 'Santiago', region: 'RM' },
      active: true, createdAt: now, lastLoginAt: now },
    { id: customerId, email: 'cliente@example.cl', passwordHash: customerHash, role: ROLES.CUSTOMER,
      fullName: 'Javier Rojas', phone: '+56911223344', rut: '18.222.333-1',
      address: { street: 'Av. Providencia 999', comuna: 'Providencia', city: 'Santiago', region: 'RM' },
      active: true, createdAt: now, lastLoginAt: null },
  ]);

  // PRODUCTS
  const products = [
    { id: uuidv4(), sku: 'POL-CLA-NEG', name: 'Polera Algodón Clásica', slug: 'polera-algodon-clasica',
      category: PRODUCT_CATEGORY.APPAREL, subcategory: 'poleras',
      description: 'Polera 100% algodón peinado 180gr, ideal para DTF. Corte unisex, terminaciones premium.',
      images: [
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwxfHxibGFjayUyMHQtc2hpcnR8ZW58MHx8fHwxNzg1MDI3ODE2fDA&ixlib=rb-4.1.0&q=85',
        'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwyfHxibGFjayUyMHQtc2hpcnR8ZW58MHx8fHwxNzg1MDI3ODE2fDA&ixlib=rb-4.1.0&q=85',
      ],
      basePrice: 5990, cost: 2500,
      variants: [
        { id: uuidv4(), name: 'Talla S / Negro',  sku: 'POL-CLA-NEG-S', price: 5990, attributes: { size: 'S', color: 'Negro' } },
        { id: uuidv4(), name: 'Talla M / Negro',  sku: 'POL-CLA-NEG-M', price: 5990, attributes: { size: 'M', color: 'Negro' } },
        { id: uuidv4(), name: 'Talla L / Negro',  sku: 'POL-CLA-NEG-L', price: 5990, attributes: { size: 'L', color: 'Negro' } },
        { id: uuidv4(), name: 'Talla M / Blanco', sku: 'POL-CLA-BLA-M', price: 5990, attributes: { size: 'M', color: 'Blanco' } },
      ],
      active: true, seoMeta: { title: 'Polera Algodón Clásica', description: 'Ideal para DTF', keywords: ['polera','dtf','algodón'] },
      createdAt: now, updatedAt: now },
    { id: uuidv4(), sku: 'DTF-MET-31', name: 'DTF Textil por Metro · 31 cm', slug: 'dtf-textil-por-metro-31',
      category: PRODUCT_CATEGORY.DTF_METER, subcategory: 'dtf_textil',
      description: 'DTF Textil impreso por metro lineal, ancho útil 31 cm (Epson R1390). Perfecto para pedidos chicos.',
      images: [
        'https://images.unsplash.com/photo-1503694978374-8a2fa686963a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHxwcmludGluZyUyMHJvbGx8ZW58MHx8fHwxNzg1MDI3ODI1fDA&ixlib=rb-4.1.0&q=85',
      ],
      basePrice: 8990, cost: 3200,
      variants: [{ id: uuidv4(), name: 'x metro', sku: 'DTF-MET-31-1M', price: 8990, attributes: { width_cm: 31 } }],
      active: true, seoMeta: { title: 'DTF Textil por Metro 31cm', description: 'Ancho 31cm', keywords: ['dtf','metro'] },
      createdAt: now, updatedAt: now },
    { id: uuidv4(), sku: 'DTF-MET-33', name: 'DTF Textil por Metro · 33 cm', slug: 'dtf-textil-por-metro-33',
      category: PRODUCT_CATEGORY.DTF_METER, subcategory: 'dtf_textil',
      description: 'DTF Textil impreso por metro lineal, ancho útil 33 cm (Prestige R2 Pro). Para pedidos grandes.',
      images: [
        'https://images.pexels.com/photos/3724811/pexels-photo-3724811.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
      ],
      basePrice: 9990, cost: 3600,
      variants: [{ id: uuidv4(), name: 'x metro', sku: 'DTF-MET-33-1M', price: 9990, attributes: { width_cm: 33 } }],
      active: true, seoMeta: { title: 'DTF Textil por Metro 33cm', description: 'Ancho 33cm', keywords: ['dtf','metro'] },
      createdAt: now, updatedAt: now },
    { id: uuidv4(), sku: 'HOO-PREM-NEG', name: 'Poleron con Capucha Premium', slug: 'poleron-capucha-premium',
      category: PRODUCT_CATEGORY.APPAREL, subcategory: 'hoodies',
      description: 'Poleron premium 380gr con felpa interior. Corte oversize, ideal para invierno chileno.',
      images: [
        'https://images.unsplash.com/photo-1680292783974-a9a336c10366?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHxibGFjayUyMGhvb2RpZXxlbnwwfHx8fDE3ODUwMjc4MTZ8MA&ixlib=rb-4.1.0&q=85',
        'https://images.pexels.com/photos/28701960/pexels-photo-28701960.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
      ],
      basePrice: 19990, cost: 9000,
      variants: [
        { id: uuidv4(), name: 'Talla M / Negro', sku: 'HOO-PREM-NEG-M', price: 19990, attributes: { size: 'M', color: 'Negro' } },
        { id: uuidv4(), name: 'Talla L / Negro', sku: 'HOO-PREM-NEG-L', price: 19990, attributes: { size: 'L', color: 'Negro' } },
      ],
      active: true, seoMeta: { title: 'Poleron Premium', description: 'Poleron 380gr', keywords: ['poleron','hoodie'] },
      createdAt: now, updatedAt: now },
  ];
  await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);

  // COMMERCIAL STOCK
  const commercialStock = [];
  for (const p of products) {
    for (const v of p.variants) {
      commercialStock.push({
        id: uuidv4(), productId: p.id, variantId: v.id,
        quantity: Math.floor(Math.random() * 40) + 5,
        reservedQuantity: 0, location: 'Bodega Principal', minStockAlert: 5, updatedAt: now,
      });
    }
  }
  await db.collection(COLLECTIONS.COMMERCIAL_STOCK).insertMany(commercialStock);

  // PRODUCTION SUPPLIES
  const supplies = [
    { id: uuidv4(), code: 'FILM-PET-001',   name: 'Film PET DTF Textil',    type: SUPPLY_TYPE.FILM_PET, unit: 'meter', currentQuantity: 120, minAlert: 30, cost: 850,  supplier: 'DTF Chile SPA', lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'FILM-UV-001',    name: 'Film DTF UV Adhesivo',   type: SUPPLY_TYPE.FILM_UV,  unit: 'meter', currentQuantity: 60,  minAlert: 15, cost: 1400, supplier: 'UV Supplies',   lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-CMYK-C',     name: 'Tinta DTF Cyan 1L',       type: SUPPLY_TYPE.INK_C,   unit: 'ml',    currentQuantity: 800, minAlert: 250, cost: 45,   supplier: 'InkPro Chile',  lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-CMYK-M',     name: 'Tinta DTF Magenta 1L',    type: SUPPLY_TYPE.INK_M,   unit: 'ml',    currentQuantity: 750, minAlert: 250, cost: 45,   supplier: 'InkPro Chile',  lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-CMYK-Y',     name: 'Tinta DTF Yellow 1L',     type: SUPPLY_TYPE.INK_Y,   unit: 'ml',    currentQuantity: 820, minAlert: 250, cost: 45,   supplier: 'InkPro Chile',  lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-CMYK-K',     name: 'Tinta DTF Black 1L',      type: SUPPLY_TYPE.INK_K,   unit: 'ml',    currentQuantity: 900, minAlert: 250, cost: 45,   supplier: 'InkPro Chile',  lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-WHITE',      name: 'Tinta DTF Blanca 1L',     type: SUPPLY_TYPE.INK_W,   unit: 'ml',    currentQuantity: 200, minAlert: 300, cost: 65,   supplier: 'InkPro Chile',  lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'INK-VARNISH',    name: 'Tinta UV Barniz 500ml',   type: SUPPLY_TYPE.INK_V,   unit: 'ml',    currentQuantity: 380, minAlert: 150, cost: 120,  supplier: 'UV Supplies',   lastRestockAt: now, updatedAt: now },
    { id: uuidv4(), code: 'POLIAMIDA-5KG', name: 'Poliamida Termofusible 5kg', type: SUPPLY_TYPE.POLIAMIDA, unit: 'kg', currentQuantity: 12, minAlert: 3, cost: 12000, supplier: 'DTF Chile SPA', lastRestockAt: now, updatedAt: now },
  ];
  await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).insertMany(supplies);

  // ORDERS + ORDER ITEMS + PRODUCTION QUEUE
  const orders = [];
  const orderItems = [];
  const queue = [];
  const scenarios = [
    { channel: SALES_CHANNEL.POS,       total: 17970, status: ORDER_STATUS.DELIVERED,     ps: PRODUCTION_STATUS.READY,     priority: PRIORITY.NORMAL,  printer: PRINTERS.EPSON_R1390,     lengthMm: 850,  paidAgo: 4 },
    { channel: SALES_CHANNEL.WEB,       total: 45900, status: ORDER_STATUS.IN_PRODUCTION, ps: PRODUCTION_STATUS.PRINTING,  priority: PRIORITY.EXPRESS, printer: PRINTERS.PRESTIGE_R2_PRO, lengthMm: 3200, paidAgo: 1 },
    { channel: SALES_CHANNEL.WEB,       total: 24990, status: ORDER_STATUS.PAID,          ps: PRODUCTION_STATUS.RECEIVED,  priority: PRIORITY.NORMAL,  printer: PRINTERS.DTF_UV,          lengthMm: 480,  paidAgo: 0 },
    { channel: SALES_CHANNEL.WHATSAPP,  total: 8990,  status: ORDER_STATUS.IN_PRODUCTION, ps: PRODUCTION_STATUS.CURING,    priority: PRIORITY.NORMAL,  printer: PRINTERS.EPSON_R1390,     lengthMm: 620,  paidAgo: 2 },
    { channel: SALES_CHANNEL.WEB,       total: 39990, status: ORDER_STATUS.IN_PRODUCTION, ps: PRODUCTION_STATUS.PRINTING,  priority: PRIORITY.NORMAL,  printer: PRINTERS.PRESTIGE_R2_PRO, lengthMm: 2100, paidAgo: 0 },
  ];
  scenarios.forEach((s, i) => {
    const oid = uuidv4();
    const paidAt = new Date(now.getTime() - s.paidAgo * 3600 * 1000);
    orders.push({
      id: oid,
      orderNumber: `DLV-2025-${String(100 + i).padStart(6, '0')}`,
      channel: s.channel,
      customerId: i % 2 === 0 ? customerId : null,
      customerSnapshot: { name: ['Javier Rojas','María Torres','Empresa ACME SpA','Consuelo Vera','Diego P.'][i], email: 'cliente@example.cl', phone: '+56911223344', rut: '18.222.333-1' },
      status: s.status,
      productionStatus: s.ps,
      priority: s.priority,
      subtotal: Math.round(s.total / 1.19),
      discount: 0,
      tax: s.total - Math.round(s.total / 1.19),
      shipping: s.channel === SALES_CHANNEL.WEB ? 3990 : 0,
      total: s.total,
      paymentMethod: [PAYMENT_METHOD.CASH, PAYMENT_METHOD.WEBPAY, PAYMENT_METHOD.MERCADOPAGO, PAYMENT_METHOD.TRANSFER, PAYMENT_METHOD.WEBPAY][i],
      paymentStatus: 'paid',
      boleta: { number: `B${100000 + i}`, url: null },
      deliveryMethod: s.channel === SALES_CHANNEL.WEB ? 'shipping' : 'pickup',
      shippingAddress: s.channel === SALES_CHANNEL.WEB ? { street: 'Av. Providencia 999', comuna: 'Providencia', city: 'Santiago', region: 'RM' } : null,
      notes: s.priority === PRIORITY.EXPRESS ? 'Cliente lo necesita para el sábado' : '',
      createdAt: paidAt, paidAt, deliveredAt: s.status === ORDER_STATUS.DELIVERED ? paidAt : null,
    });

    const itemId = uuidv4();
    orderItems.push({
      id: itemId, orderId: oid, type: 'gang_sheet',
      gangSheetId: uuidv4(), name: `Gang Sheet ${PRINTER_SPECS[s.printer].type} · ${(s.lengthMm/1000).toFixed(2)}m`,
      quantity: 1, unitPrice: s.total, discount: 0, totalPrice: s.total,
      gangSheetSpec: { printerType: s.printer, widthCm: PRINTER_SPECS[s.printer].maxWidthCm, lengthMm: s.lengthMm, designsCount: Math.floor(s.lengthMm/150) },
    });

    queue.push({
      id: uuidv4(), orderId: oid, orderItemId: itemId,
      printer: s.printer, status: s.ps, priority: s.priority,
      assignedOperatorId: operatorId,
      startedAt: s.ps !== PRODUCTION_STATUS.RECEIVED ? paidAt : null,
      completedAt: s.ps === PRODUCTION_STATUS.READY ? paidAt : null,
      fileUrl: `/hotfolder/${s.printer}/DLV-2025-${100+i}.png`,
      lengthMm: s.lengthMm,
      inkConsumption: { c: s.lengthMm*0.4, m: s.lengthMm*0.4, y: s.lengthMm*0.4, k: s.lengthMm*0.3, w: s.lengthMm*0.8, v: s.printer === PRINTERS.DTF_UV ? s.lengthMm*0.3 : 0 },
      filmConsumption: s.lengthMm / 1000,
      notes: '',
    });
  });
  await db.collection(COLLECTIONS.ORDERS).insertMany(orders);
  await db.collection(COLLECTIONS.ORDER_ITEMS).insertMany(orderItems);
  await db.collection(COLLECTIONS.PRODUCTION_QUEUE).insertMany(queue);

  // TAXONOMIES
  const taxonomies = [
    { id: uuidv4(), kind: 'product_category', code: 'apparel',   label: 'Prendas (poleras, hoodies)',      extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'product_category', code: 'dtf_meter', label: 'DTF por metro',                   extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'product_category', code: 'accessory', label: 'Accesorios (parches, stickers)',  extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'product_category', code: 'other',     label: 'Otro',                            extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'film_pet',    label: 'Film PET (DTF Textil)',       extras: { unit: 'meter' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'film_uv',     label: 'Film UV (Adhesivo)',          extras: { unit: 'meter' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_cyan',    label: 'Tinta Cyan',                  extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_magenta', label: 'Tinta Magenta',               extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_yellow',  label: 'Tinta Yellow',                extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_black',   label: 'Tinta Black',                 extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_white',   label: 'Tinta Blanca',                extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'ink_varnish', label: 'Tinta Barniz (UV)',           extras: { unit: 'ml' }, createdAt: now },
    { id: uuidv4(), kind: 'supply_type', code: 'poliamida',   label: 'Poliamida (adhesivo termofusible)', extras: { unit: 'kg' }, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'meter', label: 'metros (m)',      extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'ml',    label: 'mililitros (ml)', extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'liter', label: 'litros (L)',      extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'kg',    label: 'kilogramos (kg)', extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'gram',  label: 'gramos (g)',      extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'unit', code: 'unit',  label: 'unidades (un)',   extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'supplier', code: 'dtf_chile',   label: 'DTF Chile SPA', extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'supplier', code: 'inkpro',      label: 'InkPro Chile',  extras: {}, createdAt: now },
    { id: uuidv4(), kind: 'supplier', code: 'uv_supplies', label: 'UV Supplies',   extras: {}, createdAt: now },
  ];
  await db.collection(COLLECTIONS.TAXONOMIES).insertMany(taxonomies);

  // PRINTERS (equipos configurables) — 3 canónicos por defecto
  const printers = [
    {
      id: uuidv4(), code: 'epson_r1390', label: 'Epson R1390', shortLabel: 'Epson',
      type: 'dtf_textil', widthMm: 310, dpi: 300,
      supportsWhite: true, supportsVarnish: false,
      pricePerMm: 10, minLengthMm: 100, dailyCapacityM: 30,
      color: 'from-blue-500 to-indigo-600',
      notes: 'Pedidos chicos, calibración precisa',
      active: true, sortOrder: 1, createdAt: now, updatedAt: now,
    },
    {
      id: uuidv4(), code: 'prestige_r2_pro', label: 'Prestige R2 Pro', shortLabel: 'Prestige',
      type: 'dtf_textil', widthMm: 330, dpi: 300,
      supportsWhite: true, supportsVarnish: false,
      pricePerMm: 12, minLengthMm: 100, dailyCapacityM: 80,
      color: 'from-purple-500 to-fuchsia-600',
      notes: 'Producción diaria en volumen',
      active: true, sortOrder: 2, createdAt: now, updatedAt: now,
    },
    {
      id: uuidv4(), code: 'dtf_uv', label: 'DTF UV', shortLabel: 'UV',
      type: 'dtf_uv', widthMm: 600, dpi: 300,
      supportsWhite: true, supportsVarnish: true,
      pricePerMm: 28, minLengthMm: 100, dailyCapacityM: 25,
      color: 'from-emerald-500 to-teal-600',
      notes: 'Rígidos: madera, acrílico, metal, vidrio',
      active: true, sortOrder: 3, createdAt: now, updatedAt: now,
    },
  ];
  await db.collection(COLLECTIONS.PRINTERS).insertMany(printers);

  return json({
    ok: true,
    seeded: {
      users: 3, products: products.length, commercialStock: commercialStock.length,
      supplies: supplies.length, orders: orders.length, orderItems: orderItems.length, productionQueue: queue.length,
      taxonomies: taxonomies.length, printers: printers.length,
    },
  });
}
