import { isValidTemplateId, listMessageTemplates, renderTemplate } from '../lib/prospeccion/templates.js';

const templates = listMessageTemplates();
if (templates.length !== 10) throw new Error(`Se esperaban 10 plantillas y se obtuvieron ${templates.length}`);
if (!isValidTemplateId('email-general', 'email')) throw new Error('email-general debería ser válida');
if (isValidTemplateId('whatsapp-general', 'email')) throw new Error('No se debe aceptar una plantilla del canal equivocado');

const lead = { id: 'lead-test', name: 'Negocio de prueba', commune: 'Quilpué', category: 'restaurantes' };
const general = renderTemplate('email', lead.category, lead, { templateId: 'email-general' });
const empresas = renderTemplate('email', lead.category, lead, { templateId: 'email-empresas' });
const whatsapp = renderTemplate('whatsapp', lead.category, lead, { templateId: 'whatsapp-deporte' });

if (general.templateId !== 'email-general') throw new Error('No se conservó el ID de email seleccionado');
if (empresas.templateId !== 'email-empresas') throw new Error('No se aplicó el ID de email alternativo');
if (general.subject === empresas.subject) throw new Error('Las plantillas de email deberían producir asuntos distintos');
if (whatsapp.templateId !== 'whatsapp-deporte' || !whatsapp.body) throw new Error('No se renderizó WhatsApp con la plantilla elegida');

console.log(JSON.stringify({ ok: true, templateCount: templates.length, emailTemplate: empresas.templateId, whatsappTemplate: whatsapp.templateId }));
