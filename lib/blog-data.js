// Datos del blog SEO — Estampados DLV
// Cada artículo incluye contenido HTML optimizado con keywords y FAQ con las
// preguntas reales de los clientes. Contenido estático (sin base de datos)
// para máxima velocidad y crawl de Google.
export const WHATSAPP = '+56 9 5416 9052';
export const WHATSAPP_LINK = 'https://wa.me/56954169052';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com';

export const articles = [
  {
    slug: 'que-es-el-dtf-textil',
    title: 'Qué es el DTF textil y por qué es el mejor estampado para poleras',
    description:
      'Descubre cómo funciona la impresión DTF textil, cuántas lavadas resiste, por qué supera a la serigrafía y la sublimación, y por qué Estampados DLV en Quilpué lo usa para poleras, polerones y gorras.',
    category: 'DTF Textil',
    keywords: ['impresión dtf textil', 'estampado dtf', 'dtf vs serigrafía', 'dtf textil chile', 'estampado de poleras quilpué'],
    date: '2026-08-17',
    sections: [
      { h: 'Impresión DTF textil: la tecnología que revolucionó el estampado', p: 'El DTF textil (Direct to Film) es el método de estampado más moderno del mercado chileno. En Estampados DLV imprimimos tu diseño sobre una película especial y la transferimos con calor sobre la prenda, logrando colores vibrantes, degradados perfectos y detalles finos que otros métodos no consiguen. Sirve para algodón, poliéster, mezclas, dry fit e incluso telas oscuras.' },
      { h: 'DTF vs serigrafía vs sublimación: ¿cuál conviene?', p: 'La serigrafía exige mínimos altos y se encarece con muchos colores; la sublimación solo funciona en poliéster claro; el DTF textil no tiene esas limitaciones. Imprime sobre cualquier color de tela, con cualquier cantidad de colores, desde una sola unidad o por metro completo. Por eso la mayoría de los emprendedores y talleres de la Quinta Región ya prefieren el DTF para poleras personalizadas.' },
      { h: 'Duración y calidad: cuántas lavadas resiste', p: 'Un estampado DTF aplicado con los parámetros correctos de temperatura, tiempo y presión resiste más de 50 lavadas sin cuartearse ni desmayarse. En nuestro taller de Quilpué usamos tintas de calidad premium y verificamos cada aplicación con prueba de planchado, por lo que tu estampado queda firme, flexible y con tacto suave.' },
    ],
    faq: [
      { q: '¿Qué es el estampado DTF textil?', a: 'Es la impresión directa sobre película (Direct to Film) que se transfiere con calor a la prenda. Permite estampar con calidad fotográfica sobre cualquier tela y color.' },
      { q: '¿Cuánto dura un estampado DTF en una polera?', a: 'Con buena aplicación resiste más de 50 lavadas manteniendo color y detalle, sin cuartearse.' },
      { q: '¿Qué diferencia hay entre DTF y serigrafía?', a: 'El DTF no necesita mallas ni mínimos altos, imprime cualquier cantidad de colores desde una unidad y sirve para telas oscuras; la serigrafía es más económica solo en grandes volúmenes de un solo color.' },
      { q: '¿Sirve el DTF en poleras de poliéster o dry fit?', a: 'Sí. El DTF textil funciona en algodón, poliéster, mezclas y dry fit, tanto en telas claras como oscuras.' },
    ],
  },
  {
    slug: 'dtf-uv-que-es-y-donde-se-aplica',
    title: 'DTF UV: qué es y en qué materiales se aplica',
    description:
      'Todo sobre el estampado DTF UV: cómo se pega en gorras, tazas, termos, madera, vidrio y metal, su relieve característico y cuántos centímetros de ancho de paño usamos en nuestro taller de Quilpué.',
    category: 'DTF UV',
    keywords: ['dtf uv', 'estampado dtf uv', 'dtf uv por metro', 'impresión dtf uv chile', 'dtf uv en gorras'],
    date: '2026-08-17',
    sections: [
      { h: 'Impresión DTF UV: estampado para superficies duras', p: 'El DTF UV es la evolución del estampado digital para materiales que no son textiles: gorras, tazas, termos, botellas, llaveros, pendrives, madera, vidrio y metal. Imprimimos sobre película con tinta UV curada por luz ultravioleta, que al aplicarse con prensa o pegamento forma un acabado con ligero relieve, brillante y muy resistente al uso diario.' },
      { h: 'Materiales donde funciona el DTF UV', p: 'En nuestro taller de Quilpué aplicamos DTF UV de 38 cm de ancho sobre casi cualquier superficie lisa o semicurva: gorras animal con malla (ideal para bordado y estampado), tazas personalizadas, termos, placas, llaveros y hasta accesorios de metal. El resultado no se descascara ni se descascarilla con el tiempo si se aplica correctamente.' },
      { h: 'DTF textil vs DTF UV: ¿cuál necesitas?', p: 'Si tu producto es ropa (poleras, polerones, hoodies) necesitas DTF textil; si es merchandising sobre superficies duras (gorras, tazas, termos), necesitas DTF UV. Muchos emprendedores de Valparaíso y Viña del Mar combinan ambos en una sola marca: polera estampada + taza con el mismo diseño.' },
    ],
    faq: [
      { q: '¿Qué es el estampado DTF UV?', a: 'Impresión con tinta curada por luz ultravioleta sobre película, pensada para pegar en superficies duras como gorras, tazas, termos, madera, vidrio y metal.' },
      { q: '¿En qué materiales se puede pegar el DTF UV?', a: 'En casi toda superficie lisa o semicurva: gorras, tazas, termos, botellas, llaveros, madera, vidrio y metal.' },
      { q: '¿El DTF UV tiene relieve o queda liso?', a: 'Queda con un relieve sutil característico y acabado brillante, lo que le da un aspecto premium que la sublimación no logra.' },
      { q: '¿Cuánto mide el ancho del paño de DTF UV?', a: 'Imprimimos paños de DTF UV de 38 cm de ancho por metro de largo, optimizados en gang sheets para aprovechar cada centímetro.' },
    ],
  },
  {
    slug: 'como-cuidar-un-estampado-dtf',
    title: 'Cómo cuidar un estampado DTF para que dure más de 50 lavadas',
    description:
      'Consejos prácticos para que tu polera estampada con DTF dure años: cómo lavarla, si puedes plancharla, cómo secarla y qué evitar para que el estampado no se cuartee ni se desmaye.',
    category: 'Guía práctica',
    keywords: ['cuidado estampado dtf', 'lavar polera estampada', 'estampado dtf lavadas', 'planchar dtf', 'estampado duradero'],
    date: '2026-08-17',
    sections: [
      { h: 'La regla de oro: lavar al revés y en frío', p: 'El mayor enemigo de cualquier estampado es la fricción directa en la lavadora. Lava tu polera estampada al revés, en agua fría o tibia, con ciclo suave y detergente neutro. Con este simple hábito tu estampado DTF mantiene los colores vivos por años.' },
      { h: 'Secado y planchado: sí se puede, con cuidado', p: 'A diferencia de lo que muchos creen, sí puedes planchar una polera con estampado DTF: usa temperatura media, sin vapor, y plancha siempre del revés o con un paño de por medio. Para secar, prefiere la sombra; el sol directo prolongado es lo único que puede apagar los colores con el tiempo.' },
      { h: 'Qué NO hacer con tu polera estampada', p: 'Evita el cloro, los suavizantes en exceso, el secado a tambor a alta temperatura y el frotado fuerte del estampado. Si cuidas estos cuatro puntos, tu estampado pasará fácilmente las 50-60 lavadas de resistencia comprobada del DTF bien aplicado.' },
    ],
    faq: [
      { q: '¿Cuántas lavadas resiste un estampado DTF?', a: 'Bien aplicado resiste más de 50 lavadas manteniendo color y detalle.' },
      { q: '¿Se puede planchar una polera con estampado DTF?', a: 'Sí, con temperatura media, sin vapor y planchando del revés o con un paño protector.' },
      { q: '¿Los estampados DTF aguantan el sol sin destiñirse?', a: 'Son muy resistentes a la luz UV, pero conviene secar a la sombra para conservar los colores al máximo.' },
      { q: '¿El estampado DTF se desmaya o se cuartea al lavar?', a: 'No, si se aplica con los parámetros correctos. La clave es la temperatura y presión de planchado del taller, que en Estampados DLV verificamos en cada pieza.' },
    ],
  },
  {
    slug: 'estampar-en-telas-negras-y-oscuras',
    title: 'Estampar sobre algodón negro y telas oscuras con DTF',
    description:
      'Aprende cómo estampar diseños sobre poleras negras y telas oscuras con DTF textil: colores brillantes, blanco intenso y acabado profesional sin que el estampado se sienta como goma pesada.',
    category: 'Guía práctica',
    keywords: ['estampado en poleras negras', 'dtf sobre algodón oscuro', 'estampar tela negra', 'dtf colores brillantes', 'estampados valparaíso'],
    date: '2026-08-17',
    sections: [
      { h: 'Por fin, colores brillantes sobre negro', p: 'Las poleras negras son las más vendidas en Chile, y también las más difíciles de estampar con métodos tradicionales. El DTF textil imprime una base de tinta blanca bajo los colores, logrando que los diseños resalten con fuerza sobre algodón negro y telas oscuras sin perder intensidad.' },
      { h: '¿Se siente el estampado? El tacto importa', p: 'El DTF deja una capa delgada y flexible. Con el polvo adhesivo y el curado correctos, el estampado se siente suave al tacto, no como una goma gruesa. En nuestro taller de Quilpué ajustamos la gramatura de la aplicación según el peso de la prenda: más ligera en poleras, con más cuerpo en polerones.' },
      { h: 'Azules, rojos y colores intensos: todos funcionan', p: 'Puedes estampar sobre tela azul marino, granate, verde botella o gris oscuro con la misma calidad. El DTF no depende del color de fondo como la sublimación, por eso es el favorito para ropa de trabajo, uniformes corporativos y merchandising de marca.' },
    ],
    faq: [
      { q: '¿Se puede estampar DTF sobre algodón negro o telas oscuras?', a: 'Sí, es una de sus mayores ventajas: la base blanca integrada hace que los colores brillen sobre negro y cualquier tono oscuro.' },
      { q: '¿El DTF se siente pesado o goma sobre la prenda?', a: 'No. Bien aplicado queda delgado y flexible, con tacto suave. Ajustamos la aplicación según el peso de la tela.' },
      { q: '¿Puedo estampar DTF sobre tela azul o de colores?', a: 'Sí, funciona sobre cualquier color de tela: azul, rojo, verde, gris oscuro, etc., sin perder intensidad en el diseño.' },
    ],
  },
  {
    slug: 'poleras-personalizadas-guia',
    title: 'Poleras personalizadas: guía completa para comprar en Chile',
    description:
      'Todo lo que necesitas saber para comprar poleras personalizadas: tipos de tela, tallas S a XXXL, pedido mínimo, precios por cantidad y cómo funciona el envío a todo Chile desde Quilpué.',
    category: 'Productos',
    keywords: ['poleras personalizadas', 'poleras estampadas quilpué', 'poleras por mayor chile', 'estampado de poleras barato', 'ropa personalizada quinta región'],
    date: '2026-08-17',
    sections: [
      { h: 'Elige la prenda correcta para tu estampado', p: 'En nuestro catálogo de ropa lisa encuentras poleras de algodón 100% (Gildan, Cottonext), dry fit de poliéster para deportes, y modelos de marcas como Old Brits en todas las tallas, de la S a la XXXL. Cada tela tiene su ventaja: el algodón para uso diario, el dry fit para deporte y eventos al aire libre.' },
      { h: 'Pedidos desde una unidad o por mayor', p: '¿Puedo estampar solo una polera? Sí. En Estampados DLV no hay pedido mínimo: estampamos desde una unidad para regalos y cumpleaños, y también hacemos producción por mayor para marcas, tiendas y eventos con descuentos progresivos por cantidad.' },
      { h: 'Envío a todo Chile en 2 a 5 días hábiles', p: 'Desde nuestro taller en Quilpué despachamos a todo Chile por $3.490, con entrega en 2 a 5 días hábiles según la región. Para comunas vecinas como Villa Alemana, Valparaíso y Viña del Mar la entrega es aún más rápida.' },
    ],
    faq: [
      { q: '¿Puedo estampar solo una polera?', a: 'Sí, estampamos desde una unidad. No hay pedido mínimo para poleras personalizadas.' },
      { q: '¿Hacen descuentos por cantidad?', a: 'Sí. Mientras más unidades pidas, mejor precio por polera. Cotiza tu cantidad por WhatsApp.' },
      { q: '¿Qué tallas tienen disponibles?', a: 'Desde talla S hasta XXXL en todas nuestras líneas de poleras, polerones y hoodies.' },
      { q: '¿Cuánto cuesta el envío y cuánto demora?', a: 'Envío a todo Chile por $3.490, con entrega en 2 a 5 días hábiles.' },
    ],
  },
  {
    slug: 'gang-sheet-que-es',
    title: 'Gang sheet DTF: qué es y cómo crear tu paño de impresión',
    description:
      'El gang sheet es la forma más barata de imprimir tus diseños en DTF. Aprende cómo crear tu paño de impresión gratis en nuestro Gang Sheet Builder y recibirlo listo para estampar en tu taller.',
    category: 'DTF Textil',
    keywords: ['gang sheet dtf', 'paño de impresión dtf', 'gang sheet builder', 'dtf por metro', 'maquila de estampados'],
    date: '2026-08-17',
    sections: [
      { h: 'Qué es un gang sheet y para qué sirve', p: 'Un gang sheet es un paño de impresión donde se organizan muchos diseños juntos en el menor espacio posible, como un rompecabezas. Al imprimir todos juntos en un metro de película DTF, el costo por diseño baja drásticamente: es el secreto de los talleres y marcas de ropa para producir a bajo costo.' },
      { h: 'Crea tu paño gratis en nuestro Gang Sheet Builder', p: 'En estampadosdlv.com/gang-sheet tienes un editor gratuito para armar tu paño: subes tus diseños PNG, los acomodas en el lienzo, defines tamaños y el sistema calcula los metros necesarios. El diseño llega automáticamente a nuestro taller de Quilpué para imprimirlo y despacharlo por rollo o pliego.' },
      { h: 'Compradores de paños DTF para estampar en casa', p: '¿Tienes plancha o prensa térmica? Muchos emprendedores de la Quinta Región compran nuestros paños DTF ya impresos para estampar sus propias prendas en casa o en su taller. Pide tu metro de DTF por WhatsApp y recíbelo listo para aplicar.' },
    ],
    faq: [
      { q: '¿Qué es un gang sheet y para qué sirve?', a: 'Es un paño de impresión DTF donde se agrupan varios diseños para optimizar el espacio y bajar el costo por diseño.' },
      { q: '¿Cómo creo un paño de impresión en el gang sheet builder?', a: 'Entra a estampadosdlv.com/gang-sheet, sube tus diseños PNG, organízalos en el lienzo y envía el pedido: tu paño llega impreso a tu domicilio.' },
      { q: '¿Venden por metro o por diseño el DTF?', a: 'Vendemos por metro de paño (gang sheet). Mientras más diseños agrupes en el metro, menor es el costo de cada uno.' },
      { q: '¿Puedo comprar paños DTF listos para estampar yo mismo?', a: 'Sí. Imprimimos tu paño y te lo despachamos por rollo o pliego para que lo apliques con tu plancha o prensa térmica.' },
    ],
  },
  {
    slug: 'editor-mockups-gratis',
    title: 'Editor de mockups gratis: diseña tu polera antes de estampar',
    description:
      'Simula cómo quedará tu estampado en poleras, polerones y gorras con nuestro editor de mockups gratuito. Crea tu mockup con los productos reales del catálogo sin registrarte.',
    category: 'Herramientas',
    keywords: ['crear mockup de polera gratis', 'simulador de estampado online', 'editor de mockups', 'mockup polera chile', 'ver estampado en polera'],
    date: '2026-08-17',
    sections: [
      { h: 'Antes de estampar, visualiza el resultado', p: 'El mayor miedo al estampar una prenda es no saber cómo quedará. Nuestro editor de mockups en estampadosdlv.com/mockup te deja colocar tu diseño sobre poleras, polerones, hoodies y gorras reales del catálogo, en distintos colores, para ver exactamente cómo se verá el resultado final.' },
      { h: 'Cómo funciona: tres pasos simples', p: 'Elige la prenda del catálogo, sube tu diseño PNG y el sistema lo coloca automáticamente sobre la prenda con la forma correcta del estampado (pecho, espalda, manga o bolsillo). Puedes cambiar el color de la tela y descargar tu mockup sin registrarte, totalmente gratis.' },
      { h: 'Mockups para vender más en redes sociales', p: 'Usa tus mockups para publicar en Facebook, Instagram y WhatsApp antes de invertir en stock: muestra el diseño en la prenda, recibe pedidos y luego imprime solo lo vendido. Es el flujo que usan los emprendedores de Viña del Mar y Valparaíso para lanzar marcas sin riesgo.' },
    ],
    faq: [
      { q: '¿Puedo crear un mockup de mi diseño antes de estampar?', a: 'Sí, gratis y sin registrarte en estampadosdlv.com/mockup. Eliges la prenda, subes tu diseño y ves el resultado.' },
      { q: '¿Cómo se usa el editor de mockups de la web?', a: 'Elige un producto del catálogo, sube tu imagen PNG, ajusta tamaño y posición, y descarga la vista previa en segundos.' },
      { q: '¿Puedo ver cómo quedará el estampado en la polera antes de comprar?', a: 'Exactamente para eso sirve: simula el estampado sobre la prenda real del catálogo en cualquier color de tela.' },
    ],
  },
  {
    slug: 'ropa-lisa-marcas-y-telas',
    title: 'Ropa lisa para estampar: marcas, telas y catálogo completo',
    description:
      'Conoce las marcas de ropa lisa de nuestro catálogo: Gildan, Cottonext, Old Brits y Yazbek. Algodón 100%, dry fit, oversize, tallas S a XXXL y envío a todo Chile desde Quilpué.',
    category: 'Productos',
    keywords: ['ropa lisa para estampar', 'poleras gildan chile', 'poleras old brits chile', 'polerones cottonext', 'poleras algodón quilpué'],
    date: '2026-08-17',
    sections: [
      { h: 'Las marcas que usamos: Gildan, Cottonext, Old Brits, Yazbek', p: 'Trabajamos con las marcas de ropa lisa más confiables del mercado chileno. Gildan para poleras de algodón 100% de uso diario, Cottonext para polerones y hoodies de 300-340 gramos, Old Brits para líneas premium, y Yazbek para cuellos V. Todas pasan por nuestro control de calidad antes de estamparse.' },
      { h: 'Poleras de algodón 100%: la clásica que nunca falla', p: 'El algodón peinado de 180 gramos es la prenda más pedida para estampar: suave, respirable y con el mejor acabado para DTF. Disponible en colores liso blanco, negro, gris y pasteles, desde talla S hasta XXXL.' },
      { h: 'Compra la prenda lisa o con estampado incluido', p: 'En nuestra tienda puedes comprar las prendas lisas por separado para estamparlas tú mismo, o pedir el combo prenda + estampado con tu diseño aplicado en nuestro taller. Ambas opciones con despacho a todo Chile.' },
    ],
    faq: [
      { q: '¿Qué tipos de poleras lisas tienen disponibles?', a: 'Algodón 100%, dry fit, cuello V, oversize, mujer y niño, de marcas como Gildan, Cottonext, Old Brits y Yazbek.' },
      { q: '¿Qué marcas de ropa lisa manejan?', a: 'Gildan, Cottonext, Old Brits y Yazbek, las marcas más usadas por talleres y marcas de ropa en Chile.' },
      { q: '¿Venden la prenda lisa por separado sin estampar?', a: 'Sí, puedes comprar las prendas lisas solas en la tienda para estamparlas donde quieras.' },
      { q: '¿Se puede estampar ropa que yo traiga de mi casa?', a: 'Sí, traemos tu prenda y la estampamos con DTF en nuestro taller, revisando antes que la tela sea compatible.' },
    ],
  },
  {
    slug: 'poleras-dry-fit-deportivas',
    title: 'Poleras dry fit personalizadas para deportes y eventos',
    description:
      'Poleras dry fit de poliéster con estampado DTF: transpirables, de secado rápido y resistentes al sol. Ideales para equipos deportivos, running, ciclismo y eventos al aire libre en la Quinta Región.',
    category: 'Productos',
    keywords: ['poleras dry fit', 'poleras dry fit personalizadas', 'poleras deportivas estampadas', 'camisetas para equipos de fútbol', 'ropa deportiva quinta región'],
    date: '2026-08-17',
    sections: [
      { h: 'La polera que el deporte exige', p: 'Las poleras dry fit de poliéster son transpirables, de secado rápido y livianas: la elección natural para running, fútbol, ciclismo, gimnasio y eventos deportivos. Con nuestro DTF textil, el estampado queda firme sobre el poliéster, algo que la sublimación antigua no lograba con colores intensos sobre telas oscuras.' },
      { h: 'Equipos deportivos completos', p: 'Estampamos conjuntos completos para equipos de fútbol, básquetbol, vóleibol y campeonatos amateur: poleras con número y nombre, polerones de banca y gorras del equipo. Cotización por cantidad con descuentos para equipos de Quilpué, Villa Alemana, Valparaíso y Viña del Mar.' },
      { h: 'Colores y diseño sin límite', p: 'Sublimación de colores completos, logos de patrocinadores, degradados y fotografías: en dry fit todo se imprime con calidad fotográfica. Sube tu diseño al editor o pídenos ayuda con el arte.' },
    ],
    faq: [
      { q: '¿Tienen poleras dry fit para deportes?', a: 'Sí, en varios colores, de poliéster transpirable y secado rápido, ideales para deporte y eventos.' },
      { q: '¿Se puede estampar DTF sobre poliéster?', a: 'Sí, el DTF textil funciona perfectamente en poliéster y dry fit, tanto en telas claras como oscuras.' },
      { q: '¿Hacen poleras para equipos de fútbol o campeonatos?', a: 'Sí, con número, nombre y logos de patrocinadores. Cotiza por cantidad para tu equipo.' },
    ],
  },
  {
    slug: 'polerones-hoodies-canguros',
    title: 'Polerones, hoodies y canguros personalizados en Chile',
    description:
      'Polerón crew, canguro y hoodie premium con tu diseño estampado en DTF: algodón de 300-340 gramos, interior felpa, capucha ajustable y bolsillo canguro. Ideal para invierno y merchandising de marca.',
    category: 'Productos',
    keywords: ['polerón personalizado', 'polerón canguro personalizado', 'hoodie personalizado chile', 'polerones cottonext', 'regalo personalizado polerón'],
    date: '2026-08-17',
    sections: [
      { h: 'Tres modelos para cada estilo', p: 'El polerón crew es el clásico de cuello redondo; el canguro suma bolsillo frontal y capucha; el hoodie premium agrega capucha ajustable con cordón y bolsillo canguro. Los tres se estampan con DTF sobre el pecho, la espalda o la manga, en algodón de 300 a 340 gramos con interior de felpa suave.' },
      { h: 'El regalo perfecto que no falla', p: 'Un polerón personalizado con el nombre, el logo o la frase especial es uno de los regalos más valorados en Chile: cumpleaños, aniversarios, día del padre y la madre. Lo estampan desde una unidad y lo despachamos a todo Chile en 2 a 5 días hábiles.' },
      { h: 'Merchandising para tu marca', p: 'Las marcas de ropa emergentes de la Quinta Región usan nuestros polerones como pieza estrella: el DTF sobre algodón grueso da un acabado profesional que compite con las grandes marcas. Combínalo con poleras y gorras para una colección completa.' },
    ],
    faq: [
      { q: '¿Tienen polerones canguro y hoodies?', a: 'Sí: polerón crew, canguro y hoodie premium en algodón de 300-340 gr con interior felpa.' },
      { q: '¿Los polerones se encogen con el lavado?', a: 'Trabajamos con marcas de calidad como Cottonext cuya tela está pre-encogida: no encogen ni destiñen con el lavado correcto.' },
      { q: '¿Puedo estampar el diseño en la espalda completa?', a: 'Sí, en espalda completa (A4 o más), pecho, manga o bolsillo. El DTF permite formatos grandes sin perder detalle.' },
    ],
  },
  {
    slug: 'gorras-personalizadas-estampado',
    title: 'Gorras personalizadas: estampado, bordado y gorra animal malla',
    description:
      'Gorras personalizadas para tu marca o evento: estampado DTF UV sobre visera y frente, gorra animal con malla para bordado, y opciones en todos los colores. Despacho a todo Chile.',
    category: 'Productos',
    keywords: ['gorras personalizadas', 'gorra animal personalizada', 'gorra animal malla bordada', 'estampado de gorras', 'gorras bordadas viña del mar'],
    date: '2026-08-17',
    sections: [
      { h: 'La gorra: el accesorio más vendido de las marcas', p: 'La gorra es la prenda de merchandising con mejor relación costo-impacto: todos la usan, todos la ven. En Estampados DLV personalizamos gorras con DTF UV en la visera y el frente (acabado brillante y resistente), y trabajamos la clásica gorra animal con malla trasera, ideal para bordado.' },
      { h: 'Bordado vs estampado en gorras', p: 'El bordado da textura y prestigio (ideal para logos de empresas y equipos); el DTF UV permite diseños a color completo con degradados y fotografías. Muchos clientes combinan ambos: bordado del logo principal y estampado UV de detalles en la visera.' },
      { h: 'Gorras para eventos y promociones', p: 'Desde 12 unidades para eventos, matrimonios, cumpleaños temáticos y campañas publicitarias. Elige el color de la visera y del cuerpo, agrega tu diseño y recíbelas listas para repartir.' },
    ],
    faq: [
      { q: '¿Venden gorras animal con malla para bordar o estampar?', a: 'Sí, la gorra animal con malla trasera es uno de nuestros productos más pedidos, perfecta para bordado y estampado.' },
      { q: '¿Sirve el DTF UV en gorras?', a: 'Sí, es ideal para la visera y el frente de la gorra: acabado brillante, con relieve y muy resistente al uso diario.' },
      { q: '¿Cuál es el pedido mínimo de gorras?', a: 'Desde 12 unidades para pedidos personalizados; también tenemos gorras lisas sueltas para estampar tú mismo.' },
    ],
  },
  {
    slug: 'uniformes-y-ropa-corporativa',
    title: 'Uniformes y ropa corporativa personalizada para empresas',
    description:
      'Uniformes de trabajo, ropa corporativa y merchandising para empresas con tu logo estampado en DTF: poleras, polerones, delantales y chalecos. Factura para empresas y despacho a todo Chile.',
    category: 'Empresas',
    keywords: ['uniformes para empresas valparaíso', 'ropa de trabajo personalizada', 'estampado uniforme de trabajo', 'merchandising personalizado chile', 'poleras corporativas'],
    date: '2026-08-17',
    sections: [
      { h: 'Uniformes que representan a tu empresa', p: 'Poleras, polerones, chalecos y delantales con el logo de tu empresa estampado en DTF: identificación profesional para retail, restaurantes, bodegas, talleres mecánicos y equipos en terreno. Colores corporativos exactos y tamaños desde S hasta XXXL para todo tu equipo.' },
      { h: 'Factura para empresas y precios por volumen', p: 'Trabajamos directamente con empresas de Valparaíso, Viña del Mar, Quilpué y Villa Alemana: emitimos factura, cotizamos por volumen con descuentos especiales y coordinamos entregas programadas para renovaciones de uniformes.' },
      { h: 'Delantales, lienzos y merchandising extra', p: 'Además de ropa, estampamos delantales para cocinas y cafeterías, lienzos publicitarios, bolsas y accesorios con DTF UV. Todo el merchandising de tu marca en un solo proveedor de la Quinta Región.' },
    ],
    faq: [
      { q: '¿Estampan uniforme de trabajo y ropa corporativa?', a: 'Sí, es uno de nuestros servicios principales: poleras, polerones, chalecos y delantales con logo corporativo.' },
      { q: '¿Hacen facturas para empresas?', a: 'Sí, emitimos factura electrónica para compras corporativas.' },
      { q: '¿Estampan delantales, lienzos o bolsas?', a: 'Sí, todos esos formatos con DTF textil o DTF UV según el material.' },
      { q: '¿Hacen uniformes para empresas y equipos deportivos?', a: 'Sí, con cotización por volumen y descuentos para pedidos corporativos y deportivos.' },
    ],
  },
  {
    slug: 'lanza-tu-marca-de-ropa',
    title: 'Emprendedores: cómo lanzar tu marca de ropa sin stock',
    description:
      'Guía para emprendedores: lanza tu marca de poleras sin invertir en stock usando mockups, gang sheets y maquila de estampado en Quilpué. El flujo completo desde el diseño hasta la venta.',
    category: 'Emprendedores',
    keywords: ['emprendimiento ropa personalizada', 'marca de poleras chile', 'poleras para mi marca', 'maquila de estampados', 'dtf para emprendedores'],
    date: '2026-08-17',
    sections: [
      { h: 'El flujo moderno: vende primero, imprime después', p: 'Ya no necesitas invertir millones en stock para lanzar tu marca. Con nuestro editor de mockups creas las fotos de tus diseños sobre poleras reales, las publicas en Instagram y Facebook, recibes los pedidos y recién entonces imprimes. Riesgo cero, flujo positivo desde el día uno.' },
      { h: 'La maquila de estampados que scaling tu marca', p: 'Cuando los pedidos crecen, nosotros somos tu taller de respaldo: tú vendes y gestionas clientes, nosotros imprimimos los paños DTF y estampamos las prendas con tu etiqueta. Talleres y revendedores de toda la Quinta Región operan así con Estampados DLV como proveedor.' },
      { h: 'Herramientas gratis incluidas', p: 'Mockups gratis en la web, gang sheet builder para optimizar tus metros de impresión, y biblioteca de imágenes listas para usar. Todo lo que necesitas para producir como una marca grande con inversión de emprendedor.' },
    ],
    faq: [
      { q: '¿Sirven como taller maquilador para mi marca de ropa?', a: 'Sí, imprimimos y estampamos para marcas y revendedores: tú vendes, nosotros producimos.' },
      { q: '¿Me ayudan a lanzar mi marca de poleras desde cero?', a: 'Sí: mockups para publicar, gang sheets económicos para imprimir y estampado profesional para despachar.' },
      { q: '¿Pueden estampar para tiendas y revendedores?', a: 'Sí, muchos revendedores de la región trabajan con nosotros. Cotiza tu volumen por WhatsApp.' },
    ],
  },
  {
    slug: 'estampados-en-quilpue',
    title: 'Estampados en Quilpué: tu taller de impresión DTF local',
    description:
      'Estampado de poleras, polerones y gorras en Quilpué, Quinta Región. Taller local con impresión DTF textil y DTF UV, mockups y gang sheets gratis, y despacho a todo Chile.',
    category: 'Local',
    keywords: ['estampados en quilpué', 'estampado de poleras quilpué', 'taller de estampados v región', 'dtf quilpué', 'estampado con plotter quilpué'],
    date: '2026-08-17',
    sections: [
      { h: 'El taller de estampados de tu comuna', p: 'Estampados DLV nace en Quilpué para atender a toda la Quinta Región. Tenemos impresión DTF textil y DTF UV con tres líneas de producción activas: impresión a 300 DPI, corte y aplicación profesional con prensa térmica calibrada.' },
      { h: 'Retiro en taller o despacho a domicilio', p: 'Puedes retirar tu pedido directamente en nuestro taller de Quilpué o recibirlo por despacho courier a todo Chile. Para pedidos urgentes de la comuna coordinamos entrega rápida por WhatsApp.' },
      { h: 'Herramientas digitales incluidas', p: 'Nuestros clientes de Quilpué usan gratis el editor de mockups y el gang sheet builder de la web: diseñan, cotizan y piden desde el celular, sin moverse de la casa.' },
    ],
    faq: [
      { q: '¿Dónde están ubicados exactamente?', a: 'En Quilpué, Quinta Región. La dirección exacta y horarios te los confirmamos por WhatsApp al +56 9 5416 9052.' },
      { q: '¿Puedo retirar mi pedido en Quilpué?', a: 'Sí, tenemos retiro en taller coordinando la hora por WhatsApp.' },
      { q: '¿Qué días y horas atienden?', a: 'Atención de lunes a sábado en horario comercial. Escríbenos y confirmamos disponibilidad.' },
    ],
  },
  {
    slug: 'estampados-villa-alemana',
    title: 'Estampados en Villa Alemana: poleras personalizadas cerca de ti',
    description:
      'Servicio de estampado DTF para Villa Alemana y alrededores: poleras, polerones y gorras personalizadas con despacho rápido desde Quilpué y herramientas online gratis.',
    category: 'Local',
    keywords: ['estampados villa alemana', 'estampado de poleras villa alemana', 'dónde estampar poleras villa alemana', 'poleras personalizadas villa alemana', 'estampados cerca de mí'],
    date: '2026-08-17',
    sections: [
      { h: 'Atención directa para Villa Alemana', p: 'Villa Alemana está a minutos de nuestro taller en Quilpué, por lo que los despachos llegan rápido y el retiro en taller es muy cómodo. Atendemos emprendedores, equipos deportivos y empresas de toda la comuna: desde el cerro La Campana hasta Santa Filomena.' },
      { h: 'Cotiza online y recibe sin salir de casa', p: 'Crea tu mockup en la web, arma tu gang sheet, envía tu pedido por WhatsApp y recibe en 2 a 5 días hábiles. Para pedidos urgentes en Villa Alemana coordinamos entrega prioritaria.' },
      { h: 'La elección de los emprendedores locales', p: 'Emprendedores de Villa Alemana usan nuestro flujo completo: mockup para vender en redes, gang sheet para producir barato y estampado profesional para despachar a sus clientes.' },
    ],
    faq: [
      { q: '¿Hacen estampados en Villa Alemana?', a: 'Sí, atendemos toda Villa Alemana con despacho rápido desde Quilpué y retiro en taller opcional.' },
      { q: '¿Envían a Villa Alemana, Valparaíso o Viña del Mar el mismo día?', a: 'Para pedidos urgentes coordinamos entrega rápida en las comunas vecinas; confirma disponibilidad por WhatsApp.' },
    ],
  },
  {
    slug: 'estampados-valparaiso',
    title: 'Estampados en Valparaíso: impresión DTF para el puerto',
    description:
      'Estampado de poleras y merchandising en Valparaíso: DTF textil y DTF UV para emprendedores, turismo y empresas del puerto. Despacho rápido desde Quilpué y herramientas online gratis.',
    category: 'Local',
    keywords: ['estampados valparaíso', 'poleras estampadas valparaíso', 'estampado valparaíso', 'imprenta de poleras valparaíso', 'dtf puerto valparaíso'],
    date: '2026-08-17',
    sections: [
      { h: 'Del cerro al plan: estampados para el puerto', p: 'Valparaíso es ciudad de emprendedores, artistas y turismo, y el merchandising personalizado mueve esa economía: poleras de los cerros, diseños de artistas locales, souvenirs y uniformes para restaurantes y tours. Nuestro DTF imprime cualquier diseño con calidad fotográfica.' },
      { h: 'Uniformes y merchandising para el turismo', p: 'Hoteles, restaurantes, tours y tiendas de souvenirs del puerto trabajan con nosotros: poleras y polerones con diseños de Valpo, gorras y tazas con DTF UV, y producción por mayor para temporadas altas.' },
      { h: 'Despacho rápido desde Quilpué', p: 'Estando a pocos kilómetros del puerto, nuestros despachos a Valparaíso llegan en 24 a 48 horas. Pedidos urgentes para eventos del puerto se coordinan por WhatsApp.' },
    ],
    faq: [
      { q: '¿Hacen estampados en Valparaíso?', a: 'Sí, atendemos todo Valparaíso: plan y cerros, con despacho rápido desde Quilpué.' },
      { q: '¿Cuál es el mejor lugar para estampar poleras en Valparaíso?', a: 'Estampados DLV atiende Valparaíso con impresión DTF profesional, mockups gratis y despacho en 24-48h.' },
    ],
  },
  {
    slug: 'estampados-vina-del-mar',
    title: 'Estampados en Viña del Mar: impresión rápida de poleras',
    description:
      'Estampado DTF en Viña del Mar: poleras, dry fit y gorras personalizadas para la ciudad jardín. Impresión rápida, mockups gratis online y despacho en 24-48 horas desde Quilpué.',
    category: 'Local',
    keywords: ['estampados viña del mar', 'poleras estampadas viña del mar', 'estampado dtf viña del mar', 'impresión rápida de poleras quinta región', 'estampado de poleras barato viña del mar'],
    date: '2026-08-17',
    sections: [
      { h: 'Impresión rápida para la ciudad jardín', p: 'Viña del Mar concentra eventos deportivos, festivales y vida comercial activa todo el año, y todos necesitan merchandising rápido: poleras de eventos, dry fit para maratones y campeonatos, uniformes para gastronomía de la costa.' },
      { h: 'Pedidos urgentes en 24-48 horas', p: 'Para eventos en Viña del Mar coordinamos producción express: imprimes hoy, estampamos mañana y despachamos en 24 a 48 horas. La combinación de nuestro taller en Quilpué y la cercanía hace posible lo urgente.' },
      { h: 'Deportes de costa: dry fit y poleras técnicas', p: 'Running en el borde costero, vóleibol playa, ciclismo: las poleras dry fit personalizadas son las más pedidas en Viña, con estampado DTF resistente al sol y al lavado constante.' },
    ],
    faq: [
      { q: '¿Hacen estampados en Viña del Mar?', a: 'Sí, con despacho en 24-48 horas desde Quilpué y coordinación express para eventos.' },
      { q: '¿Tienen servicio urgente o express?', a: 'Sí, para eventos y pedidos de última hora coordinamos producción express por WhatsApp.' },
    ],
  },
  {
    slug: 'poleras-para-eventos',
    title: 'Poleras para eventos, matrimonios y equipos deportivos',
    description:
      'Poleras personalizadas para cumpleaños, despedidas de soltero, matrimonios, eventos empresariales y equipos deportivos. Desde una unidad o por mayor, con diseño incluido.',
    category: 'Eventos',
    keywords: ['poleras para cumpleaños personalizadas', 'poleras para eventos', 'poleras para equipos deportivos', 'poleras matrimonio', 'estampados para eventos'],
    date: '2026-08-17',
    sections: [
      { h: 'El uniforme de la celebración', p: 'Las poleras personalizadas son el alma de los eventos: cumpleaños temáticos con la frase del cumpleañero, despedidas de soltero con diseños atrevidos, matrimonios con poleras para la mesa dulce y el team de novios, y eventos empresariales con el logo de la compañía.' },
      { h: 'Equipos y campeonatos', p: 'Campeonatos de fútbol, vóleibol, básquetbol y carreras: poleras con número y nombre, dry fit transpirables para competencia, polerones de banca para el invierno y gorras del equipo. Cotización por cantidad con entrega antes de la fecha del evento.' },
      { h: 'Diseño incluido sin costo extra', p: '¿No tienes el diseño listo? Nuestro equipo te ayuda con el arte: textos, nombres, números y logos organizados para que cada polera salga perfecta. Sube tu idea por WhatsApp y te enviamos la maqueta antes de imprimir.' },
    ],
    faq: [
      { q: '¿Hacen poleras para cumpleaños o despedidas de soltero?', a: 'Sí, son de nuestros pedidos más divertidos: diseñamos la frase, el número y los colores que quieras.' },
      { q: '¿Estampan poleras para eventos y matrimonios?', a: 'Sí, con producción programada para llegar antes de la fecha. Incluye diseño y coordinación.' },
      { q: '¿Cuántas unidades necesito para tener buen precio por mayor?', a: 'Desde 12 unidades ya aplican precios de volumen; a mayor cantidad, mejor precio por polera.' },
    ],
  },
  {
    slug: 'concurso-estampados-dlv',
    title: 'Concurso Estampados DLV: gana premios personalizados gratis',
    description:
      'Participa en el sorteo de Estampados DLV: primer lugar un polerón personalizado, segundo una polera y tercero una gorra. Sorteo el 12 de noviembre de 2026. Comparte la web, síguenos y registra tus datos.',
    category: 'Concurso',
    keywords: ['concurso polera personalizada chile', 'sorteo estampados dlv', 'regalo polerón personalizado', 'concurso estampados', 'ganar polera personalizada'],
    date: '2026-08-17',
    sections: [
      { h: 'Tres premios personalizados para tres ganadores', p: 'Primer lugar: un polerón personalizado con tu diseño. Segundo lugar: una polera personalizada. Tercer lugar: una gorra personalizada. Todos los premios se estampan con el diseño que elijas, en el color que prefieras, con envío incluido a cualquier punto de Chile.' },
      { h: 'Cómo participar en tres pasos', p: 'Comparte la página del concurso en Facebook y en WhatsApp subiendo las capturas de pantalla, síguenos en nuestras redes y registra tu nombre, correo y teléfono. La participación es 100% gratuita y te llegará un correo de confirmación con tu registro.' },
      { h: 'Sorteo visible y transparente', p: 'El sorteo se realiza de forma automática y visible al término del plazo, el 12 de noviembre de 2026, con transmisión grabable para que todos vean cómo se eligen los ganadores. Los ganadores reciben un correo de felicitación y las instrucciones para reclamar su premio escribiendo al WhatsApp +56 9 5416 9052.' },
    ],
    faq: [
      { q: '¿Cómo participo en el concurso de estampados?', a: 'Comparte la web en Facebook y WhatsApp con capturas, síguenos en redes y registra tus datos en estampadosdlv.com/concurso.' },
      { q: '¿Qué premios tiene el sorteo?', a: '1° lugar: polerón personalizado. 2° lugar: polera personalizada. 3° lugar: gorra personalizada. Todos con tu diseño.' },
      { q: '¿Hasta cuándo dura el concurso?', a: 'El sorteo se realiza el 12 de noviembre de 2026. Participa antes de esa fecha.' },
      { q: '¿Es gratis la participación del sorteo?', a: 'Totalmente gratis. Solo piden compartir la web en dos redes y registrar tus datos.' },
      { q: '¿Cuándo se anuncian los ganadores del sorteo?', a: 'Automáticamente al terminar el plazo, el 12 de noviembre, con un sorteo visible y grabable.' },
      { q: '¿A qué WhatsApp escribo para participar y cotizar?', a: 'Al +56 9 5416 9052 (Sandra Vásquez). Participación, cotizaciones y pedidos por ese mismo número.' },
    ],
  },
];

export function getArticle(slug) {
  return articles.find(a => a.slug === slug);
}

export function getArticleJsonLd(article) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        datePublished: article.date,
        dateModified: article.date,
        author: { '@type': 'Organization', name: 'Estampados DLV' },
        publisher: { '@type': 'Organization', name: 'Estampados DLV' },
        mainEntityOfPage: `https://estampadosdlv.com/blog/${article.slug}`,
        keywords: article.keywords.join(', '),
      },
      {
        '@type': 'FAQPage',
        mainEntity: article.faq.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}
