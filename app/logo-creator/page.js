import Script from "next/script";

export const metadata = {
  title: "Creador de Logos Gratis | Estampados DLV",
  description:
    "Crea el logo de tu marca gratis con inteligencia artificial. Elige estilo, colores y descarga tu kit de marca completo (PNG, SVG y PDF). Servicio gratuito de Estampados DLV, Quilpué.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Creador de Logos Gratis | Estampados DLV",
    description:
      "Crea el logo de tu marca gratis con IA. Descarga tu kit de marca completo en segundos.",
    url: "https://estampadosdlv.com/logo-creator",
    siteName: "Estampados DLV",
  },
};

const STYLES = [
  { id: "Minimal", label: "Minimal", desc: "Limpio y atemporal" },
  { id: "Geometric", label: "Geométrico", desc: "Preciso y moderno" },
  { id: "Gradiente", label: "Gradiente", desc: "Contemporáneo y dinámico" },
  { id: "Mascota", label: "Mascota", desc: "Amigable y expresivo" },
  { id: "Dibujado a mano", label: "Dibujado a mano", desc: "Orgánico y artesanal" },
  { id: "Lujo", label: "Lujo", desc: "Elegante y premium" },
  { id: "Retro", label: "Retro", desc: "Vintage y nostálgico" },
  { id: "3D", label: "3D", desc: "Con profundidad" },
];

const TYPES = [
  { id: "icon-name", label: "Ícono + Nombre", desc: "Combinado" },
  { id: "wordmark", label: "Solo Nombre", desc: "Tipografía" },
  { id: "monogram", label: "Monograma", desc: "Iniciales" },
  { id: "emblema", label: "Emblema", desc: "Escudo/sello" },
  { id: "icon", label: "Solo Ícono", desc: "Símbolo" },
  { id: "abstracto", label: "Abstracto", desc: "Geométrico" },
];

const COLORS = [
  { id: "auto", label: "Auto", hex: "linear-gradient(135deg,#eee 50%,#bbb 50%)" },
  { id: "#19337A", label: "Azul", hex: "#19337A" },
  { id: "#C41E24", label: "Rojo", hex: "#C41E24" },
  { id: "#E8A838", label: "Dorado", hex: "#E8A838" },
  { id: "#1E7832", label: "Verde", hex: "#1E7832" },
  { id: "#7B2CBF", label: "Morado", hex: "#7B2CBF" },
  { id: "#F472B6", label: "Rosa", hex: "#F472B6" },
  { id: "#EA580C", label: "Naranjo", hex: "#EA580C" },
  { id: "#0F172A", label: "Negro", hex: "#0F172A" },
];

const DETAILS = [
  { id: "Minimal", label: "Muy simple" },
  { id: "Balanceado", label: "Balanceado" },
  { id: "Detallado", label: "Detallado" },
];

const BGS = [
  { id: "auto", label: "Auto" },
  { id: "#FFFFFF", label: "Blanco" },
  { id: "#0F172A", label: "Oscuro" },
];

export default function LogoCreatorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50">
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" strategy="beforeInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js" strategy="beforeInteractive" />

      {/* Header */}
      <header className="border-b border-orange-100 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center text-white font-bold">
              E
            </div>
            <span className="font-bold text-slate-800">
              Estampados <span className="text-orange-600">DLV</span>
            </span>
          </a>
          <span className="text-sm text-slate-500 hidden sm:block">
            Servicio gratuito · Creador de Logos con IA
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero */}
        <section className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">
            Crea el logo de tu marca <span className="text-orange-600">gratis con IA</span>
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Escribe el nombre de tu marca, elige un estilo y descarga tu kit de marca completo
            (PNG transparente, SVG vectorial y PDF) en segundos. ¿Te gustó? Después lo estampamos
            en tus productos con{" "}
            <a href="/tienda" className="text-orange-600 font-medium hover:underline">
              Estampados DLV
            </a>
            .
          </p>
        </section>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Formulario */}
          <section className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Nombre de tu marca *
              </label>
              <input
                id="logo-name"
                type="text"
                maxLength={120}
                placeholder="Ej: Cafetería Don Pedro"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none"
              />

              <label className="block text-sm font-semibold text-slate-700 mb-1.5 mt-5">
                Estilo
              </label>
              <div className="grid grid-cols-2 gap-2" id="logo-styles">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-style={s.id}
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-left hover:border-orange-400 hover:bg-orange-50 transition"
                  >
                    <span className="block font-medium text-sm text-slate-800">{s.label}</span>
                    <span className="block text-[11px] text-slate-500">{s.desc}</span>
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold text-slate-700 mb-1.5 mt-5">
                Tipo de logo
              </label>
              <div className="grid grid-cols-3 gap-2" id="logo-types">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-type={t.id}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-center hover:border-orange-400 hover:bg-orange-50 transition"
                  >
                    <span className="block text-[12px] font-medium text-slate-800">{t.label}</span>
                    <span className="block text-[10px] text-slate-500">{t.desc}</span>
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold text-slate-700 mb-1.5 mt-5">
                Color principal
              </label>
              <div className="flex flex-wrap gap-2" id="logo-colors">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-color={c.id}
                    title={c.label}
                    className="w-9 h-9 rounded-full border-2 border-slate-200 hover:border-orange-500 transition"
                    style={{ background: typeof c.hex === "string" && c.hex.startsWith("#") ? c.hex : c.hex }}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fondo</label>
                  <select
                    id="logo-bg"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                  >
                    {BGS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Detalle</label>
                  <select
                    id="logo-detail"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                  >
                    {DETAILS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 mt-4 text-sm text-slate-700">
                <input type="checkbox" id="logo-mono" className="rounded border-slate-300" />
                Monocromo (un solo color)
              </label>

              <label className="block text-sm font-semibold text-slate-700 mb-1.5 mt-5">
                Dirección adicional (opcional)
              </label>
              <textarea
                id="logo-extra"
                rows={2}
                maxLength={500}
                placeholder="Ej: que incluya una taza de café, letra cursiva..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none resize-none"
              />

              <button
                id="logo-generate"
                type="button"
                className="w-full mt-5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-bold py-3 px-4 hover:opacity-90 transition disabled:opacity-50"
              >
                Generar logos gratis ✨
              </button>
              <p className="text-[11px] text-slate-500 mt-2 text-center">
                Límite: 3 generaciones por dispositivo al día (protege el servicio gratuito).
              </p>
            </div>
          </section>

          {/* Resultados */}
          <section className="lg:col-span-3">
            <div
              id="logo-results"
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 min-h-[420px] flex items-center justify-center"
            >
              <div id="logo-empty" className="text-center text-slate-400">
                <svg className="w-20 h-20 mx-auto mb-3 text-slate-200" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                <p className="font-medium">Aquí aparecerán tus logos</p>
                <p className="text-sm">Completa el formulario y presiona generar</p>
              </div>
              <div id="logo-loading" className="hidden text-center">
                <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="font-medium text-slate-700" id="logo-loading-text">
                  Generando 4 variantes con IA...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  La IA genera varios diseños y revisa la ortografía. Puede tardar 1-3 minutos.
                </p>
              </div>
              <div id="logo-grid" className="hidden grid grid-cols-2 gap-3 w-full" />
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-orange-100 mt-12 py-6">
        <p className="text-center text-sm text-slate-500">
          Servicio gratuito de Estampados DLV · Quilpué, Quinta Región ·{" "}
          <a href="https://wa.me/56954169052" className="text-orange-600 hover:underline">
            +56 9 5416 9052
          </a>
        </p>
      </footer>

      <Script id="logo-creator-script" strategy="afterInteractive">{`
(function () {
  var state = { style: "Minimal", type: "icon-name", color: "auto", images: [] };

  function setOpt(containerId, stateKey, selector) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(selector).forEach(function (b) {
          b.classList.remove("!border-orange-500", "!bg-orange-50");
          b.style.borderColor = "";
        });
        btn.classList.add("!border-orange-500");
        btn.style.borderColor = "#f97316";
        state[stateKey] = btn.dataset[Object.keys(btn.dataset)[0]];
      });
    });
  }

  function bindBtn() {
    var styles = document.querySelectorAll("#logo-styles button");
    styles.forEach(function (btn) {
      btn.addEventListener("click", function () {
        styles.forEach(function (b) { b.style.borderColor = ""; b.classList.remove("!border-orange-500"); });
        btn.style.borderColor = "#f97316";
        state.style = btn.dataset.style;
      });
    });
    var types = document.querySelectorAll("#logo-types button");
    types.forEach(function (btn) {
      btn.addEventListener("click", function () {
        types.forEach(function (b) { b.style.borderColor = ""; });
        btn.style.borderColor = "#f97316";
        state.type = btn.dataset.type;
      });
    });
    var colors = document.querySelectorAll("#logo-colors button");
    colors.forEach(function (btn) {
      btn.addEventListener("click", function () {
        colors.forEach(function (b) { b.style.borderColor = ""; });
        btn.style.borderColor = "#f97316";
        state.color = btn.dataset.color;
      });
    });
  }

  function makeTransparent(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    var image = ctx.getImageData(0, 0, w, h);
    var d = image.data;
    var clear = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 16) clear++;
    if (clear / (w * h) > 0.5) return c;
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
    var br = 0, bgc = 0, bb = 0, nc = 0;
    corners.forEach(function (cp) {
      if (d[cp + 3] < 200) return;
      br += d[cp]; bgc += d[cp + 1]; bb += d[cp + 2]; nc++;
    });
    if (nc === 0) return c;
    br /= nc; bgc /= nc; bb /= nc;
    var dist = function (p) {
      return Math.abs(d[p * 4] - br) + Math.abs(d[p * 4 + 1] - bgc) + Math.abs(d[p * 4 + 2] - bb);
    };
    var borderDists = [];
    var x, y;
    for (x = 0; x < w; x += 2) {
      if (d[x * 4 + 3] >= 200) borderDists.push(dist(x));
      var q = (h - 1) * w + x;
      if (d[q * 4 + 3] >= 200) borderDists.push(dist(q));
    }
    for (y = 0; y < h; y += 2) {
      var l = y * w, r = y * w + w - 1;
      if (d[l * 4 + 3] >= 200) borderDists.push(dist(l));
      if (d[r * 4 + 3] >= 200) borderDists.push(dist(r));
    }
    borderDists.sort(function (a, b) { return a - b; });
    var p95 = borderDists.length ? borderDists[Math.floor(borderDists.length * 0.95)] : 0;
    var tol = Math.min(Math.max(90, p95 * 1.4 + 18), 168);
    var visited = new Uint8Array(w * h);
    var stack = new Int32Array(w * h);
    var sp = 0;
    var seed = function (p) {
      if (visited[p]) return;
      if (d[p * 4 + 3] < 16 || dist(p) < tol) { visited[p] = 1; stack[sp++] = p; }
    };
    for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp > 0) {
      var p = stack[--sp];
      d[p * 4 + 3] = 0;
      x = p % w; y = (p - x) / w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
    ctx.putImageData(image, 0, 0);
    return c;
  }

  function imageToSvg(canvas) {
    // Vectorización simple: trazado por contorno (outline) usando potrace-like
    // threshold → generamos SVG con el contorno de las regiones oscuras/coloreadas.
    // Para simplicidad y robustez, usamos un approach por filas (rect-path) con
    // merged rectangles. Aceptable para logos con áreas planas.
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, w, h).data;
    var scale = 4; // trabajar a 1/4 para menos nodos
    var sw = Math.ceil(w / scale), sh = Math.ceil(h / scale);
    var grid = new Uint8Array(sw * sh);
    for (var yy = 0; yy < sh; yy++) {
      for (var xx = 0; xx < sw; xx++) {
        var px = Math.min(w - 1, xx * scale), py = Math.min(h - 1, yy * scale);
        var idx = (py * w + px) * 4;
        var a = data[idx + 3];
        grid[yy * sw + xx] = a > 40 ? 1 : 0;
      }
    }
    var paths = [];
    for (var y2 = 0; y2 < sh; y2++) {
      var rowStart = null;
      for (var x2 = 0; x2 <= sw; x2++) {
        var v = x2 < sw ? grid[y2 * sw + x2] : 0;
        if (v && rowStart === null) rowStart = x2;
        else if (!v && rowStart !== null) {
          paths.push("M" + rowStart + "," + y2 + "h" + (x2 - rowStart) + "v1h" + (rowStart - x2) + "Z");
          rowStart = null;
        }
      }
    }
    var vb = "0 0 " + sw + " " + sh;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + w + '" height="' + h + '">' +
      '<rect width="' + sw + '" height="' + sh + '" fill="white"/>' +
      '<path d="' + paths.join("") + '" fill="currentColor"/>' +
      '</svg>';
  }

  async function downloadKit(name) {
    if (typeof JSZip === "undefined") {
      alert("No se pudo cargar la herramienta de descarga. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    var zip = new JSZip();
    var safe = (name || "logo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo";
    zip.file(safe + "/LEEME.txt", "Kit de marca generado por Estampados DLV - Creador de Logos\\n" +
      "PNG: imagen con fondo transparente (usa el logo en cualquier fondo).\\n" +
      "SVG: versión vectorial (ábrela en illustrator/freelogodesign y escala sin perder calidad).\\n" +
      "PDF: ficha de marca con el logo principal.\\n" +
      "Variante clara: versión recolorada para fondos oscuros.");
    var main = state.images[0];
    if (!main) return;
    var img = await loadImage(main.base64);
    var t = makeTransparent(img);
    zip.file(safe + "/" + safe + ".png", await canvasToBlob(t));
    zip.file(safe + "/" + safe + ".svg", imageToSvg(t));
    // Variante para fondos oscuros: invertir tinta oscura a blanca
    var dark = document.createElement("canvas");
    dark.width = t.width; dark.height = t.height;
    var dctx = dark.getContext("2d", { willReadFrequently: true });
    dctx.drawImage(t, 0, 0);
    var dd = dctx.getImageData(0, 0, dark.width, dark.height);
    var ddData = dd.data;
    for (var i = 0; i < ddData.length; i += 4) {
      if (ddData[i + 3] === 0) continue;
      var luma = (0.2126 * ddData[i] + 0.7152 * ddData[i + 1] + 0.0722 * ddData[i + 2]) / 255;
      if (luma < 0.34) {
        var k = Math.min(1, (0.34 - luma) / (0.34 - 0.18));
        ddData[i] = Math.round(ddData[i] + (255 - ddData[i]) * k);
        ddData[i + 1] = Math.round(ddData[i + 1] + (255 - ddData[i + 1]) * k);
        ddData[i + 2] = Math.round(ddData[i + 2] + (255 - ddData[i + 2]) * k);
      }
    }
    dctx.putImageData(dd, 0, 0);
    zip.file(safe + "/" + safe + "-fondo-oscuro.png", await canvasToBlob(dark));
    // PDF básico con el logo centrado
    try {
      var pdfImg = await canvasToBlob(t);
      var url = URL.createObjectURL(pdfImg);
      var pdf = new jspdf.jsPDF({ unit: "mm", format: "a4" });
      pdf.setFontSize(20);
      pdf.setTextColor(30, 30, 30);
      pdf.text(name || "Mi marca", 105, 30, { align: "center" });
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text("Kit de marca generado por Estampados DLV", 105, 38, { align: "center" });
      pdf.addImage(url, "PNG", 55, 55, 100, 100);
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      pdf.text("Contacto: Estampados DLV - Quilpué - +56 9 5416 9052", 105, 270, { align: "center" });
      zip.file(safe + "/" + safe + "-ficha-marca.pdf", pdf.output("blob"));
      URL.revokeObjectURL(url);
    } catch (e) { console.warn("PDF skipped:", e); }
    var blob = await zip.generateAsync({ type: "blob" });
    if (typeof saveAs === "function") saveAs(blob, safe + "-kit-marca.zip");
    else { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = safe + "-kit-marca.zip"; a.click(); }
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("img")); };
      img.src = src;
    });
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("blob")); }, "image/png");
    });
  }

  document.getElementById("logo-generate").addEventListener("click", async function () {
    var name = (document.getElementById("logo-name").value || "").trim();
    if (name.length < 2) { alert("Escribe el nombre de tu marca (mínimo 2 caracteres)."); return; }
    var btn = document.getElementById("logo-generate");
    btn.disabled = true;
    document.getElementById("logo-empty").classList.add("hidden");
    document.getElementById("logo-grid").classList.add("hidden");
    document.getElementById("logo-loading").classList.remove("hidden");

    var body = {
      companyName: name,
      selectedStyle: state.style,
      logoType: state.type,
      primaryColor: state.color,
      backgroundColor: document.getElementById("logo-bg").value,
      detailLevel: document.getElementById("logo-detail").value,
      monochrome: document.getElementById("logo-mono").checked,
      additionalInfo: (document.getElementById("logo-extra").value || "").trim() || undefined,
    };
    try {
      var res = await fetch("/api/logo-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        var je = await res.json();
        alert(je.error || "Límite diario alcanzado. Vuelve mañana.");
        return;
      }
      if (!res.ok) { var errTxt = await res.text(); alert("Error: " + errTxt.slice(0, 200)); return; }
      var json = await res.json();
      state.images = json.images || [];
      var grid = document.getElementById("logo-grid");
      grid.innerHTML = "";
      if (state.images.length === 0) { alert("La IA no pudo generar logos. Intenta con otro nombre o estilo."); return; }
      state.images.forEach(function (im, idx) {
        var card = document.createElement("div");
        card.className = "rounded-xl border border-slate-200 overflow-hidden bg-white";
        var img = document.createElement("img");
        img.src = im.base64;
        img.className = "w-full aspect-square object-contain bg-white";
        img.alt = "Logo variante " + (idx + 1);
        var bar = document.createElement("div");
        bar.className = "flex gap-1 p-1.5 border-t border-slate-100";
        var dl = document.createElement("button");
        dl.className = "flex-1 rounded-md bg-orange-500 text-white text-xs font-semibold py-1.5 hover:bg-orange-600";
        dl.textContent = "PNG";
        dl.addEventListener("click", function () {
          var a = document.createElement("a");
          a.href = im.base64;
          a.download = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "logo") + "-v" + (idx + 1) + ".png";
          a.click();
        });
        var use = document.createElement("button");
        use.className = "flex-1 rounded-md border border-orange-300 text-orange-600 text-xs font-semibold py-1.5 hover:bg-orange-50";
        use.textContent = "Kit completo";
        use.addEventListener("click", function () { downloadKit(name); });
        bar.appendChild(dl);
        bar.appendChild(use);
        card.appendChild(img);
        card.appendChild(bar);
        grid.appendChild(card);
      });
      document.getElementById("logo-loading").classList.add("hidden");
      grid.classList.remove("hidden");
      grid.classList.add("grid");
      document.getElementById("logo-results").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      alert("Error de conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      btn.disabled = false;
    }
  });

  // jsPDF desde CDN (solo se carga si el usuario exporta)
  window.addEventListener("load", function () {
    if (typeof jspdf === "undefined") {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      document.head.appendChild(s);
    }
  });

  bindBtn();
})();
      `}</Script>
    </div>
  );
}
