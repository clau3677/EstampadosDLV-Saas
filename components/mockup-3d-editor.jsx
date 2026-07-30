'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Copy, Undo2, Redo2,
  Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, RotateCw, Palette, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

// ============================================================================
// REACT THREE FIBER — Se carga con dynamic import (ssr: false)
// ============================================================================
import { Canvas, useFrame } from '@react-three/fiber';
import {
  useGLTF, Decal, OrbitControls, Environment, Center,
  AccumulativeShadows, RandomizedLight,
} from '@react-three/drei';
import { easing } from 'maath';

// ============================================================================
// DATOS DE PRENDAS Y COLORES
// ============================================================================
const GARMENT_TEMPLATES = {
  tshirt: { id: 'tshirt', label: 'Polera Oversize', category: 'poleras', modelPath: '/mockups/shirt_baked.glb' },
  hoodie: { id: 'hoodie', label: 'Polerón', category: 'polerones', modelPath: '/mockups/shirt_baked.glb' },
  cap: { id: 'cap', label: 'Gorra', category: 'gorras', modelPath: '/mockups/shirt_baked.glb' },
};

const GARMENT_COLORS = {
  white:  { label: 'Blanco',     hex: '#F5F5F0' },
  black:  { label: 'Negro',      hex: '#1C1C1C' },
  gray:   { label: 'Gris',       hex: '#8A8A8A' },
  navy:   { label: 'Azul Marino',hex: '#1B2A4A' },
  red:    { label: 'Rojo',       hex: '#C41E1E' },
  forest: { label: 'Verde',      hex: '#1E5E3A' },
};

// ============================================================================
// COMPONENTE DE PRENDA 3D CON DECAL
// ============================================================================
function GarmentModel({ template, colorName, designUrl }) {
  const { nodes, materials } = useGLTF(GARMENT_TEMPLATES[template]?.modelPath || '/mockups/shirt_baked.glb');
  const [designTexture, setDesignTexture] = useState(null);

  // Cargar textura del diseño
  useEffect(() => {
    if (!designUrl) {
      setDesignTexture(null);
      return;
    }
    const texLoader = new (require('three').TextureLoader)();
    texLoader.setCrossOrigin('anonymous');
    texLoader.load(
      designUrl,
      (tex) => {
        tex.wrapS = tex.wrapT = require('three').RepeatWrapping;
        tex.colorSpace = require('three').SRGBColorSpace;
        setDesignTexture(tex);
      },
      undefined,
      () => { console.error('Error loading design texture'); }
    );
  }, [designUrl]);

  // Animar color
  const color = GARMENT_COLORS[colorName]?.hex || '#F5F5F0';
  useFrame((state, delta) => {
    if (materials.lambert1) {
      easing.dampC(materials.lambert1.color, color, 0.25, delta);
    }
  });

  return (
    <group dispose={null}>
      <mesh
        castShadow
        geometry={nodes.T_Shirt_male?.geometry}
        material={materials.lambert1}
        material-roughness={1}
        material-metalness={0}
      >
        {/* Design Decal - se aplica sobre la superficie UV de la prenda */}
        {designTexture && (
          <Decal
            position={[0, 0.04, 0.15]}
            rotation={[0, 0, 0]}
            scale={0.25}
            map={designTexture}
            anisotropy={16}
            depthTest={false}
            depthWrite={true}
          />
        )}
      </mesh>
    </group>
  );
}

// ============================================================================
// ESCENA 3D
// ============================================================================
function Scene3D({ template, color, designUrl, onReady }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 3], fov: 30 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      className="w-full h-full"
      onCreated={({ gl }) => {
        gl.toneMapping = 4; // ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0;
        if (!loaded) {
          setLoaded(true);
          onReady?.();
        }
      }}
    >
      {/* Iluminación profesional */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#c8d8ff" />

      {/* Sombras acumuladas */}
      <AccumulativeShadows
        temporal
        frames={60}
        alphaTest={0.85}
        scale={10}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -1.5, 0]}
      >
        <RandomizedLight
          amount={4}
          radius={9}
          intensity={0.55}
          ambient={0.25}
          position={[5, 5, -10]}
        />
        <RandomizedLight
          amount={4}
          radius={5}
          intensity={0.25}
          ambient={0.55}
          position={[-5, 5, -9]}
        />
      </AccumulativeShadows>

      {/* Environment HDRI */}
      <Environment preset="city" />

      {/* Modelo de prenda */}
      <Center>
        <Suspense fallback={
          <mesh>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial color="#ccc" wireframe />
          </mesh>
        }>
          <GarmentModel
            template={template}
            colorName={color}
            designUrl={designUrl}
          />
        </Suspense>
      </Center>

      {/* Controles de órbita */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2}
        maxDistance={6}
        autoRotate={false}
        enableDamping
        dampingFactor={0.05}
      />
    </Canvas>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ template, setTemplate, color, setColor, designs, selectedDesignId, selectDesign, removeDesign, updateDesignLive, commitDesignChange, activeTab, setActiveTab, handleFile, handleLibrarySelect }) {
  const design = designs.find(d => d.id === selectedDesignId);

  return (
    <div className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {[
            { id: 'garment', label: 'Prenda', icon: Shirt },
            { id: 'upload', label: 'Diseño', icon: Upload },
            { id: 'library', label: 'Biblioteca', icon: Sparkles },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors
                ${activeTab === tab.id
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
              `}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {activeTab === 'garment' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Tipo de prenda</h3>
                <div className="space-y-2">
                  {Object.entries(GARMENT_TEMPLATES).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setTemplate(key)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                        template === key ? 'bg-orange-500 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">
                  <Palette className="h-3.5 w-3.5 inline mr-1" />
                  Color de prenda
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GARMENT_COLORS).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setColor(key)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        color === key ? 'border-orange-500 scale-110 shadow-md' : 'border-slate-200 hover:border-slate-400'
                      }`}
                      style={{ backgroundColor: val.hex }}
                      title={val.label}
                    />
                  ))}
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                <RotateCw className="h-3 w-3 inline mr-1" />
                Arrastra para rotar la prenda 3D en cualquier ángulo
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <DesignUploader onFile={handleFile} />
          )}

          {activeTab === 'library' && (
            <LibraryPicker onSelect={handleLibrarySelect} />
          )}

          {/* Capas */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              <Layers className="h-3.5 w-3.5 inline mr-1" />
              Capas ({designs.length})
            </h3>
            <LayersList designs={designs} selectedDesignId={selectedDesignId} selectDesign={selectDesign} removeDesign={removeDesign} />
          </div>

          {/* Propiedades */}
          {design && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades del diseño</h3>
              <DesignProperties design={design} updateDesignLive={updateDesignLive} commitDesignChange={commitDesignChange} removeDesign={removeDesign} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DesignUploader({ onFile }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleFiles = (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: solo imágenes`);
        continue;
      }
      onFile(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(Array.from(e.dataTransfer.files)); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
        drag ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50'
      }`}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
      <Upload className="h-8 w-8 text-orange-500 mx-auto" />
      <div className="mt-3 text-sm font-medium text-slate-700">Subir diseño</div>
      <div className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP</div>
      <div className="text-[10px] text-slate-400 mt-2">Haz clic o arrastra tu diseño aquí</div>
    </div>
  );
}

function LibraryPicker({ onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');

  useEffect(() => {
    loadLibrary();
  }, [search, selectedFolder, page]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: '24' });
      if (search) params.set('search', search);
      if (selectedFolder) params.set('folder', selectedFolder);
      const r = await fetch(`/api/design-library?${params}`);
      if (r.ok) {
        const data = await r.json();
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
        setFolders(data.folders || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar en la biblioteca..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 text-sm" />
      {folders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setSelectedFolder('')} className={`px-2 py-0.5 rounded text-[10px] ${!selectedFolder ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Todos</button>
          {folders.slice(0, 8).map(f => (
            <button key={f.name} onClick={() => setSelectedFolder(f.name)} className={`px-2 py-0.5 rounded text-[10px] ${selectedFolder === f.name ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{f.name}</button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin resultados
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
            {items.map(item => (
              <button key={item.id} onClick={() => onSelect(item)} className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-orange-400 hover:shadow-md transition-all bg-slate-50">
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-1" loading="lazy" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LayersList({ designs, selectedDesignId, selectDesign, removeDesign }) {
  if (designs.length === 0) {
    return <div className="text-center py-4 text-slate-400 text-xs">Sin diseños. Sube uno o elige de la biblioteca.</div>;
  }
  return (
    <div className="space-y-1 max-h-[140px] overflow-y-auto">
      {[...designs].reverse().map(d => (
        <div key={d.id} onClick={() => selectDesign(d.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${selectedDesignId === d.id ? 'bg-orange-50 border border-orange-200' : 'hover:bg-slate-50 border border-transparent'}`}>
          <img src={d.imageUrl} alt="" className="w-6 h-6 object-contain rounded" />
          <span className="text-xs text-slate-700 truncate flex-1">{d.name}</span>
          <button onClick={(e) => { e.stopPropagation(); removeDesign(d.id); }} className="text-slate-400 hover:text-red-500">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function DesignProperties({ design, updateDesignLive, commitDesignChange, removeDesign }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{design.name}</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeDesign(design.id)} title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div>
        <label className="text-xs text-slate-600">Rotación: {design.rotation}°</label>
        <Slider value={[design.rotation || 0]} min={0} max={360} step={1} onValueChange={([v]) => updateDesignLive(design.id, { rotation: v })} onValueCommit={commitDesignChange} className="mt-1" />
      </div>
      <div>
        <label className="text-xs text-slate-600">Opacidad: {Math.round((design.opacity || 1) * 100)}%</label>
        <Slider value={[(design.opacity || 1) * 100]} min={0} max={100} step={1} onValueChange={([v]) => updateDesignLive(design.id, { opacity: v / 100 })} onValueCommit={commitDesignChange} className="mt-1" />
      </div>
      <div>
        <label className="text-xs text-slate-600">Escala: {design.scale || 1}x</label>
        <Slider value={[(design.scale || 1) * 100]} min={20} max={300} step={1} onValueChange={([v]) => updateDesignLive(design.id, { scale: v / 100 })} onValueCommit={commitDesignChange} className="mt-1" />
      </div>
    </div>
  );
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
class MockupErrorBoundary extends (typeof React !== 'undefined' ? React.Component : class {}) {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] rounded-xl border border-rose-200 bg-rose-50/60 px-6 text-center">
          <div className="text-sm font-semibold text-slate-800">El editor 3D tuvo un error</div>
          <div className="text-xs text-slate-600 mt-1 max-w-md">
            {String(this.state.err?.message || this.state.err || 'Error desconocido').slice(0, 200)}
          </div>
          <Button onClick={() => window.location.reload()} size="sm" className="mt-4">
            Recargar la página
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Mockup3DEditor() {
  const [template, setTemplate] = useState('tshirt');
  const [color, setColor] = useState('white');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [activeTab, setActiveTab] = useState('garment');
  const [loading3D, setLoading3D] = useState(true);

  // Historial
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = useCallback((newDesigns) => {
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      sliced.push(JSON.parse(JSON.stringify(newDesigns)));
      return sliced.slice(-30);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 29));
  }, [historyIndex]);

  const addDesign = useCallback((imageData) => {
    const id = crypto.randomUUID();
    const newDesign = {
      id,
      imageUrl: imageData.url,
      name: imageData.name || 'Diseño',
      rotation: 0,
      opacity: 1,
      scale: 1,
      srcWidthPx: imageData.srcWidthPx || 512,
      srcHeightPx: imageData.srcHeightPx || 512,
    };
    setDesigns(prev => {
      const next = [...prev, newDesign];
      pushHistory(next);
      return next;
    });
    setSelectedDesignId(id);
    toast.success(`${imageData.name} agregado al mockup`);
  }, [pushHistory]);

  const updateDesignLive = useCallback((id, patch) => {
    setDesigns(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const commitDesignChange = useCallback(() => {
    setDesigns(prev => { pushHistory(prev); return prev; });
  }, [pushHistory]);

  const removeDesign = useCallback((id) => {
    setDesigns(prev => {
      const next = prev.filter(d => d.id !== id);
      pushHistory(next);
      return next;
    });
    setSelectedDesignId(null);
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    setHistoryIndex(historyIndex - 1);
    setDesigns(history[historyIndex - 1] || []);
    setSelectedDesignId(null);
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex(historyIndex + 1);
    setDesigns(history[historyIndex + 1] || []);
    setSelectedDesignId(null);
  }, [historyIndex, history]);

  const handleFile = async (file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      const data = await r.json();
      addDesign({ imageUrl: data.url, name: data.originalName, srcWidthPx: data.widthPx, srcHeightPx: data.heightPx });
    } catch { toast.error('Error al subir imagen'); }
  };

  const handleLibrarySelect = (item) => {
    addDesign({ imageUrl: item.imageUrl, name: item.name, srcWidthPx: item.srcWidthPx, srcHeightPx: item.srcHeightPx });
    fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
    setActiveTab('garment');
  };

  const handleExport = async () => {
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) { toast.error('No hay canvas 3D'); return; }
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `mockup-3d-${template}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Mockup 3D exportado como PNG');
    } catch { toast.error('Error al exportar'); }
  };

  // URL del primer diseño para aplicar como decal
  const primaryDesignUrl = designs.length > 0 ? designs[designs.length - 1].imageUrl : null;

  return (
    <MockupErrorBoundary>
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-140px)]">
        {/* Canvas 3D */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Header */}
          <div className="flex items-center justify-between w-full max-w-[600px] mb-4">
            <div className="flex items-center gap-3">
              <Link href="/tienda" className="text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <h1 className="text-xl font-bold text-slate-900">Editor 3D de Mockups</h1>
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
                {GARMENT_TEMPLATES[template]?.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0} title="Deshacer">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1} title="Rehacer">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="bg-gradient-to-r from-orange-500 to-rose-500 text-white" onClick={handleExport}>
                <Download className="h-3.5 w-3.5 mr-1" />Exportar
              </Button>
            </div>
          </div>

          {/* Escena 3D */}
          <div className="relative w-full max-w-[600px] aspect-square rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100">
            {loading3D && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
                <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                <div className="text-sm text-slate-500 mt-3">Cargando modelo 3D...</div>
              </div>
            )}
            <Scene3D
              template={template}
              color={color}
              designUrl={primaryDesignUrl}
              onReady={() => setLoading3D(false)}
            />
          </div>

          <div className="mt-4 text-center text-xs text-slate-500 max-w-md">
            Rotación 360° con el mouse. Sube tu diseño o elige de la biblioteca para verlo aplicado sobre la prenda.
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar
          template={template} setTemplate={setTemplate}
          color={color} setColor={setColor}
          designs={designs} selectedDesignId={selectedDesignId}
          selectDesign={setSelectedDesignId}
          removeDesign={removeDesign}
          updateDesignLive={updateDesignLive} commitDesignChange={commitDesignChange}
          activeTab={activeTab} setActiveTab={setActiveTab}
          handleFile={handleFile} handleLibrarySelect={handleLibrarySelect}
        />
      </div>
    </MockupErrorBoundary>
  );
}

// Cargar modelo GLB al inicio
useGLTF.preload('/mockups/shirt_baked.glb');
