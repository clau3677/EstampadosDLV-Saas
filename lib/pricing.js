// Motor de cotización — usado tanto en frontend (live) como backend (validación)
// Los precios son CLP por MILÍMETRO impreso (largo lineal del pliego)

export const PRICING = {
  dtf_textil_31: {
    label: 'DTF Textil · 31 cm',
    printer: 'epson_r1390',
    canvasWidthCm: 31,
    pricePerMm: 10,       // $10.000 por metro
    minLengthMm: 100,     // cobro mínimo 10 cm
    color: 'from-blue-500 to-indigo-600',
  },
  dtf_textil_33: {
    label: 'DTF Textil · 33 cm',
    printer: 'prestige_r2_pro',
    canvasWidthCm: 33,
    pricePerMm: 12,       // $12.000 por metro
    minLengthMm: 100,
    color: 'from-purple-500 to-fuchsia-600',
  },
  dtf_uv: {
    label: 'DTF UV · Rígidos',
    printer: 'dtf_uv',
    canvasWidthCm: 33,    // por defecto, se puede ajustar
    pricePerMm: 28,       // $28.000 por metro
    minLengthMm: 100,
    color: 'from-emerald-500 to-teal-600',
  },
};

export const EXPRESS_SURCHARGE = 0.30;  // +30%
export const IVA = 0.19;

export function quote({ mode, lengthMm, express = false }) {
  const cfg = PRICING[mode];
  if (!cfg) return null;
  const billableMm = Math.max(lengthMm, cfg.minLengthMm);
  const subtotal = billableMm * cfg.pricePerMm;
  const surcharge = express ? Math.round(subtotal * EXPRESS_SURCHARGE) : 0;
  const netAmount = subtotal + surcharge;
  const tax = Math.round(netAmount * IVA);
  const total = netAmount + tax;
  return {
    mode,
    label: cfg.label,
    lengthMm,
    billableMm,
    pricePerMm: cfg.pricePerMm,
    subtotal,
    surcharge,
    netAmount,
    tax,
    total,
    express,
  };
}
