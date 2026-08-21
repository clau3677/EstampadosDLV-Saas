import Link from 'next/link';
import { BUSINESS } from '@/lib/constants/business';

export const metadata = {
  title: 'Despachos y devoluciones',
  description: 'Métodos de entrega, retiro en taller, plazos, incidencias y devoluciones de Estampados DLV.',
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
  </section>
);

export default function EnviosDevolucionesPage() {
  return (
    <article className="container max-w-4xl py-12">
      <Link href="/tienda" className="text-sm font-semibold text-orange-600 hover:text-orange-700">← Volver a la tienda</Link>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Estampados DLV</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Despachos, retiros y devoluciones</h1>
        <p className="mt-3 text-sm text-slate-500">Última actualización: 21 de agosto de 2026</p>
        <p className="mt-6 text-sm leading-7 text-slate-600">
          Estas condiciones explican cómo entregamos pedidos y cómo gestionar una incidencia. El costo y el plazo
          que prevalecen para cada compra son los que se muestran en el checkout antes de pagar.
        </p>

        <Section title="1. Retiro en taller">
          <p>El retiro se realiza en <strong className="text-slate-800">{BUSINESS.address.full}</strong>, dentro del horario informado por Estampados DLV.</p>
          <p>Cuando el pedido esté listo, el cliente podrá recibir un código de retiro. La persona que retira debe indicar el código y su nombre; el equipo puede solicitar una identificación para proteger la entrega.</p>
          <p>El pedido queda registrado como retirado cuando el equipo valida el código y la persona que recibe. Esa confirmación aparece en el seguimiento de la cuenta.</p>
        </Section>

        <Section title="2. Envío a domicilio">
          <p>El checkout calcula la opción disponible según la zona y la configuración vigente. Como referencia operacional actual, el despacho estándar se muestra con un costo de <strong className="text-slate-800">$3.990 CLP</strong> y una estimación de <strong className="text-slate-800">2 a 4 días hábiles</strong>, salvo que el checkout indique otra condición.</p>
          <p>La dirección debe estar completa e incluir calle, número, comuna, ciudad, región y cualquier instrucción útil. No podemos responsabilizarnos por demoras o reintentos causados por una dirección incompleta o incorrecta.</p>
          <p>El estado cambia desde preparación y empaquetado hasta entrega al courier, tránsito y entrega final. Cuando exista un código de seguimiento, se mostrará en la cuenta y podrá abrirse en la página del transportista.</p>
        </Section>

        <Section title="3. Tiempos y situaciones especiales">
          <p>Los tiempos son estimaciones y pueden verse afectados por volumen de pedidos, aprobación tardía de diseños, disponibilidad de materiales, días festivos, cobertura del courier o causas ajenas al taller.</p>
          <p>Si el transportista informa una incidencia, nos pondremos en contacto utilizando los datos del pedido. Para acelerar la revisión, responde al correo de confirmación con el número de orden y una descripción del problema.</p>
        </Section>

        <Section title="4. Pedido dañado, incompleto o defectuoso">
          <p>Informa el problema a <a className="font-semibold text-orange-600 hover:underline" href={BUSINESS.email.mailto}>{BUSINESS.email.primary}</a> tan pronto como sea posible, indicando el número de pedido y adjuntando fotografías del producto, embalaje y etiqueta cuando corresponda.</p>
          <p>Revisaremos si el problema corresponde a fabricación, impresión, preparación o transporte y coordinaremos reposición, reparación, devolución o reembolso según el caso y la normativa aplicable.</p>
        </Section>

        <Section title="5. Productos personalizados">
          <p>Los productos fabricados con un diseño, medida, texto o combinación elegida por el cliente se producen específicamente para esa orden. Por ello, los cambios por gusto personal o por un error del archivo aprobado pueden no ser procedentes, sin afectar los derechos que la normativa reconozca cuando exista un defecto o incumplimiento atribuible al proveedor.</p>
          <p>Antes de producir podemos solicitar confirmación del archivo o de la variante. Revisa cuidadosamente nombres, tallas, colores, cantidades y dirección antes de pagar.</p>
        </Section>

        <Section title="6. Cancelación o devolución">
          <p>Solicita una cancelación o devolución escribiendo a {BUSINESS.email.primary} con el número de pedido. Evaluaremos la etapa de producción y el motivo de la solicitud.</p>
          <p>Si la devolución es aprobada, te informaremos el método de entrega, los plazos y cualquier condición necesaria. Las soluciones se aplicarán de acuerdo con la normativa chilena vigente y con las características de cada producto.</p>
        </Section>

        <Section title="7. Contacto y seguimiento">
          <p>Puedes consultar el estado desde <Link href="/mi-cuenta/pedidos" className="font-semibold text-orange-600 hover:underline">Mis pedidos</Link> cuando hayas iniciado sesión. Si el problema requiere atención directa, contáctanos por correo o teléfono:</p>
          <p><a className="font-semibold text-orange-600 hover:underline" href={BUSINESS.email.mailto}>{BUSINESS.email.primary}</a> · {BUSINESS.phone.display}</p>
        </Section>
      </div>
    </article>
  );
}
