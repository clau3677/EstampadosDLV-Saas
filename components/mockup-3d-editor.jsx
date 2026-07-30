'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Undo2, Redo2,
  Download, Shirt, Loader2,
  RotateCw, Box,
} from 'lucide-react';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// COLORES REALES DEL CATÁLOGO
// ============================================================================
const GARMENT_COLORS = {
  blanco:       { label: 'Blanco',         hex: '#FFFFFF' },
  negro:        { label: 'Negro',          hex: '#1A1A1A' },
  gris:         { label: 'Gris',           hex: '#8C8C8C' },
  'gris-melange': { label: 'Gris Melange', hex: '#6B6B6B' },
  azul_marino:  { label: 'Azul Marino',    hex: '#1B2A4A' },
  rojo:         { label: 'Rojo',           hex: '#C41E1E' },
  verde:        { label: 'Verde',          hex: '#1E5E3A' },
  'verde-botella': { label: 'Verde Botella', hex: '#0A3D2E' },
  azul_rey:     { label: 'Azul Rey',       hex: '#1560BD' },
  fucsia:       { label: 'Fucsia',         hex: '#D91D7C' },
  naranjo:      { label: 'Naranjo',        hex: '#F57C00' },
  amarillo:      { label: 'Amarillo',       hex: '#F5C518' },
  burdeo:       { label: 'Burdeo',         hex: '#7B1113' },
  celeste:      { label: 'Celeste',        hex: '#87CEEB' },
  turquesa:     { label: 'Turquesa',       hex: '#008080' },
  lila:         { label: 'Lila',           hex: '#8A6FC3' },
  mostaza:      { label: 'Mostaza',        hex: '#D4A017' },
  beige:        { label: 'Beige',          hex: '#D2B48C' },
  rosado:       { label: 'Rosado',         hex: '#F8BBD0' },
  menta:        { label: 'Menta',          hex: '#98FF98' },
};

const MODEL_URL = '/mockups/shirt_baked.glb';

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
    this.originalMaterials = new Map();
    this.targetColor = new THREE.Color('#FFFFFF');
    this.currentColor = new THREE.Color('#FFFFFF');
    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rotationY = 0.3;
    this.targetRotationY = 0.3;
    this.pitch = 0.0;
    this.targetPitch = 0.0;
    this.distance = 2.5;
    this.targetDistance = 2.5;
    this.animationId = null;
    this.isPlaying = true;
    this.designPlane = null;
    this.designTexture = null;
    this.designScale = 0.3;
    this.designOffsetX = 0;
    this.designOffsetY = 0.1;

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8f9fa);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 100);
    this.camera.position.set(0, 0.1, 2.5);

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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Lighting - strong and balanced
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.002;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd4e4ff, 0.8);
    fillLight.position.set(-3, 2, 2);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 3, -4);
    this.scene.add(rimLight);

    // Ground shadow
    const groundGeo = new THREE.PlaneGeometry(4, 4);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Mouse events
    this._onMouseDown = (e) => { this.mouseDown = true; this.mouseX = e.clientX; this.mouseY = e.clientY; };
    this._onMouseMove = (e) => {
      if (!this.mouseDown) return;
      const dx = e.clientX - this.mouseX;
      const dy = e.clientY - this.mouseY;
      this.targetRotationY += dx * 0.01;
      this.targetPitch = Math.max(-0.6, Math.min(0.6, this.targetPitch - dy * 0.01));
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    this._onMouseUp = () => { this.mouseDown = false; };
    this._onWheel = (e) => {
      e.preventDefault();
      this.targetDistance = Math.max(1.5, Math.min(5, this.targetDistance + e.deltaY * 0.002));
    };
    this._onResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    container.addEventListener('mousedown', this._onMouseDown);
    container.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    container.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('resize', this._onResize);

    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(container);

    this.animate();
  }

  async loadModel(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;

          // Auto-fit
          const box = new THREE.Box3().setFromObject(this.model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.3 / maxDim;
          this.model.scale.setScalar(scale);
          this.model.position.sub(center.multiplyScalar(scale));
          this.model.position.y += 0.05;

          // Store original materials and cast shadows
          this.model.traverse((child) => {
            if (child.isMesh) {
              this.originalMaterials.set(child, child.material.clone());
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this.scene.add(this.model);

          // Apply initial color
          this.applyGarmentColor();

          resolve(gltf);
        },
        undefined,
        reject
      );
    });
  }

  applyGarmentColor() {
    if (!this.model) return;
    this.model.traverse((child) => {
      if (child.isMesh) {
        // Clone the original material to preserve textures/normal maps
        const original = this.originalMaterials.get(child);
        if (original) {
          const newMat = original.clone();
          // For the t-shirt model, the baked material has a texture
          // We override the color with a tint
          newMat.color.copy(this.currentColor);
          // Keep roughness reasonable for fabric
          newMat.roughness = 0.7;
          newMat.metalness = 0.0;
          // Keep emissive at 0
          newMat.emissive = new THREE.Color(0x000000);
          child.material = newMat;
        }
      }
    });
  }

  setColor(hexColor) {
    this.targetColor.set(hexColor);
    // Apply immediately, not via lerp
    this.currentColor.set(hexColor);
    this.applyGarmentColor();
  }

  setDesignTexture(imageUrl) {
    if (!imageUrl) {
      if (this.designPlane) {
        this.scene.remove(this.designPlane);
        if (this.designTexture) this.designTexture.dispose();
        this.designPlane.geometry.dispose();
        this.designPlane.material.dispose();
        this.designPlane = null;
        this.designTexture = null;
      }
      return;
    }

    // Remove old design
    if (this.designPlane) {
      this.scene.remove(this.designPlane);
      if (this.designTexture) this.designTexture.dispose();
      this.designPlane.geometry.dispose();
      this.designPlane.material.dispose();
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        this.designTexture = texture;

        // Create a curved plane that sits on the chest area
        // Using a subdivided plane with slight curvature
        const width = 0.3;
        const height = 0.3;
        const geometry = new THREE.PlaneGeometry(width, height, 20, 20);

        // Apply slight curvature to follow the chest
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          // Curve the plane outward (positive z) based on x position
          const curve = (x * x) * 0.8;
          positions.setZ(i, curve);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });

        this.designPlane = new THREE.Mesh(geometry, material);
        this.designPlane.renderOrder = 10;

        // Position on the chest
        this.updateDesignPosition();

        this.scene.add(this.designPlane);
      },
      undefined,
      (err) => {
        console.error('Error loading design texture:', err);
      }
    );
  }

  updateDesignPosition() {
    if (!this.designPlane || !this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    this.designPlane.position.set(
      center.x + this.designOffsetX,
      center.y + this.designOffsetY,
      center.z + size.z * 0.45 + 0.01
    );
  }

  scaleDesign(factor) {
    this.designScale = Math.max(0.1, Math.min(0.6, this.designScale * factor));
    if (this.designPlane) {
      this.designPlane.scale.setScalar(this.designScale / 0.3);
    }
  }

  moveDesign(dx, dy) {
    this.designOffsetX += dx * 0.02;
    this.designOffsetY += dy * 0.02;
    this.updateDesignPosition();
  }

  resetDesign() {
    this.designOffsetX = 0;
    this.designOffsetY = 0.1;
    this.designScale = 0.3;
    if (this.designPlane) {
      this.designPlane.scale.setScalar(1);
    }
    this.updateDesignPosition();
  }

  animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    // Smooth rotation
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.pitch += (this.targetPitch - this.pitch) * 0.1;
    this.distance += (this.targetDistance - this.distance) * 0.1;

    this.camera.position.x = Math.sin(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.position.y = Math.sin(this.pitch) * this.distance + 0.1;
    this.camera.position.z = Math.cos(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  exportCanvas() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    if (this.container) {
      this.container.removeEventListener('mousedown', this._onMouseDown);
      this.container.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
      this.container.removeEventListener('wheel', this._onWheel);
    }
    window.removeEventListener('resize', this._onResize);
  }
}

// ============================================================================
// LIBRARY TAB COMPONENT
// ============================================================================
function LibraryTab({ onSelect }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const PER_PAGE = 8;

  useEffect(() => {
    const params = new URLSearchParams({ page, limit: PER_PAGE });
    if (search) params.set('search', search);
    setLoading(true);
    fetch(`/api/design-library?${params}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Buscar diseños..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No se encontraron diseños</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item._id || item.id}
              onClick={() => onSelect(item.imageUrl || item.url || item.thumbnailUrl || '')}
              className="group relative aspect-square rounded-lg overflow-hidden border border-slate-100 hover:border-orange-400 transition-all bg-white"
            >
              <img
                src={item.imageUrl || item.url || item.thumbnailUrl || ''}
                alt={item.title || item.name || 'Diseño'}
                className="w-full h-full object-contain p-1"
                onError={(e) => { e.target.src = ''; e.target.parentElement.style.background = '#f1f5f9'; }}
              />
            </button>
          ))}
        </div>
      )}

      {items.length >= PER_PAGE && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded text-sm border disabled:opacity-40 hover:border-orange-400"
          >
            ←
          </button>
          <span className="text-sm text-slate-500">Página {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded text-sm border hover:border-orange-400"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function Mockup3DEditor() {
  const [activeTab, setActiveTab] = useState('prenda');
  const [color, setColor] = useState('blanco');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllColors, setShowAllColors] = useState(false);
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasContainerRef = useRef(null);
  const sceneRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const timer = setTimeout(() => {
      const scene = new ThreeScene(canvasContainerRef.current);
      sceneRef.current = scene;

      scene.loadModel(MODEL_URL)
        .then(() => {
          setLoading(false);
          scene.setColor(GARMENT_COLORS.blanco.hex);
        })
        .catch((err) => {
          console.error('Error loading model:', err);
          setError('No se pudo cargar el modelo 3D. Intenta recargar la página.');
          setLoading(false);
        });
    }, 50);

    return () => {
      clearTimeout(timer);
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  // Update color
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#FFFFFF');
  }, [color]);

  // Update design texture
  useEffect(() => {
    if (sceneRef.current) {
      const design = designs.find(d => d.id === selectedDesignId);
      sceneRef.current.setDesignTexture(design?.imageUrl || design?.url || null);
    }
  }, [designs, selectedDesignId]);

  const pushHistory = useCallback((newDesigns) => {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(newDesigns))];
      const trimmed = newHistory.slice(-30);
      setHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  }, [historyIndex]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes (PNG, JPG, WEBP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      const newDesign = { id: Date.now().toString(), imageUrl: url, name: file.name };
      const newDesigns = [...designs, newDesign];
      setDesigns(newDesigns);
      setSelectedDesignId(newDesign.id);
      pushHistory(newDesigns);
      toast.success('Diseño subido correctamente');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLibrarySelect = (imageUrl) => {
    if (!imageUrl) return;
    const newDesign = { id: Date.now().toString(), imageUrl, name: 'Biblioteca' };
    const newDesigns = [...designs, newDesign];
    setDesigns(newDesigns);
    setSelectedDesignId(newDesign.id);
    pushHistory(newDesigns);
    toast.success('Diseño de biblioteca seleccionado');
  };

  const removeDesign = (id) => {
    const newDesigns = designs.filter(d => d.id !== id);
    setDesigns(newDesigns);
    if (selectedDesignId === id) setSelectedDesignId(null);
    pushHistory(newDesigns);
    toast.success('Diseño eliminado');
  };

  const exportPNG = () => {
    if (!sceneRef.current) return;
    const dataUrl = sceneRef.current.exportCanvas();
    const link = document.createElement('a');
    link.download = `mockup-polera-${color}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('Mockup exportado como PNG');
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    setHistoryIndex(historyIndex - 1);
    const prevDesigns = history[historyIndex - 1];
    setDesigns(prevDesigns);
    setSelectedDesignId(prevDesigns.length > 0 ? prevDesigns[prevDesigns.length - 1].id : null);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex(historyIndex + 1);
    const nextDesigns = history[historyIndex + 1];
    setDesigns(nextDesigns);
    setSelectedDesignId(nextDesigns.length > 0 ? nextDesigns[nextDesigns.length - 1].id : null);
  };

  const colorEntries = Object.entries(GARMENT_COLORS);
  const visibleColors = showAllColors ? colorEntries : colorEntries.slice(0, 8);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b bg-white shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-orange-500" />
            <h1 className="text-lg font-semibold text-slate-800">Editor de Mockups 3D</h1>
          </div>
          <p className="text-sm text-slate-400 hidden sm:block">Visualiza diseños sobre prendas en 3D realista</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={historyIndex <= 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border hover:bg-slate-50 disabled:opacity-40">
            <Undo2 className="h-4 w-4" /> Deshacer
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border hover:bg-slate-50 disabled:opacity-40">
            <Redo2 className="h-4 w-4" /> Rehacer
          </button>
          <button onClick={exportPNG}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 font-medium">
            <Download className="h-4 w-4" /> Exportar PNG
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative bg-white">
          <div ref={canvasContainerRef} className="w-full h-full" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Cargando modelo 3D...</p>
                <p className="text-xs text-slate-400 mt-1">La primera vez puede tardar unos segundos</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center px-6">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Bottom hints */}
          <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-slate-400">
            <span>Arrastra para rotar</span>
            <span>Scroll para zoom</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l bg-white flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            {[
              { key: 'prenda', label: 'Prenda', icon: Shirt },
              { key: 'diseno', label: 'Diseño', icon: Upload },
              { key: 'biblioteca', label: 'Biblioteca', icon: RotateCw },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-orange-600 border-b-2 border-orange-500'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'prenda' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Shirt className="h-4 w-4" /> Color de prenda
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {visibleColors.map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setColor(key)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                          color === key
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-full border border-slate-200 shadow-sm"
                          style={{ backgroundColor: val.hex }}
                        />
                        <span className="text-[10px] text-slate-600 leading-tight">{val.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAllColors(!showAllColors)}
                    className="mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    {showAllColors ? 'Ver menos colores' : `Ver todos los colores (${colorEntries.length})`}
                  </button>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-slate-500">
                    <strong>Polera</strong> — Modelo 3D con iluminación de estudio profesional.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Colores sincronizados con el catálogo de la tienda
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'diseno' && (
              <div className="space-y-4">
                {/* Upload */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Upload className="h-4 w-4" /> Subir diseño
                  </h3>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-4 rounded-lg border-2 border-dashed border-slate-300 hover:border-orange-400 transition-colors text-center"
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600">Click para subir tu diseño</p>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG o WEBP</p>
                  </button>
                </div>

                {/* Current design */}
                {designs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Diseños subidos</h3>
                    <div className="space-y-2">
                      {designs.map(d => (
                        <div key={d.id} className={`flex items-center gap-2 p-2 rounded-lg border ${
                          selectedDesignId === d.id ? 'border-orange-400 bg-orange-50' : 'border-slate-100'
                        }`}>
                          <button
                            onClick={() => setSelectedDesignId(d.id)}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            <img src={d.imageUrl} alt={d.name} className="w-10 h-10 object-contain rounded bg-white" />
                            <span className="text-xs text-slate-600 truncate">{d.name}</span>
                          </button>
                          <button
                            onClick={() => removeDesign(d.id)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Design controls */}
                {selectedDesignId && (
                  <div className="space-y-3 pt-2 border-t">
                    <h3 className="text-sm font-semibold text-slate-700">Controles del diseño</h3>
                    
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Tamaño</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => sceneRef.current?.scaleDesign(0.9)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">−</button>
                        <button onClick={() => sceneRef.current?.scaleDesign(1.1)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">+</button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Posición</label>
                      <div className="grid grid-cols-3 gap-1 max-w-[120px]">
                        <div />
                        <button onClick={() => sceneRef.current?.moveDesign(0, 1)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">↑</button>
                        <div />
                        <button onClick={() => sceneRef.current?.moveDesign(-1, 0)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">←</button>
                        <button onClick={() => sceneRef.current?.moveDesign(0, -1)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">↓</button>
                        <button onClick={() => sceneRef.current?.moveDesign(1, 0)}
                          className="px-2 py-1 rounded border text-xs hover:border-orange-400">→</button>
                      </div>
                    </div>

                    <button onClick={() => sceneRef.current?.resetDesign()}
                      className="text-xs text-orange-600 hover:text-orange-700">
                      Resetear posición
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'biblioteca' && (
              <LibraryTab onSelect={handleLibrarySelect} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
