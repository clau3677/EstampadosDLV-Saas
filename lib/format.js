// Formatters para localización chilena (CLP, RUT, fechas)

export const formatCLP = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

export const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatDateLong = (date = new Date()) => {
  const d = new Date(date);
  return d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

// Validación de RUT chileno (calcula dígito verificador)
export const validateRut = (rut) => {
  if (!rut) return false;
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return expected === dv;
};

export const formatRut = (rut) => {
  if (!rut) return '';
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.') + '-' + dv;
};
