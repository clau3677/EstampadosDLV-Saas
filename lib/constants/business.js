/**
 * Datos maestros del negocio Estampados DLV.
 * ÚNICA fuente de verdad — cualquier componente que necesite dirección, teléfono
 * o email debe importar desde aquí. NUNCA hardcodear estos valores.
 *
 * Uso:
 *   import { BUSINESS } from '@/lib/constants/business';
 *   <span>{BUSINESS.address.full}</span>
 */

export const BUSINESS = {
  name: 'Estampados DLV',
  legalName: 'Estampados DLV',
  tagline: 'Taller DTF y DTF UV',

  // ---- Contacto ----
  phone: {
    display:     '+56 9 5416 9052',      // formato humano
    intl:        '+56954169052',           // sin espacios, con +
    e164:        '56954169052',            // sólo dígitos (WhatsApp / tel:)
    tel:         'tel:+56954169052',
  },

  email: {
    primary:   'estampadosdlv@gmail.com',
    mailto:    'mailto:estampadosdlv@gmail.com',
  },

  // ---- Dirección física ----
  address: {
    street:   'Galleguillos 1870',
    unit:     'Casa 1',
    city:     'Quilpué',
    region:   'Valparaíso',
    country:  'Chile',
    countryCode: 'CL',
    // Formato compacto para footer / cards
    short:    'Quilpué, Valparaíso',
    // Formato completo para JSON-LD y páginas de contacto
    full:     'Galleguillos 1870, Casa 1, Quilpué, Valparaíso, Chile',
    // Enlace para abrir Google Maps
    mapUrl:   'https://maps.google.com/?q=Galleguillos+1870+Quilpu%C3%A9+Valpara%C3%ADso+Chile',
  },

  // ---- Redes sociales ----
  whatsapp: {
    // Wrapper con mensaje pre-llenado
    url: (msg = 'Hola, quiero cotizar un estampado DTF') =>
      `https://wa.me/56954169052?text=${encodeURIComponent(msg)}`,
    plainUrl: 'https://wa.me/56954169052',
  },
};

export default BUSINESS;
