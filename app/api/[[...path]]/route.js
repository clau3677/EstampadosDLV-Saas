import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getDb } from '@/lib/mongo';
import {
  COLLECTIONS, PRINTERS, PRINTER_SPECS, ROLES, SUPPLY_TYPE,
  PRODUCT_CATEGORY, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY,
  SALES_CHANNEL, PAYMENT_METHOD, strip,
} from '@/lib/models';
import { PRICING, quote } from '@/lib/pricing';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'designs');

const cors = (res) => {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
};

export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })); }

async function handle(request, { params }) {
  const { path: routePath = [] } = await params;
  const route = '/' + routePath.join('/');
  const method = request.method;

  try {
    const db = await getDb();

    // ------------------------------------------------------------
    // GET /api/ or /api/root — health check
    // ------------------------------------------------------------
    if ((route === '/' || route === '/root') && method === 'GET') {
      return cors(NextResponse.json({
        service: 'Estampados DLV · Sistema Operativo',
        status: 'ok',
        version: '0.1.0',
        printers: Object.values(PRINTER_SPECS).map(p => `${p.name} (${p.maxWidthCm}cm)`),
      }));
    }

    // ------------------------------------------------------------
    // GET /api/config — expone specs de hardware + enums al frontend
    // ------------------------------------------------------------
    if (route === '/config' && method === 'GET') {
      return cors(NextResponse.json({
        printers: PRINTER_SPECS,
        enums: { ROLES, SUPPLY_TYPE, PRODUCT_CATEGORY, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, PAYMENT_METHOD },
      }));
    }

    // ------------------------------------------------------------
    // GET /api/dashboard/summary — KPIs y estado de impresoras
    // ------------------------------------------------------------
    if (route === '/dashboard/summary' && method === 'GET') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [salesAgg] = await db.collection(COLLECTIONS.ORDERS).aggregate([
        { $match: { paidAt: { $gte: start }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).toArray();

      const pendingOrders = await db.collection(COLLECTIONS.ORDERS).countDocuments({
        status: { $in: [ORDER_STATUS.PAID, ORDER_STATUS.IN_PRODUCTION] },
      });

      const [metersAgg] = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
        { $match: { completedAt: { $gte: start } } },
        { $group: { _id: null, mm: { $sum: '$lengthMm' } } },
      ]).toArray();

      const supplies = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).toArray();
      const stockAlerts = supplies.filter(s => s.currentQuantity <= s.minAlert).length;

      const queueByPrinter = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
        { $match: { status: { $in: [PRODUCTION_STATUS.RECEIVED, PRODUCTION_STATUS.PRINTING] } } },
        { $group: { _id: '$printer', c: { $sum: 1 } } },
      ]).toArray();
      const printerQueues = Object.values(PRINTERS).reduce((acc, p) => (acc[p] = 0, acc), {});
      queueByPrinter.forEach(q => { printerQueues[q._id] = q.c; });

      const recentOrders = await db.collection(COLLECTIONS.ORDERS)
        .find({}).sort({ createdAt: -1 }).limit(6).toArray();
      const recentActivity = recentOrders.map(o => ({
        message: `Pedido ${o.orderNumber} · ${o.customerSnapshot?.name || 'Cliente'} · ${o.channel.toUpperCase()}`,
        at: o.createdAt,
      }));

      return cors(NextResponse.json({
        salesToday: salesAgg?.total ?? 0,
        pendingOrders,
        metersToday: Math.round(((metersAgg?.mm ?? 0) / 1000) * 10) / 10,
        stockAlerts,
        printerQueues,
        recentActivity,
      }));
    }

    // ------------------------------------------------------------
    // POST /api/seed — carga datos demo chilenos para arrancar
    // ------------------------------------------------------------
    if (route === '/seed' && method === 'POST') {
      // Limpiar colecciones (para permitir re-seed idempotente en dev)
      for (const c of Object.values(COLLECTIONS)) {
        await db.collection(c).deleteMany({});
      }

      const now = new Date();

      // USERS
      const adminId = uuidv4();
      const operatorId = uuidv4();
      const customerId = uuidv4();
      await db.collection(COLLECTIONS.USERS).insertMany([
        { id: adminId, email: 'admin@estampadosdlv.cl', passwordHash: '$2b$10$demo', role: ROLES.ADMIN,
          fullName: 'Diego López', phone: '+56912345678', rut: '12.345.678-9',
          address: { street: 'Av. Vicuña Mackenna 1234', comuna: 'Ñuñoa', city: 'Santiago', region: 'RM' },
          createdAt: now, lastLoginAt: now },
        { id: operatorId, email: 'operador@estampadosdlv.cl', passwordHash: '$2b$10$demo', role: ROLES.OPERATOR,
          fullName: 'Carla Muñoz', phone: '+56987654321', rut: '15.678.234-K',
          address: { street: 'Los Alerces 456', comuna: 'Maipú', city: 'Santiago', region: 'RM' },
          createdAt: now, lastLoginAt: now },
        { id: customerId, email: 'cliente@example.cl', passwordHash: '$2b$10$demo', role: ROLES.CUSTOMER,
          fullName: 'Javier Rojas', phone: '+56911223344', rut: '18.222.333-1',
          address: { street: 'Av. Providencia 999', comuna: 'Providencia', city: 'Santiago', region: 'RM' },
          createdAt: now, lastLoginAt: null },
      ]);

      // PRODUCTS (catálogo comercial)
      const products = [
        { id: uuidv4(), sku: 'POL-CLA-NEG', name: 'Polera Algodón Clásica', slug: 'polera-algodon-clasica',
          category: PRODUCT_CATEGORY.APPAREL, subcategory: 'poleras', description: 'Polera 100% algodón peinado 180gr, ideal para DTF.',
          images: [], basePrice: 5990, cost: 2500,
          variants: [
            { id: uuidv4(), name: 'Talla S / Negro',  sku: 'POL-CLA-NEG-S', price: 5990, attributes: { size: 'S', color: 'Negro' } },
            { id: uuidv4(), name: 'Talla M / Negro',  sku: 'POL-CLA-NEG-M', price: 5990, attributes: { size: 'M', color: 'Negro' } },
            { id: uuidv4(), name: 'Talla L / Negro',  sku: 'POL-CLA-NEG-L', price: 5990, attributes: { size: 'L', color: 'Negro' } },
            { id: uuidv4(), name: 'Talla M / Blanco', sku: 'POL-CLA-BLA-M', price: 5990, attributes: { size: 'M', color: 'Blanco' } },
          ],
          active: true, seoMeta: { title: 'Polera Algodón Clásica', description: 'Ideal para DTF', keywords: ['polera','dtf','algodón'] },
          createdAt: now, updatedAt: now },
        { id: uuidv4(), sku: 'DTF-MET-31', name: 'DTF Textil por Metro · 31 cm', slug: 'dtf-textil-por-metro-31',
          category: PRODUCT_CATEGORY.DTF_METER, subcategory: 'dtf_textil', description: 'DTF Textil impreso por metro lineal, ancho útil 31 cm (Epson R1390).',
          images: [], basePrice: 8990, cost: 3200,
          variants: [{ id: uuidv4(), name: 'x metro', sku: 'DTF-MET-31-1M', price: 8990, attributes: { width_cm: 31 } }],
          active: true, seoMeta: { title: 'DTF Textil por Metro 31cm', description: 'Ancho 31cm', keywords: ['dtf','metro'] },
          createdAt: now, updatedAt: now },
        { id: uuidv4(), sku: 'DTF-MET-33', name: 'DTF Textil por Metro · 33 cm', slug: 'dtf-textil-por-metro-33',
          category: PRODUCT_CATEGORY.DTF_METER, subcategory: 'dtf_textil', description: 'DTF Textil impreso por metro lineal, ancho útil 33 cm (Prestige R2 Pro).',
          images: [], basePrice: 9990, cost: 3600,
          variants: [{ id: uuidv4(), name: 'x metro', sku: 'DTF-MET-33-1M', price: 9990, attributes: { width_cm: 33 } }],
          active: true, seoMeta: { title: 'DTF Textil por Metro 33cm', description: 'Ancho 33cm', keywords: ['dtf','metro'] },
          createdAt: now, updatedAt: now },
        { id: uuidv4(), sku: 'HOO-PREM-NEG', name: 'Poleron con Capucha Premium', slug: 'poleron-capucha-premium',
          category: PRODUCT_CATEGORY.APPAREL, subcategory: 'hoodies', description: 'Poleron premium 380gr con felpa interior.',
          images: [], basePrice: 19990, cost: 9000,
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

      // PRODUCTION SUPPLIES (Inventario 2)
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

      return cors(NextResponse.json({
        ok: true,
        seeded: {
          users: 3, products: products.length, commercialStock: commercialStock.length,
          supplies: supplies.length, orders: orders.length, orderItems: orderItems.length, productionQueue: queue.length,
        },
      }));
    }

    // ------------------------------------------------------------
    // GET /api/products — catálogo público
    // ------------------------------------------------------------
    if (route === '/products' && method === 'GET') {
      const items = await db.collection(COLLECTIONS.PRODUCTS).find({}).sort({ createdAt: -1 }).toArray();
      return cors(NextResponse.json(strip(items)));
    }

    // ------------------------------------------------------------
    // GET /api/inventory/commercial
    // ------------------------------------------------------------
    if (route === '/inventory/commercial' && method === 'GET') {
      const rows = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).find({}).toArray();
      return cors(NextResponse.json(strip(rows)));
    }

    // ------------------------------------------------------------
    // GET /api/inventory/supplies
    // ------------------------------------------------------------
    if (route === '/inventory/supplies' && method === 'GET') {
      const rows = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).sort({ name: 1 }).toArray();
      return cors(NextResponse.json(strip(rows)));
    }

    // ------------------------------------------------------------
    // GET /api/orders
    // ------------------------------------------------------------
    if (route === '/orders' && method === 'GET') {
      const rows = await db.collection(COLLECTIONS.ORDERS).find({}).sort({ createdAt: -1 }).limit(200).toArray();
      return cors(NextResponse.json(strip(rows)));
    }

    // ------------------------------------------------------------
    // POST /api/uploads/design  — sube imagen, extrae metadata (DPI real)
    // ------------------------------------------------------------
    if (route === '/uploads/design' && method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) return cors(NextResponse.json({ error: 'file requerido' }, { status: 400 }));

      await mkdir(UPLOAD_DIR, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const id = uuidv4();
      const filename = `${id}.${ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);
      await writeFile(filepath, buffer);

      // Leer metadata con Sharp (dimensiones + DPI real)
      let meta = {};
      try {
        meta = await sharp(buffer).metadata();
      } catch (e) {
        console.error('sharp metadata failed', e);
      }
      const dpi = Math.round(meta.density || 72);
      const url = `/uploads/designs/${filename}`;

      return cors(NextResponse.json({
        id,
        url,
        originalName: file.name,
        widthPx: meta.width || 0,
        heightPx: meta.height || 0,
        format: meta.format,
        dpi,
        sizeBytes: buffer.length,
      }));
    }

    // ------------------------------------------------------------
    // POST /api/gang-sheets  — persiste pliego y crea pedido
    // ------------------------------------------------------------
    if (route === '/gang-sheets' && method === 'POST') {
      const body = await request.json();
      const { mode, canvasWidthMm, express = false, designs = [] } = body;
      if (!mode || !PRICING[mode]) return cors(NextResponse.json({ error: 'modo inválido' }, { status: 400 }));
      if (!designs.length) return cors(NextResponse.json({ error: 'sin diseños' }, { status: 400 }));

      const cfg = PRICING[mode];

      // Validación estricta de hardware
      if (mode !== 'dtf_uv' && canvasWidthMm / 10 > cfg.canvasWidthCm) {
        return cors(NextResponse.json({ error: `Ancho excede ${cfg.canvasWidthCm}cm para ${cfg.label}` }, { status: 400 }));
      }
      for (const d of designs) {
        if (d.xMm + d.widthMm > canvasWidthMm) {
          return cors(NextResponse.json({ error: `Diseño "${d.name}" excede el ancho del lienzo` }, { status: 400 }));
        }
      }

      // Cotización server-side (verdad autoritativa)
      const maxBottom = designs.reduce((m, d) => Math.max(m, d.yMm + d.heightMm), 0);
      const lengthMm = Math.max(maxBottom + 20, 300);
      const q = quote({ mode, lengthMm, express });

      const db = await getDb();
      const now = new Date();

      // Crear gang sheet
      const gangSheetId = uuidv4();
      const gangSheet = {
        id: gangSheetId,
        orderId: null,
        userId: null,
        type: mode === 'dtf_uv' ? 'dtf_uv' : 'dtf_textil',
        printerTarget: cfg.printer,
        canvasWidthCm: cfg.canvasWidthCm,
        canvasLengthMm: lengthMm,
        designs: designs.map(d => ({
          id: uuidv4(),
          imageUrl: d.imageUrl,
          name: d.name,
          srcWidthPx: d.srcWidthPx,
          srcHeightPx: d.srcHeightPx,
          xMm: d.xMm, yMm: d.yMm, widthMm: d.widthMm, heightMm: d.heightMm,
          rotation: d.rotation || 0,
          dpi: Math.round(d.srcWidthPx / (d.widthMm / 25.4)),
        })),
        exportedPngUrl: null,
        exportedTiffUrl: null,
        exportStatus: 'draft',
        hotFolderPath: null,
        createdAt: now,
        exportedAt: null,
      };
      await db.collection(COLLECTIONS.GANG_SHEETS).insertOne(gangSheet);

      // Crear orden (canal web por defecto)
      const orderCount = await db.collection(COLLECTIONS.ORDERS).countDocuments({});
      const orderNumber = `DLV-2025-${String(orderCount + 200).padStart(6, '0')}`;
      const orderId = uuidv4();
      const order = {
        id: orderId,
        orderNumber,
        channel: SALES_CHANNEL.WEB,
        customerId: null,
        customerSnapshot: { name: 'Cliente Web', email: '', phone: '', rut: '' },
        status: ORDER_STATUS.PENDING,
        productionStatus: PRODUCTION_STATUS.NOT_STARTED,
        priority: express ? PRIORITY.EXPRESS : PRIORITY.NORMAL,
        subtotal: q.subtotal,
        discount: 0,
        tax: q.tax,
        shipping: 0,
        total: q.total,
        paymentMethod: null,
        paymentStatus: 'pending',
        boleta: null,
        deliveryMethod: 'pickup',
        shippingAddress: null,
        notes: '',
        createdAt: now,
        paidAt: null,
        deliveredAt: null,
      };
      await db.collection(COLLECTIONS.ORDERS).insertOne(order);

      // Crear order item
      await db.collection(COLLECTIONS.ORDER_ITEMS).insertOne({
        id: uuidv4(),
        orderId,
        type: 'gang_sheet',
        gangSheetId,
        name: `${cfg.label} · ${(lengthMm/10).toFixed(1)} cm`,
        quantity: 1,
        unitPrice: q.netAmount,
        discount: 0,
        totalPrice: q.netAmount,
        gangSheetSpec: {
          printerType: cfg.printer,
          widthCm: cfg.canvasWidthCm,
          lengthMm,
          designsCount: designs.length,
        },
      });

      // Vincular gang sheet a la orden
      await db.collection(COLLECTIONS.GANG_SHEETS).updateOne({ id: gangSheetId }, { $set: { orderId } });

      return cors(NextResponse.json({
        ok: true,
        gangSheetId,
        orderId,
        orderNumber,
        printerLabel: PRINTER_SPECS[cfg.printer].name,
        printer: cfg.printer,
        lengthMm,
        total: q.total,
        quote: q,
      }));
    }

    // ------------------------------------------------------------
    // GET /api/pricing — expone tarifas al frontend
    // ------------------------------------------------------------
    if (route === '/pricing' && method === 'GET') {
      return cors(NextResponse.json(PRICING));
    }

    // ------------------------------------------------------------
    // POST /api/inventory/supplies  — crear nuevo insumo de producción
    // ------------------------------------------------------------
    if (route === '/inventory/supplies' && method === 'POST') {
      const body = await request.json();
      const { code, name, type, unit, currentQuantity, minAlert, cost, supplier } = body;
      if (!name || !type || !unit) {
        return cors(NextResponse.json({ error: 'name, type y unit son requeridos' }, { status: 400 }));
      }
      const now = new Date();
      const doc = {
        id: uuidv4(),
        code: code || `SUP-${Date.now()}`,
        name,
        type,
        unit,
        currentQuantity: Number(currentQuantity) || 0,
        minAlert: Number(minAlert) || 0,
        cost: Number(cost) || 0,
        supplier: supplier || '',
        lastRestockAt: Number(currentQuantity) > 0 ? now : null,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).insertOne(doc);
      // Registrar movimiento inicial si hay stock
      if (doc.currentQuantity > 0) {
        await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
          id: uuidv4(),
          type: 'supply_in',
          reference: 'manual',
          referenceId: doc.id,
          itemType: 'supply',
          itemId: doc.id,
          quantity: doc.currentQuantity,
          balanceAfter: doc.currentQuantity,
          operatorId: null,
          reason: 'Creación inicial de insumo',
          createdAt: now,
        });
      }
      return cors(NextResponse.json(strip(doc)));
    }

    // ------------------------------------------------------------
    // PATCH /api/inventory/supplies  — actualizar metadata del insumo
    // ------------------------------------------------------------
    if (route === '/inventory/supplies' && method === 'PATCH') {
      const body = await request.json();
      const { id, ...updates } = body;
      if (!id) return cors(NextResponse.json({ error: 'id requerido' }, { status: 400 }));
      // No permitir cambiar cantidad por acá (usar /adjust)
      delete updates.currentQuantity;
      delete updates.id;
      updates.updatedAt = new Date();
      await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).updateOne({ id }, { $set: updates });
      return cors(NextResponse.json({ ok: true }));
    }

    // ------------------------------------------------------------
    // POST /api/products  — crear nuevo producto con variantes
    // Auto-crea commercial_stock por cada variante.
    // ------------------------------------------------------------
    if (route === '/products' && method === 'POST') {
      const body = await request.json();
      const { name, sku, category, subcategory, description, basePrice, cost, variants } = body;
      if (!name || !category) {
        return cors(NextResponse.json({ error: 'name y category son requeridos' }, { status: 400 }));
      }
      const now = new Date();
      const productId = uuidv4();
      const slug = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const baseSku = sku || `PRD-${Date.now()}`;
      const processedVariants = (Array.isArray(variants) && variants.length > 0 ? variants : [
        { name: 'Único', attributes: {}, initialStock: 0 },
      ]).map((v, i) => ({
        id: uuidv4(),
        name: v.name || `Variante ${i + 1}`,
        sku: v.sku || `${baseSku}-${i + 1}`,
        price: Number(v.price) || Number(basePrice) || 0,
        attributes: v.attributes || {},
        _initialStock: Number(v.initialStock) || 0,
      }));

      const productDoc = {
        id: productId,
        sku: baseSku,
        name,
        slug,
        category,
        subcategory: subcategory || '',
        description: description || '',
        images: [],
        basePrice: Number(basePrice) || 0,
        cost: Number(cost) || 0,
        variants: processedVariants.map(({ _initialStock, ...v }) => v),
        active: true,
        seoMeta: { title: name, description: description || '', keywords: [] },
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.PRODUCTS).insertOne(productDoc);

      // Crear commercial_stock por cada variante
      const stockRows = processedVariants.map(v => ({
        id: uuidv4(),
        productId,
        variantId: v.id,
        quantity: v._initialStock || 0,
        reservedQuantity: 0,
        location: 'Bodega Principal',
        minStockAlert: 5,
        updatedAt: now,
      }));
      if (stockRows.length > 0) {
        await db.collection(COLLECTIONS.COMMERCIAL_STOCK).insertMany(stockRows);
        // Registrar movimientos iniciales
        for (const s of stockRows) {
          if (s.quantity > 0) {
            await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
              id: uuidv4(),
              type: 'commercial_in',
              reference: 'manual',
              referenceId: s.id,
              itemType: 'product_variant',
              itemId: s.variantId,
              quantity: s.quantity,
              balanceAfter: s.quantity,
              operatorId: null,
              reason: `Creación inicial de "${name}"`,
              createdAt: now,
            });
          }
        }
      }

      return cors(NextResponse.json({ ok: true, product: strip(productDoc), stockRows: stockRows.length }));
    }

    // ------------------------------------------------------------
    // DELETE /api/products  — eliminar producto (soft con active=false)
    // ------------------------------------------------------------
    if (route === '/products' && method === 'DELETE') {
      const body = await request.json();
      const { id } = body;
      if (!id) return cors(NextResponse.json({ error: 'id requerido' }, { status: 400 }));
      await db.collection(COLLECTIONS.PRODUCTS).updateOne({ id }, { $set: { active: false, updatedAt: new Date() } });
      return cors(NextResponse.json({ ok: true }));
    }

    // ------------------------------------------------------------
    // GET /api/production/queue  — cola enriquecida con datos de la orden
    // ------------------------------------------------------------
    if (route === '/production/queue' && method === 'GET') {
      const url = new URL(request.url);
      const printerFilter = url.searchParams.get('printer');
      const q = printerFilter && printerFilter !== 'all' ? { printer: printerFilter } : {};

      const items = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
        .find(q).sort({ createdAt: -1 }).limit(500).toArray();

      const orderIds = [...new Set(items.map(i => i.orderId).filter(Boolean))];
      const orders = orderIds.length
        ? await db.collection(COLLECTIONS.ORDERS).find({ id: { $in: orderIds } }).toArray()
        : [];
      const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

      const enriched = items.map(i => {
        const o = ordersMap[i.orderId];
        return {
          ...i,
          order: o ? {
            orderNumber: o.orderNumber,
            customerName: o.customerSnapshot?.name,
            channel: o.channel,
            total: o.total,
            createdAt: o.createdAt,
          } : null,
        };
      });
      return cors(NextResponse.json(strip(enriched)));
    }

    // ------------------------------------------------------------
    // POST /api/production/move  — cambia el estado de un item de cola
    // ------------------------------------------------------------
    if (route === '/production/move' && method === 'POST') {
      const { id, toStatus } = await request.json();
      const valid = ['received', 'printing', 'curing', 'ready'];
      if (!id || !valid.includes(toStatus)) {
        return cors(NextResponse.json({ error: 'parámetros inválidos' }, { status: 400 }));
      }

      const now = new Date();
      const setFields = { status: toStatus };
      if (toStatus === 'printing') setFields.startedAt = now;
      if (toStatus === 'ready') setFields.completedAt = now;

      const result = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
        .findOneAndUpdate({ id }, { $set: setFields }, { returnDocument: 'after' });
      const item = result?.value || result;
      if (!item) return cors(NextResponse.json({ error: 'no encontrado' }, { status: 404 }));

      // Actualizar productionStatus del pedido padre
      if (item.orderId) {
        await db.collection(COLLECTIONS.ORDERS).updateOne(
          { id: item.orderId },
          { $set: { productionStatus: toStatus } }
        );

        // Si todos los items de la orden están ready, marcar la orden como ready
        if (toStatus === 'ready') {
          const pending = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
            .countDocuments({ orderId: item.orderId, status: { $ne: 'ready' } });
          if (pending === 0) {
            await db.collection(COLLECTIONS.ORDERS).updateOne(
              { id: item.orderId },
              { $set: { status: 'ready' } }
            );
          }
        }
      }

      return cors(NextResponse.json({ ok: true, item: strip(item) }));
    }

    // ------------------------------------------------------------
    // POST /api/inventory/adjust  — ajuste manual de stock/insumo
    // ------------------------------------------------------------
    if (route === '/inventory/adjust' && method === 'POST') {
      const { itemType, itemId, delta, reason } = await request.json();
      const numDelta = Number(delta);
      if (!itemType || !itemId || isNaN(numDelta) || numDelta === 0) {
        return cors(NextResponse.json({ error: 'parámetros inválidos' }, { status: 400 }));
      }
      if (!['supply', 'commercial'].includes(itemType)) {
        return cors(NextResponse.json({ error: 'itemType inválido' }, { status: 400 }));
      }

      const collName = itemType === 'supply' ? COLLECTIONS.PRODUCTION_SUPPLIES : COLLECTIONS.COMMERCIAL_STOCK;
      const qtyField = itemType === 'supply' ? 'currentQuantity' : 'quantity';

      const doc = await db.collection(collName).findOne({ id: itemId });
      if (!doc) return cors(NextResponse.json({ error: 'item no encontrado' }, { status: 404 }));

      const currentQty = doc[qtyField] || 0;
      const newQty = currentQty + numDelta;
      if (newQty < 0) {
        return cors(NextResponse.json({ error: `Stock no puede quedar negativo (${currentQty} + ${numDelta})` }, { status: 400 }));
      }

      const now = new Date();
      const updateSet = { [qtyField]: newQty, updatedAt: now };
      if (itemType === 'supply' && numDelta > 0) updateSet.lastRestockAt = now;

      await db.collection(collName).updateOne({ id: itemId }, { $set: updateSet });

      // Registrar movimiento en la bitácora
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(),
        type: itemType === 'supply'
          ? (numDelta > 0 ? 'supply_in' : 'supply_out')
          : (numDelta > 0 ? 'commercial_in' : 'commercial_out'),
        reference: 'manual',
        referenceId: itemId,
        itemType: itemType === 'supply' ? 'supply' : 'product_variant',
        itemId,
        quantity: numDelta,
        balanceAfter: newQty,
        operatorId: null,
        reason: reason || 'Ajuste manual',
        createdAt: now,
      });

      return cors(NextResponse.json({ ok: true, newQuantity: newQty, previousQuantity: currentQty }));
    }

    // ------------------------------------------------------------
    // GET /api/stock-movements  — bitácora de movimientos
    // ------------------------------------------------------------
    if (route === '/stock-movements' && method === 'GET') {
      const rows = await db.collection(COLLECTIONS.STOCK_MOVEMENTS)
        .find({}).sort({ createdAt: -1 }).limit(200).toArray();
      return cors(NextResponse.json(strip(rows)));
    }

    // 404
    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }));

  } catch (error) {
    console.error('API Error:', error);
    return cors(NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 }));
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
