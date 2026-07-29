'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Percent, Loader2, TrendingUp, Store, RefreshCw, AlertTriangle, Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

const SUPPLIER_NAMES = {
  cottonext: 'Cottonext',
  textilryu: 'Textil Ryu',
  treck: 'Treck',
};

const SUPPLIER_COLORS = {
  cottonext: 'bg-green-100 text-green-800 border-green-300',
  textilryu: 'bg-blue-100 text-blue-800 border-blue-300',
  treck: 'bg-purple-100 text-purple-800 border-purple-300',
};

export default function PricingPanel() {
  const [summary, setSummary] = useState(null);
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    providers: ['cottonext', 'textilryu', 'treck'],
    newMarkup: 40,
    applyTo: 'suppliers',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, rulesRes] = await Promise.all([
        fetch('/api/pricing/summary'),
        fetch('/api/pricing/rules'),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (rulesRes.ok) {
        const r = await rulesRes.json();
        setRules(r.rules || {});
      }
    } catch {
      toast.error('Error al cargar datos de pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const toggleProvider = (provider) => {
    setAdjustForm(prev => {
      const providers = prev.providers.includes(provider)
        ? prev.providers.filter(p => p !== provider)
        : [...prev.providers, provider];
      return { ...prev, providers };
    });
  };

  const applyAdjustment = async () => {
    if (adjustForm.providers.length === 0 && adjustForm.applyTo === 'suppliers') {
      toast.warning('Selecciona al menos un proveedor');
      return;
    }
    setApplying(true);
    setShowConfirm(false);
    try {
      const res = await fetch('/api/pricing/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(`${data.updated} productos actualizados con markup ${adjustForm.newMarkup}%`);
      loadData();
    } catch (e) {
      toast.error(e.message || 'Error al aplicar ajuste');
    } finally {
      setApplying(false);
    }
  };

  const calcExample = () => {
    const cost = 2000;
    const markup = adjustForm.newMarkup;
    const raw = Math.round(cost * (1 + markup / 100));
    const nearest10 = Math.round(raw / 10) * 10;
    const lastTwo = nearest10 % 100;
    let rounded;
    if (lastTwo === 0 || lastTwo === 100) rounded = nearest10 - 10;
    else if (lastTwo <= 40) rounded = nearest10 - lastTwo - 10;
    else if (lastTwo >= 50 && lastTwo <= 89) rounded = nearest10 + (90 - lastTwo);
    else rounded = nearest10;
    return { raw, rounded };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
          <Percent className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900 text-lg">Margen de Ganancia</h2>
          <p className="text-xs text-slate-500">Ajusta el % de ganancia sobre el costo del proveedor sin reimportar catalogo</p>
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando resumen de precios...
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total */}
          <Card className="border-slate-200/70">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Store className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-500">Total Productos</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{summary.totalProducts}</div>
              <div className="text-xs text-slate-500">{summary.totalVariants} variantes</div>
            </CardContent>
          </Card>

          {/* Manual */}
          <Card className="border-slate-200/70">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-500">Creados manualmente</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{summary.manual.count}</div>
              <div className="text-xs text-slate-500">Precio prom: ${summary.manual.avgPrice?.toLocaleString('es-CL')}</div>
            </CardContent>
          </Card>

          {/* By supplier */}
          {summary.bySupplier.map(s => (
            <Card key={s.supplier} className="border-slate-200/70">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">{SUPPLIER_NAMES[s.supplier] || s.supplier}</span>
                  <Badge className={`text-[10px] ${SUPPLIER_COLORS[s.supplier] || 'bg-slate-100 text-slate-800'}`}>
                    Markup {s.avgMarkup}%
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-slate-900">{s.count}</div>
                <div className="text-xs text-slate-500">
                  ${s.minPrice?.toLocaleString('es-CL')} — ${s.maxPrice?.toLocaleString('es-CL')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Ajuste de Markup */}
      <Card className="border-slate-200/70">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h3 className="font-bold text-slate-900">Ajustar margen de ganancia</h3>
          </div>

          <div className="space-y-4">
            {/* Scope */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Aplicar a</Label>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setAdjustForm(prev => ({ ...prev, applyTo: 'suppliers', providers: prev.providers.length ? prev.providers : ['cottonext', 'textilryu', 'treck'] }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    adjustForm.applyTo === 'suppliers'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Solo productos de proveedores
                </button>
                <button
                  onClick={() => setAdjustForm(prev => ({ ...prev, applyTo: 'all', providers: [] }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    adjustForm.applyTo === 'all'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Todos los productos (incluye manuales)
                </button>
              </div>
            </div>

            {/* Proveedores */}
            {adjustForm.applyTo === 'suppliers' && (
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Proveedores afectados</Label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(SUPPLIER_NAMES).map(([key, name]) => (
                    <button
                      key={key}
                      onClick={() => toggleProvider(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        adjustForm.providers.includes(key)
                          ? `${SUPPLIER_COLORS[key]} border-current`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {name} {adjustForm.providers.includes(key) && <Check className="h-3 w-3 inline ml-1" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nuevo markup */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Nuevo margen de ganancia (%)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={adjustForm.newMarkup}
                  onChange={(e) => setAdjustForm(prev => ({ ...prev, newMarkup: parseInt(e.target.value) || 0 }))}
                  className="w-32"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Formula: Precio venta = Costo proveedor x (1 + {adjustForm.newMarkup}/100), redondeado a terminacion 90
              </p>
            </div>

            {/* Ejemplo de calculo */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs font-medium text-slate-600 mb-1">Ejemplo de calculo:</p>
              <p className="text-xs text-slate-500">
                Si un producto cuesta <strong>$2.000</strong> al proveedor y aplicas <strong>{adjustForm.newMarkup}%</strong>:
                <br />
                $2.000 x {1 + adjustForm.newMarkup / 100} = <strong>${calcExample().raw.toLocaleString('es-CL')}</strong>
                {' '}&rarr; redondeado a <strong>${calcExample().rounded.toLocaleString('es-CL')}</strong>
              </p>
            </div>

            {/* Boton aplicar */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={applying || adjustForm.newMarkup < 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                {applying ? 'Aplicando...' : `Aplicar ${adjustForm.newMarkup}% a ${adjustForm.applyTo === 'suppliers' ? `${adjustForm.providers.length} proveedor(es)` : 'todos los productos'}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historial reciente */}
      <Card className="border-slate-200/70">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="font-bold text-slate-900 text-sm">Informacion</h3>
          </div>
          <p className="text-xs text-slate-500">
            Los ajustes de precio se registran con fecha y hora. Cada producto guarda su <code className="bg-slate-100 px-1 rounded">markupPercent</code> individual.
            Puedes ajustar un proveedor a la vez o todos simultaneamente. El cambio es instantaneo y no requiere reimportar del proveedor.
          </p>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Confirmar ajuste de precios
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se aplicara un margen de <strong>{adjustForm.newMarkup}%</strong> a{' '}
              {adjustForm.applyTo === 'suppliers'
                ? `productos de: ${adjustForm.providers.map(p => SUPPLIER_NAMES[p]).join(', ')}`
                : 'TODOS los productos de la tienda'}
              .
              <br /><br />
              Esto <strong>recalculara los precios de venta</strong> basandose en el costo guardado de cada producto.
              No se reimportara del proveedor ni se descargara ninguna imagen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={applyAdjustment} className="bg-emerald-600 hover:bg-emerald-700">
              Si, aplicar {adjustForm.newMarkup}%
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
