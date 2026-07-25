'use client';

import Link from 'next/link';
import { ArrowLeft, Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ModuleShell({ title, subtitle, icon: Icon, features, roadmap }) {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" />Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            {Icon && <Icon className="h-6 w-6 text-white" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
              <Badge className="bg-orange-500/10 text-orange-700 hover:bg-orange-500/10 border border-orange-500/30">
                <Construction className="h-3 w-3 mr-1" />En construcción
              </Badge>
            </div>
            <p className="text-slate-500 mt-1">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200/70">
          <CardContent className="p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Alcance del módulo</div>
            <ul className="space-y-2.5">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70">
          <CardContent className="p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Roadmap de implementación</div>
            <ol className="space-y-3">
              {roadmap.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="h-6 w-6 rounded-md bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                  <div>
                    <div className="font-medium text-slate-900">{step.title}</div>
                    <div className="text-xs text-slate-500">{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed border-slate-300 bg-white/40">
        <CardContent className="p-10 text-center">
          <div className="text-sm text-slate-500 max-w-md mx-auto">
            Este módulo se activará en las próximas iteraciones. La estructura base, el modelo de datos y el layout global ya están listos para conectar la lógica de negocio.
          </div>
          <div className="mt-4">
            <Link href="/"><Button variant="outline">Ir al Dashboard</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ModuleShell;
