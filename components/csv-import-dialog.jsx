'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Upload, FileText, Download, Loader2, CheckCircle2, XCircle, AlertTriangle, FileUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

// ============================================================================
// CsvImportDialog — Import masivo desde CSV para productos o insumos.
//
// PARSER PROPIO (simple, sin dependencias externas):
//  - Primera fila = headers
//  - Separador: coma (,)
//  - Comillas dobles para escapar comas dentro de campos
//  - Fila vacía → se ignora
// ============================================================================

const TEMPLATES = {
  products: {
    title: 'Productos comerciales',
    endpoint: '/api/products/bulk',
    headers: ['name', 'sku', 'category', 'basePrice', 'cost', 'description', 'variant_name', 'variant_width_cm', 'variant_length_cm', 'variant_size', 'variant_color', 'variant_price', 'variant_stock'],
    sample: `name,sku,category,basePrice,cost,description,variant_name,variant_width_cm,variant_length_cm,variant_size,variant_color,variant_price,variant_stock
"Polera Bambu Premium",POL-BAM,apparel,14990,7000,"Polera 100% bambu","Talla S / Negro",,,S,Negro,14990,10
"Polera Bambu Premium",POL-BAM,apparel,14990,7000,"Polera 100% bambu","Talla M / Negro",,,M,Negro,14990,15
"DTF TEXTIL 001",DTF-T001,dtf_textil,2500,1200,"DTF Textil Premium","28x10",28,10,,,2500,50
"DTF TEXTIL 001",DTF-T001,dtf_textil,2500,1200,"DTF Textil Premium","28x20",28,20,,,4500,50`,
    // Un producto por combinacion name+sku, sus variantes se agrupan
  },
  supplies: {
    title: 'Insumos de producción',
    endpoint: '/api/inventory/supplies/bulk',
    headers: ['name', 'code', 'type', 'unit', 'currentQuantity', 'minAlert', 'cost', 'supplier'],
    sample: `name,code,type,unit,currentQuantity,minAlert,cost,supplier
"Tinta DTF Naranjo 500ml",INK-ORG-1,ink_yellow,ml,500,150,60,"InkPro Chile"
"Papel Transfer A4",PAP-A4,other,unit,200,50,120,"DTF Chile SPA"`,
  },
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = false;
        } else cur += ch;
      } else {
        if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') inQuote = true;
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cells = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return obj;
  });
  return { headers, rows };
}

// Transforma rows del CSV al formato esperado por el endpoint
function rowsToItems(rows, kind) {
  if (kind === 'products') {
    // Agrupar por name+sku
    const map = new Map();
    rows.forEach(r => {
      const key = `${r.name}|${r.sku || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          name: r.name, sku: r.sku, category: r.category,
          basePrice: Number(r.basePrice) || 0, cost: Number(r.cost) || 0,
          description: r.description || '', variants: [],
        });
      }
      const prod = map.get(key);
      const hasVariant = r.variant_name || r.variant_size || r.variant_color || r.variant_width_cm || r.variant_length_cm;
      if (hasVariant) {
        const attrs = {};
        // DTF: ancho/largo en cm
        if (r.variant_width_cm)  attrs.widthCm = Number(r.variant_width_cm) || 0;
        if (r.variant_length_cm) attrs.lengthCm = Number(r.variant_length_cm) || 0;
        // Ropa: talla/color
        if (r.variant_size)  attrs.size = r.variant_size;
        if (r.variant_color) attrs.color = r.variant_color;
        prod.variants.push({
          name: r.variant_name || (r.variant_width_cm || r.variant_length_cm
            ? `${r.variant_width_cm || '?'}x${r.variant_length_cm || '?'}cm`
            : [r.variant_size, r.variant_color].filter(Boolean).join(' / ') || 'Único'),
          attributes: attrs,
          price: Number(r.variant_price) || Number(r.basePrice) || 0,
          initialStock: Number(r.variant_stock) || 0,
        });
      }
    });
    return Array.from(map.values());
  }

  // supplies
  return rows.map(r => ({
    name: r.name, code: r.code, type: r.type, unit: r.unit,
    currentQuantity: Number(r.currentQuantity) || 0,
    minAlert: Number(r.minAlert) || 0,
    cost: Number(r.cost) || 0,
    supplier: r.supplier || '',
  }));
}

export function CsvImportDialog({ kind = 'products', onImported, trigger }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const tpl = TEMPLATES[kind];

  const reset = () => { setText(''); setPreview(null); setResult(null); };

  const handleFile = async (file) => {
    if (!file) return;
    const txt = await file.text();
    setText(txt);
    doPreview(txt);
  };

  const doPreview = (txtOverride) => {
    const parsed = parseCSV(txtOverride ?? text);
    setPreview(parsed);
    setResult(null);
  };

  const doImport = async () => {
    if (!preview) return doPreview();
    const items = rowsToItems(preview.rows, kind);
    setImporting(true);
    try {
      const r = await fetch(tpl.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
      onImported?.(data);
      toast.success(`Importados ${data.created}/${data.total}`);
    } catch (e) {
      toast.error('Error al importar', { description: e.message });
    } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([tpl.sample], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <FileUp className="h-3.5 w-3.5 mr-1.5" />Importar CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {tpl.title} desde CSV</DialogTitle>
        </DialogHeader>

        {/* Header con template download */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />Columnas requeridas
            </div>
            <div className="mt-1 font-mono">{tpl.headers.join(', ')}</div>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Descargar plantilla
          </Button>
        </div>

        {/* Upload / paste */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Subí un archivo</div>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-slate-50 p-4 text-center transition-all"
            >
              <Upload className="h-5 w-5 text-slate-400 mx-auto" />
              <div className="mt-2 text-xs text-slate-600">Click para seleccionar .csv</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">O pegalo aquí</div>
            <Textarea
              rows={5}
              placeholder={tpl.sample.split('\n')[0]}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-[11px]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => doPreview()} disabled={!text.trim()}>
            Vista previa
          </Button>
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border border-blue-200">
                {preview.rows.length} filas detectadas
              </Badge>
              {kind === 'products' && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 border border-orange-200">
                  {rowsToItems(preview.rows, 'products').length} producto{rowsToItems(preview.rows, 'products').length !== 1 && 's'} único{rowsToItems(preview.rows, 'products').length !== 1 && 's'}
                </Badge>
              )}
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>{preview.headers.map(h => <th key={h} className="text-left px-2 py-1.5 font-semibold text-slate-600">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {preview.headers.map(h => (
                        <td key={h} className="px-2 py-1.5 text-slate-700 truncate max-w-[120px]">{row[h] || <span className="text-slate-300">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                  {preview.rows.length > 20 && (
                    <tr><td colSpan={preview.headers.length} className="text-center text-slate-500 italic py-2">
                      +{preview.rows.length - 20} filas más…
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`rounded-lg p-3 border ${result.errors?.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              {result.errors?.length > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              <div className="text-sm font-semibold">
                Importados: {result.created} de {result.total}
              </div>
            </div>
            {result.errors?.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="font-medium">{e.item}:</span> {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
          <Button onClick={doImport} disabled={importing || !preview || preview.rows.length === 0} className="bg-orange-500 hover:bg-orange-600">
            {importing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importando…</> : `Importar ${preview?.rows?.length || 0} filas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CsvImportDialog;
