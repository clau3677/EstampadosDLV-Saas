import Link from 'next/link';
import { BUSINESS } from '@/lib/constants/business';

export const metadata = {
  title: 'Términos de compra',
  description: 'Condiciones de uso, compra, producción y entrega de Estampados DLV.',
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
  </section>
);

export default function TerminosPage() {
  return (
    <article className="container max-w-4xl py-12">
      <Link href="/tienda" className="text-sm font-semibold text-orange-600 hover:text-orange-700">← Volver a la tienda</Link>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Estampados DLV</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Términos de compra y uso</h1>
        <p className="mt-3 text-sm text-slate-500">Última actualización: 21 de agosto de 2026</p>
        <p className="mt-6 text-sm leading-7 text-slate-600">
          Al navegar, cotizar o comprar en este sitio aceptas estas condiciones y las políticas de despacho,
          devoluciones y privacidad. Si tienes dudas antes de pagar, contáctanos en {BUSINESS.email.primary}.
        </p>

        <Section title="1. Productos, cotizaciones y precios">
          <p>Las fichas muestran características, variantes, disponibilidad y precios vigentes al momento de la compra. Una cotización puede cambiar si cambia la cantidad, el material, el tamaño, el diseño, el método de entrega o el plazo solicitado.</p>
          <p>Los colores pueden variar entre pantalla y resultado físico. Para trabajos personalizados recomendamos enviar archivos en buena resolución y revisar cualquier observación que solicitemos antes de producir.</p>
        </Section>

        <Section title="2. Diseños y productos personalizados">
          <p>El cliente es responsable de contar con autorización para usar logos, fotografías, tipografías, marcas y demás contenido que envíe. No aceptamos trabajos que infrinjan derechos de terceros o que sean ilícitos.</p>
          <p>Una vez aprobada la producción, los cambios de diseño, tamaño o cantidad pueden generar un nuevo costo o modificar el plazo. Guardamos los archivos únicamente durante el tiempo necesario para fabricar, atender soporte o cumplir obligaciones aplicables.</p>
        </Section>

        <Section title="3. Pago y confirmación del pedido">
          <p>El pedido se considera confirmado cuando el pago ha sido validado por el sistema o por nuestro equipo. Una orden iniciada pero no pagada puede permanecer pendiente y no garantiza reserva indefinida de materiales ni precio.</p>
          <p>Los comprobantes deben ser auténticos, legibles y corresponder al monto de la orden. Si un pago no puede validarse, podremos solicitar información adicional antes de iniciar producción.</p>
        </Section>

        <Section title="4. Producción y plazos">
          <p>El plazo depende del tipo de producto, cantidad, aprobación del diseño, disponibilidad de insumos y carga del taller. El sistema informa una estimación; salvo acuerdo escrito distinto, no constituye una garantía de una hora exacta de entrega.</p>
          <p>Podemos contactar al cliente si falta información, el archivo presenta problemas o existe una incidencia que impida continuar. El tiempo de espera por información del cliente puede extender el plazo.</p>
        </Section>

        <Section title="5. Retiro y despacho">
          <p>El retiro se coordina en {BUSINESS.address.full}, dentro del horario informado por Estampados DLV. Para proteger al cliente y al taller, podemos solicitar el código de retiro y el nombre de la persona autorizada.</p>
          <p>El despacho se rige por la opción, zona, costo y plazo mostrados en el checkout. El transportista puede requerir datos adicionales o aplicar sus propios procedimientos de entrega. Los detalles completos están en <Link href="/politicas/envios-devoluciones" className="font-semibold text-orange-600 hover:underline">Despachos y devoluciones</Link>.</p>
        </Section>

        <Section title="6. Cancelaciones, cambios y devoluciones">
          <p>Las solicitudes de cancelación deben enviarse cuanto antes a {BUSINESS.email.primary} con el número de pedido. Si la producción personalizada ya comenzó, la posibilidad de cancelar puede estar limitada, sin perjuicio de los derechos irrenunciables que correspondan conforme a la normativa aplicable.</p>
          <p>Los productos con defectos, errores atribuibles al taller o daños de transporte deben informarse con fotografías y número de pedido para que podamos revisar el caso y ofrecer una solución conforme a la normativa vigente.</p>
        </Section>

        <Section title="7. Propiedad intelectual y uso del sitio">
          <p>La marca, textos, fotografías, diseños de interfaz y código del sitio pertenecen a Estampados DLV o a sus respectivos titulares. No está permitido copiar, extraer, revender o utilizar estos contenidos sin autorización.</p>
          <p>El usuario debe utilizar el sitio de forma lícita, no intentar vulnerar sus controles y no enviar archivos o instrucciones que puedan dañar la operación.</p>
        </Section>

        <Section title="8. Soporte y contacto">
          <p>Para consultas sobre una orden, escribe a <a className="font-semibold text-orange-600 hover:underline" href={BUSINESS.email.mailto}>{BUSINESS.email.primary}</a> indicando el número de pedido. También puedes revisar el estado desde tu cuenta cuando el pedido tenga seguimiento disponible.</p>
        </Section>

        <Section title="9. Cambios a estas condiciones">
          <p>Podemos actualizar estos términos para reflejar cambios en productos, pagos, despacho o normativa. La versión vigente será la publicada en esta página con su fecha de actualización.</p>
        </Section>
      </div>
    </article>
  );
}
