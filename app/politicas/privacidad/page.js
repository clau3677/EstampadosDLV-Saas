import Link from 'next/link';
import { BUSINESS } from '@/lib/constants/business';

export const metadata = {
  title: 'Política de privacidad',
  description: 'Cómo Estampados DLV recopila, utiliza y protege los datos de sus clientes.',
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
  </section>
);

export default function PrivacidadPage() {
  return (
    <article className="container max-w-4xl py-12">
      <Link href="/tienda" className="text-sm font-semibold text-orange-600 hover:text-orange-700">← Volver a la tienda</Link>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Estampados DLV</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Política de privacidad</h1>
        <p className="mt-3 text-sm text-slate-500">Última actualización: 21 de agosto de 2026</p>
        <p className="mt-6 text-sm leading-7 text-slate-600">
          En Estampados DLV cuidamos la información que nos entregas al cotizar, comprar o solicitar soporte.
          Esta política explica de forma clara qué datos usamos, con qué finalidad y cómo puedes contactarnos.
        </p>

        <Section title="1. Responsable y contacto">
          <p>El responsable de la atención comercial y del tratamiento de datos es <strong className="text-slate-800">{BUSINESS.legalName}</strong>.</p>
          <p>Dirección: {BUSINESS.address.full}. Correo: <a className="font-semibold text-orange-600 hover:underline" href={BUSINESS.email.mailto}>{BUSINESS.email.primary}</a>. Teléfono: {BUSINESS.phone.display}.</p>
        </Section>

        <Section title="2. Datos que podemos recopilar">
          <p>Podemos recibir tu nombre, correo electrónico, teléfono, dirección de despacho, comuna, ciudad, región, datos de facturación, historial de pedidos, diseños enviados, comprobantes de pago y comunicaciones de soporte.</p>
          <p>También podemos registrar datos técnicos básicos necesarios para la seguridad y funcionamiento del sitio, como dirección IP, navegador, dispositivo, páginas visitadas y eventos de rendimiento.</p>
        </Section>

        <Section title="3. Para qué usamos la información">
          <p>Usamos los datos para preparar cotizaciones, procesar pedidos, confirmar pagos, producir y entregar productos, coordinar retiros, responder consultas, resolver incidencias, enviar avisos relacionados con tu pedido y cumplir obligaciones legales o contables.</p>
          <p>Con tu autorización o cuando la normativa lo permita, podemos enviar comunicaciones comerciales o solicitudes de reseña. Puedes pedir dejar de recibir comunicaciones promocionales en cualquier momento escribiendo a nuestro correo.</p>
        </Section>

        <Section title="4. Proveedores y terceros">
          <p>Cuando es necesario para completar una operación, podemos compartir los datos mínimos con proveedores de pago, servicios de correo electrónico, transportistas, herramientas de almacenamiento y plataformas de analítica o publicidad. Estos terceros solo deben recibir la información necesaria para prestar el servicio correspondiente.</p>
          <p>No vendemos tus datos personales. Nunca solicitaremos por correo o WhatsApp contraseñas, códigos de acceso ni datos completos de tarjetas.</p>
        </Section>

        <Section title="5. Conservación y seguridad">
          <p>Conservamos la información durante el tiempo necesario para cumplir la finalidad para la que fue recopilada, atender garantías, resolver reclamos y cumplir obligaciones legales. Aplicamos controles de acceso, respaldos y medidas técnicas razonables para proteger los datos frente a pérdida, acceso no autorizado o uso indebido.</p>
        </Section>

        <Section title="6. Tus derechos y solicitudes">
          <p>Puedes solicitar información sobre los datos asociados a tu relación con Estampados DLV, pedir corrección de datos incorrectos, consultar el uso de tu información o solicitar que dejemos de utilizarla cuando corresponda. Para hacerlo, escribe a <a className="font-semibold text-orange-600 hover:underline" href={BUSINESS.email.mailto}>{BUSINESS.email.primary}</a> indicando tu nombre y el motivo de la solicitud.</p>
        </Section>

        <Section title="7. Cookies y analítica">
          <p>El sitio puede utilizar cookies técnicas para mantener el carrito, la sesión y preferencias. También puede utilizar herramientas de medición y marketing para entender el uso del sitio y mejorar campañas. Puedes administrar cookies desde la configuración de tu navegador; algunas funciones podrían dejar de operar correctamente.</p>
        </Section>

        <Section title="8. Cambios a esta política">
          <p>Podemos actualizar esta política cuando cambien nuestros servicios, proveedores o requisitos legales. La versión vigente estará siempre publicada en esta página con su fecha de actualización.</p>
        </Section>
      </div>
    </article>
  );
}
