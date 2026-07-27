'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle2, MessageSquare, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BUSINESS } from '@/lib/constants/business';

export function ContactForm() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', subject: '', message: '', website: '', // honeypot
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();

    if (form.message.length < 10) {
      return toast.error('El mensaje debe tener al menos 10 caracteres');
    }

    setSending(true);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          referrer: typeof window !== 'undefined' ? window.location.href : '',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al enviar');

      setSent(true);
      toast.success('Mensaje enviado ✅', {
        description: 'Te responderemos en menos de 1 hora hábil.',
      });
      setForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
    } catch (err) {
      toast.error('No pudimos enviar tu mensaje', {
        description: err.message + '. Prueba por WhatsApp.',
      });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-md p-8 text-center">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">¡Mensaje recibido!</h3>
        <p className="text-slate-600 mt-2 max-w-sm mx-auto">
          Gracias por contactarnos. Revisaremos tu consulta y responderemos a la brevedad (habitualmente en menos de 1 hora hábil).
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => setSent(false)} variant="outline" size="sm">
            Enviar otro mensaje
          </Button>
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <a href={BUSINESS.whatsapp.url('Hola! Te envié un mensaje por el formulario web')} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4 mr-1.5" />Adelantar por WhatsApp
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white shadow-md p-6 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="h-5 w-5 text-orange-500" />
        <h3 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">Envíanos un mensaje</h3>
      </div>
      <p className="text-sm text-slate-500 mb-5">Te respondemos personalmente por email en menos de 1 hora hábil.</p>

      {/* Honeypot — invisible for humans, catches spam bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website (no llenar)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={setF('website')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Nombre completo *</Label>
          <Input id="name" required value={form.name} onChange={setF('name')}
            placeholder="Ej: Camila Silva" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Email *</Label>
          <Input id="email" type="email" required value={form.email} onChange={setF('email')}
            placeholder="tucorreo@ejemplo.cl" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Teléfono / WhatsApp</Label>
          <Input id="phone" value={form.phone} onChange={setF('phone')}
            placeholder="+56 9 1234 5678" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="subject" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Asunto</Label>
          <Input id="subject" value={form.subject} onChange={setF('subject')}
            placeholder="Ej: Cotización polera DTF" className="mt-1.5 h-11" />
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="message" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Cuéntanos qué necesitas *</Label>
        <Textarea id="message" required rows={5} value={form.message} onChange={setF('message')}
          placeholder="Describe tu proyecto: cantidad, colores, formato del arte, plazo…"
          className="mt-1.5" />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Mínimo 10 caracteres</span>
          <span>{form.message.length}/3000</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <p className="text-[11px] text-slate-500">
          Al enviar aceptas ser contactado por email o WhatsApp para responder tu consulta.
        </p>
        <Button type="submit" disabled={sending}
          className="h-11 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-semibold shadow-md">
          {sending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
            : <><Send className="h-4 w-4 mr-2" />Enviar mensaje</>}
        </Button>
      </div>
    </form>
  );
}

export default ContactForm;
