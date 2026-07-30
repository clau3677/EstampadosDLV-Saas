'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
// THREE.JS IMPORTS (directas, sin React Three Fiber)
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
// THREE.JS SCENE MANAGER
// ============================================================================
class ThreeScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.decalMesh = null;
    this.targetColor = new THREE.Color('#F5F5F0');
    this.currentColor = new THREE.Color('#F5F5F0');
    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.pitch = 0;
    this.targetPitch = 0;
    this.distance = 3;
    this.targetDistance = 3;
    this.animationId = null;
    this.isPlaying = true;

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    // Camera
    this.camera = new THREE.PerspectiveCamera(30, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, 3);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(5, 5, 5);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xc8d8ff, 0.3);
    dirLight2.position.set(-5, 3, -5);
    this.scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(0, 5, 0);
    this.scene.add(pointLight);

    // Floor for shadow
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid helper (subtle)
    const gridHelper = new THREE.GridHelper(10, 20, 0xe2e8f0, 0xe2e8f0);
    gridHelper.position.y = -1.49;
    this.scene.add(gridHelper);

    // Mouse events for orbit
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());
    this.renderer.domElement.addEventListener('mouseleave', () => this.onMouseUp());
    this.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e));
    this.renderer.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.renderer.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.renderer.domElement.addEventListener('touchend', () => this.onMouseUp());

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Start animation
    this.animate();
  }

  onMouseDown(e) {
    this.mouseDown = true;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  onMouseMove(e) {
    if (!this.mouseDown) return;
    const dx = e.clientX - this.mouseX;
    const dy = e.clientY - this.mouseY;
    this.targetRotationY += dx * 0.005;
    this.targetPitch += dy * 0.005;
    this.targetPitch = Math.max(-0.5, Math.min(0.5, this.targetPitch));
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  onMouseUp() {
    this.mouseDown = false;
  }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.mouseDown = true;
      this.mouseX = e.touches[0].clientX;
      this.mouseY = e.touches[0].clientY;
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    if (!this.mouseDown || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - this.mouseX;
    const dy = e.touches[0].clientY - this.mouseY;
    this.targetRotationY += dx * 0.005;
    this.targetPitch += dy * 0.005;
    this.targetPitch = Math.max(-0.5, Math.min(0.5, this.targetPitch));
    this.mouseX = e.touches[0].clientX;
    this.mouseY = e.touches[0].clientY;
  }

  onWheel(e) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.002;
    this.targetDistance = Math.max(2, Math.min(6, this.targetDistance));
  }

  onResize() {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  async loadModel(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        this.model = gltf.scene;
        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.scene.add(this.model);
        resolve(gltf);
      }, undefined, reject);
    });
  }

  setColor(hex) {
    this.targetColor.set(hex);
  }

  setDesignTexture(url) {
    if (!url) {
      if (this.decalMesh) {
        this.scene.remove(this.decalMesh);
        this.decalMesh.geometry.dispose();
        this.decalMesh = null;
      }
      return;
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;

      // Remove old decal
      if (this.decalMesh) {
        this.scene.remove(this.decalMesh);
        this.decalMesh.geometry.dispose();
      }

      // Create decal mesh
      const decalGeo = new THREE.PlaneGeometry(0.3, 0.3);
      const decalMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: true,
      });
      this.decalMesh = new THREE.Mesh(decalGeo, decalMat);
      this.decalMesh.position.set(0, 0.04, 0.16);
      this.scene.add(this.decalMesh);
    });
  }

  animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    // Smooth interpolation
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.08;
    this.pitch += (this.targetPitch - this.pitch) * 0.08;
    this.distance += (this.targetDistance - this.distance) * 0.08;
    this.currentColor.lerp(this.targetColor, 0.06);

    // Update camera position (orbit)
    this.camera.position.x = Math.sin(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.position.y = Math.sin(this.pitch) * this.distance;
    this.camera.position.z = Math.cos(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.lookAt(0, 0, 0);

    // Update model color
    if (this.model) {
      this.model.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => { m.color.copy(this.currentColor); });
          } else {
            child.material.color.copy(this.currentColor);
          }
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  exportCanvas() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.model) {
      this.scene.remove(this.model);
    }
    if (this.decalMesh) {
      this.scene.remove(this.decalMesh);
    }
  }
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasContainerRef = useRef(null);
  const sceneRef = useRef(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const scene = new ThreeScene(canvasContainerRef.current);
    sceneRef.current = scene;

    // Load model
    scene.loadModel('/mockups/shirt_baked.glb')
      .then(() => {
        setLoading(false);
        scene.setColor(GARMENT_COLORS.white.hex);
      })
      .catch((err) => {
        console.error('Error loading model:', err);
        setError('No se pudo cargar el modelo 3D. Intenta recargar la página.');
        setLoading(false);
      });

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Update color
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#F5F5F0');
    }
  }, [color]);

  // Update design texture
  useEffect(() => {
    if (sceneRef.current) {
      const design = designs.find(d => d.id === selectedDesignId);
      sceneRef.current.setDesignTexture(design?.url || null);
    }
  }, [designs, selectedDesignId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Push history
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

  // Export as PNG
  const exportPNG = useCallback(() => {
    if (sceneRef.current) {
      try {
        const dataUrl = sceneRef.current.exportCanvas();
        const link = document.createElement('a');
        link.download = `mockup-estampadosdlv-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        toast.success('Mockup exportado como PNG');
      } catch (err) {
        toast.error('Error al exportar');
      }
    }
  }, []);

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
          <div className="flex-1 relative">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 140px)', minHeight: '500px' }}>
              {error && (
                <div className="flex flex-col items-center justify-center h-full bg-rose-50/60 px-6 text-center">
                  <span className="text-2xl mb-3">⚠️</span>
                  <div className="text-sm font-semibold text-slate-800">Error al cargar el editor</div>
                  <div className="text-xs text-slate-600 mt-1 max-w-md">{error}</div>
                  <Button onClick={() => window.location.reload()} size="sm" className="mt-4">
                    Recargar la página
                  </Button>
                </div>
              )}

              {!error && loading && (
                <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100">
                  <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
                  <p className="text-sm font-medium text-slate-600 mt-4">Cargando modelo 3D...</p>
                  <p className="text-xs text-slate-400 mt-1">La primera vez puede tardar unos segundos</p>
                </div>
              )}

              <div ref={canvasContainerRef} className="w-full h-full" />

              {/* Info overlay */}
              {!error && !loading && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-none">
                  <Badge variant="outline" className="bg-white/80 backdrop-blur-sm pointer-events-auto">
                    <RotateCw className="h-3 w-3 mr-1" /> Arrastra para rotar
                  </Badge>
                  <Badge variant="outline" className="bg-white/80 backdrop-blur-sm pointer-events-auto">
                    <ZoomIn className="h-3 w-3 mr-1" /> Scroll para zoom
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
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

                    {designs.length > 0 && selectedDesignId && (
                      <div className="space-y-3 border-t border-slate-100 pt-3">
                        {designs.map(d => (
                          <div key={d.id}>
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4 text-slate-500" />
                              <span className="text-xs text-slate-600 truncate flex-1">{d.name}</span>
                              <button
                                onClick={() => removeDesign(d.id)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
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
        </div>
      </div>
    </div>
  );
}
