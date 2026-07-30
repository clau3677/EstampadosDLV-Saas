'use client';

import { useState, useRef, useEffect, useCallback, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Undo2, Redo2,
  Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, RotateCw, Palette, ZoomIn, ZoomOut, Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

// ============================================================================
// REACT THREE FIBER
// ============================================================================
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture, Decal, OrbitControls } from '@react-three/drei';
import { easing } from 'maath';

// ============================================================================
// DATOS DE COLORES
// ============================================================================
const GARMENT_COLORS = {
  white:  { label: 'Blanco',     hex: '#F5F5F0' },
  black:  { label: 'Negro',      hex: '#1C1C1C' },
  gray:   { label: 'Gris',       hex: '#8A8A8A' },
  navy:   { label: 'Azul Marino',hex: '#1B2A4A' },
  red:    { label: 'Rojo',       hex: '#C41E1E' },
  forest: { label: 'Verde',      hex: '#1E5E3A' },
};

// ============================================================================
// MODELO DE PRENDA 3D
// ============================================================================
function TShirtModel({ colorName, designUrl }) {
  const { nodes, materials } = useGLTF('/mockups/shirt_baked.glb');

  // Preload y cargar textura del diseño
  let designTexture = null;
  try {
    if (designUrl) {
      designTexture = useTexture(designUrl);
    }
  } catch (e) {
    // ignore texture load errors
  }

  const targetColor = GARMENT_COLORS[colorName]?.hex || '#F5F5F0';

  useFrame((state, delta) => {
    if (materials.lambert1) {
      easing.dampC(materials.lambert1.color, targetColor, 0.25, delta);
    }
  });

  return (
    <group dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.T_Shirt_male.geometry}
        material={materials.lambert1}
        material-roughness={1}
        material-metalness={0}
      >
        {designTexture && (
          <Decal
            position={[0, 0.04, 0.15]}
            rotation={[0, 0, 0]}
            scale={0.15}
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
function Scene3D({ color, designUrl }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 3], fov: 30 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Iluminación */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#c8d8ff" />

      {/* Modelo de prenda */}
      <Suspense fallback={null}>
        <TShirtModel colorName={color} designUrl={designUrl} />
      </Suspense>

      {/* Piso de sombra */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.3} />
      </mesh>

      {/* Controles de órbita */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2}
        maxDistance={6}
        enableDamping
        dampingFactor={0.05}
      />
    </Canvas>
  );
}

// ============================================================================
// PRELOADER INVISIBLE — Carga el modelo GLB antes de mostrar el editor
// ============================================================================
function ModelPreloader({ onReady }) {
  useGLTF.preload('/mockups/shirt_baked.glb');
  useEffect(() => {
    // Give it a tick to ensure preload started
    const t = setTimeout(() => onReady?.(), 500);
    return () => clearTimeout(t);
  }, [onReady]);
  return null;
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ color, setColor, designs, selectedDesignId, selectDesign, removeDesign, updateDesignLive, commitDesignChange, activeTab, setActiveTab, handleFile, handleLibrarySelect }) {
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
                <h3 className="text-sm font-semibold text-slate-700 mb-2">
                  <Palette className="h-3.5 w-3.5 inline mr-1" />
                  Color de prenda
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GARMENT_COLORS).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setColor(key)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        color === key
                          ? 'border-orange-500 ring-2 ring-orange-300 scale-110'
                          : 'border-slate-300 hover:border-slate-400'}
                      `}
                      style={{ backgroundColor: val.hex }}
                      title={val.label}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Color: {GARMENT_COLORS[color]?.label}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  <strong>Polera Oversize T-Shirt</strong> — Modelo 3D con iluminación realista.
                  Arrastra para rotar, scroll para zoom.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-orange-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById('design-upload')?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
              >
                <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-600">Arrastra tu diseño aquí</p>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG o WEBP</p>
                <input
                  id="design-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {design && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-slate-500" />
                    <span className="text-xs text-slate-600 truncate flex-1">{design.name}</span>
                    <button
                      onClick={() => removeDesign(design.id)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div>
                    <Label className="text-xs text-slate-600 flex items-center gap-2">
                      <RotateCw className="h-3 w-3" /> Rotación
                    </Label>
                    <Slider
                      value={[design.rotation]}
                      onValueChange={(v) => updateDesignLive(design.id, { rotation: v[0] })}
                      onValueCommit={(v) => commitDesignChange(design.id, { rotation: v[0] })}
                      min={0}
                      max={360}
                      step={1}
                      className="mt-1"
                    />
                    <span className="text-[10px] text-slate-400">{design.rotation}°</span>
                  </div>

                  <div>
                    <Label className="text-xs text-slate-600 flex items-center gap-2">
                      <ImageIcon className="h-3 w-3" /> Opacidad
                    </Label>
                    <Slider
                      value={[design.opacity]}
                      onValueChange={(v) => updateDesignLive(design.id, { opacity: v[0] })}
                      onValueCommit={(v) => commitDesignChange(design.id, { opacity: v[0] })}
                      min={0}
                      max={100}
                      step={5}
                      className="mt-1"
                    />
                    <span className="text-[10px] text-slate-400">{design.opacity}%</span>
                  </div>

                  <div>
                    <Label className="text-xs text-slate-600">Escala</Label>
                    <Slider
                      value={[design.scale]}
                      onValueChange={(v) => updateDesignLive(design.id, { scale: v[0] })}
                      onValueCommit={(v) => commitDesignChange(design.id, { scale: v[0] })}
                      min={0.05}
                      max={0.5}
                      step={0.01}
                      className="mt-1"
                    />
                    <span className="text-[10px] text-slate-400">{(design.scale * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'library' && (
            <LibraryTab onSelect={handleLibrarySelect} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB BIBLIOTECA
// ============================================================================
function LibraryTab({ onSelect }) {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch(`/api/design-library?search=${encodeURIComponent(search)}&page=${page}&limit=20`)
      .then(r => r.json())
      .then(data => {
        setDesigns(data.designs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, page]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Buscar diseños..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
        </div>
      ) : designs.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-4">No se encontraron diseños</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {designs.map(d => (
            <button
              key={d._id || d.id}
              onClick={() => onSelect(d)}
              className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-orange-400 transition-colors group"
            >
              <img
                src={d.url || d.thumbnailUrl}
                alt={d.name || 'Diseño'}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 rounded">
                  Usar
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Anterior
        </Button>
        <span className="text-xs text-slate-500">Página {page}</span>
        <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={designs.length < 20}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// EDITOR PRINCIPAL
// ============================================================================
export default function Mockup3DEditor() {
  const [activeTab, setActiveTab] = useState('garment');
  const [color, setColor] = useState('white');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isReady, setIsReady] = useState(false);

  const canvasContainerRef = useRef(null);

  // Undo/Redo
  const pushHistory = useCallback((newDesigns) => {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(newDesigns))];
      const trimmed = newHistory.slice(-30);
      setHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setDesigns(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setDesigns(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [history, historyIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Handle file upload
  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      const newDesign = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        url,
        name: file.name,
        rotation: 0,
        opacity: 100,
        scale: 0.15,
      };
      setDesigns([newDesign]);
      setSelectedDesignId(newDesign.id);
      pushHistory([newDesign]);
      setActiveTab('upload');
      toast.success('Diseño cargado en el modelo 3D');
    };
    reader.readAsDataURL(file);
  }, [pushHistory]);

  // Handle library select
  const handleLibrarySelect = useCallback((design) => {
    const url = design.url || design.thumbnailUrl;
    if (!url) {
      toast.error('Este diseño no tiene imagen');
      return;
    }
    const newDesign = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      url,
      name: design.name || 'Diseño de biblioteca',
      rotation: 0,
      opacity: 100,
      scale: 0.15,
    };
    setDesigns([newDesign]);
    setSelectedDesignId(newDesign.id);
    pushHistory([newDesign]);
    setActiveTab('upload');
    toast.success('Diseño aplicado al modelo 3D');
  }, [pushHistory]);

  // Remove design
  const removeDesign = useCallback((id) => {
    setDesigns([]);
    setSelectedDesignId(null);
    toast.success('Diseño eliminado');
  }, []);

  // Update design (live preview)
  const updateDesignLive = useCallback((id, updates) => {
    setDesigns(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  // Commit design change (for history)
  const commitDesignChange = useCallback((id, updates) => {
    setDesigns(prev => {
      const newDesigns = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      pushHistory(newDesigns);
      return newDesigns;
    });
  }, [pushHistory]);

  // Export as PNG
  const exportPNG = useCallback(() => {
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('No se encontró el canvas 3D');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `mockup-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Mockup exportado como PNG');
    } catch (err) {
      toast.error('Error al exportar');
    }
  }, []);

  const selectedDesign = designs.find(d => d.id === selectedDesignId);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-500 hover:text-slate-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Box className="h-5 w-5 text-orange-500" />
                Editor de Mockups 3D
              </h1>
              <p className="text-xs text-slate-500">Visualiza diseños sobre prendas en 3D realista</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Deshacer
            </Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
              <Redo2 className="h-3.5 w-3.5 mr-1" /> Rehacer
            </Button>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={exportPNG}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar PNG
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto p-4">
        <div className="flex gap-4">
          {/* Canvas 3D */}
          <div className="flex-1 relative" ref={canvasContainerRef}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 140px)', minHeight: '500px' }}>
              {!isReady ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                  <p className="text-sm text-slate-500 mt-3">Cargando modelo 3D...</p>
                  <p className="text-xs text-slate-400">Primera vez puede tardar unos segundos</p>
                </div>
              ) : (
                <Scene3D color={color} designUrl={selectedDesign?.url} />
              )}

              {/* Info overlay */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <Badge variant="outline" className="bg-white/80 backdrop-blur-sm">
                  <RotateCw className="h-3 w-3 mr-1" /> Arrastra para rotar
                </Badge>
                <Badge variant="outline" className="bg-white/80 backdrop-blur-sm">
                  <ZoomIn className="h-3 w-3 mr-1" /> Scroll para zoom
                </Badge>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <Sidebar
            color={color}
            setColor={setColor}
            designs={designs}
            selectedDesignId={selectedDesignId}
            selectDesign={setSelectedDesignId}
            removeDesign={removeDesign}
            updateDesignLive={updateDesignLive}
            commitDesignChange={commitDesignChange}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            handleFile={handleFile}
            handleLibrarySelect={handleLibrarySelect}
          />
        </div>
      </div>

      {/* Preloader invisible — precarga el modelo GLB */}
      {!isReady && (
        <Canvas style={{ display: 'none' }} gl={{ preserveDrawingBuffer: true }}>
          <Suspense fallback={null}>
            <ModelPreloader onReady={() => setIsReady(true)} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
