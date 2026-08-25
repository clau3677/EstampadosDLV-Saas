'use client';

import { useEffect, useMemo, useState } from 'react';

const PROJECTS_KEY = 'dlv-video-editor-projects-v1';

export default function VideoEditorPage() {
  const [videos, setVideos] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setProjects(JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}'));
    } catch {
      setProjects({});
    }

    fetch(`/api/marketing/posts?status=all&_t=${Date.now()}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las publicaciones');
        return response.json();
      })
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).filter((post) => post?.isVideo && post?.videoUrl);
        setVideos(list);
        if (list[0]) setSelectedId(String(list[0]._id || list[0].id));
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => videos.find((post) => String(post._id || post.id) === selectedId) || null,
    [videos, selectedId],
  );
  const key = selected ? String(selected._id || selected.id) : '';
  const settings = projects[key] || { title: '', notes: '', start: 0, end: '' };

  function save(patch) {
    if (!key) return;
    const next = { ...projects, [key]: { ...settings, ...patch } };
    setProjects(next);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-slate-950 p-6 text-white">
          <p className="text-sm font-medium text-orange-300">DISEÑO · EDITOR DE VIDEO PRO</p>
          <h1 className="mt-2 text-2xl font-bold">Editor de Video Pro</h1>
          <p className="mt-2 text-sm text-slate-300">Gestiona y previsualiza los videos reales generados por Estampados DLV. Este módulo está separado de Marketing y no publica ni modifica campañas.</p>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading && <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">Cargando videos reales…</div>}
        {!loading && !videos.length && <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">No hay videos generados disponibles para editar.</div>}

        {videos.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold">Videos generados</h2>
              <div className="space-y-2">
                {videos.map((post) => {
                  const id = String(post._id || post.id);
                  return (
                    <button key={id} type="button" onClick={() => setSelectedId(id)} className={`w-full rounded-xl border p-3 text-left ${id === selectedId ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}>
                      <span className="block truncate text-sm font-medium">{post.productName || post.title || 'Video de producto'}</span>
                      <span className="mt-1 block text-xs text-slate-500">{post.status || 'generado'}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selected && (
              <section className="grid gap-6 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[minmax(240px,380px)_1fr] md:p-6">
                <div className="rounded-xl bg-slate-950 p-3">
                  <video className="mx-auto max-h-[620px] w-full rounded-lg object-contain" controls playsInline src={selected.videoUrl} />
                </div>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selected.productName || selected.title || 'Video de producto'}</h2>
                    <p className="mt-1 text-sm text-slate-500">El video original se conserva. Estos ajustes se guardan como proyecto local.</p>
                  </div>
                  <label className="block text-sm font-medium">Título de edición<input value={settings.title} onChange={(event) => save({ title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Título opcional" /></label>
                  <label className="block text-sm font-medium">Notas para producción<textarea value={settings.notes} onChange={(event) => save({ notes: event.target.value })} className="mt-1 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Cambios de texto, música o corte" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium">Inicio (s)<input type="number" min="0" value={settings.start} onChange={(event) => save({ start: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                    <label className="text-sm font-medium">Fin (s)<input type="number" min="0" value={settings.end} onChange={(event) => save({ end: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Opcional" /></label>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Proyecto guardado automáticamente en este navegador.</div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// OpenReel todavía no está embebido; esta página no afirma una integración inexistente.
// El render/export final se implementará en una fase separada y validada.
// Editor Pro aislado.

