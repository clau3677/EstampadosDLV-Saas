'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Undo2, Redo2,
  Download, Shirt, Loader2,
  Sparkles, RotateCw, Palette, ZoomIn, Box,
  RotateCcw, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// COLORES REALES DEL CATÁLOGO (hex extraídos de las variaciones)
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
  amarillo:     { label: 'Amarillo',       hex: '#F5C518' },
  burdeo:       { label: 'Burdeo',         hex: '#7B1113' },
  celeste:      { label: 'Celeste',        hex: '#87CEEB' },
  turquesa:     { label: 'Turquesa',       hex: '#008080' },
  lila:         { label: 'Lila',           hex: '#8A6FC3' },
  mostaza:      { label: 'Mostaza',        hex: '#D4A017' },
  beige:        { label: 'Beige',          hex: '#D2B48C' },
  rosado:       { label: 'Rosado',         hex: '#F8BBD0' },
  menta:        { label: 'Menta',          hex: '#98FF98' },
};

// ============================================================================
// TIPOS DE PRENDA (los 3 principales del catálogo)
// ============================================================================
const GARMENTS = {
  polera:     { label: 'Polera',     model: '/mockups/shirt_baked.glb', icon: '👕' },
  poleron:    { label: 'Polerón',    model: '/mockups/shirt_baked.glb', icon: '🧥' },
  gorra:      { label: 'Gorra',      model: '/mockups/shirt_baked.glb', icon: '🧢' },
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
    this.targetColor = new THREE.Color('#FFFFFF');
    this.currentColor = new THREE.Color('#FFFFFF');
    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rotationY = 0.0;
    this.targetRotationY = 0.0;
    this.pitch = 0.0;
    this.targetPitch = 0.0;
    this.distance = 2.8;
    this.targetDistance = 2.8;
    this.animationId = null;
    this.isPlaying = true;
    this.materialsReplaced = false;
    this.colorMaterial = null;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.01, 100);
    this.camera.position.set(0, 0, 3);

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
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Lighting - professional studio setup
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    keyLight.position.set(2.5, 3, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.001;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.7);
    fillLight.position.set(-3, 1.5, 2);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 2, -3.5);
    this.scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 5, 0);
    this.scene.add(topLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x886644, 0.25);
    this.scene.add(hemiLight);

    const floorGeo = new THREE.PlaneGeometry(8, 8);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Mouse/touch events
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());
    this.renderer.domElement.addEventListener('mouseleave', () => this.onMouseUp());
    this.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.renderer.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.renderer.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.renderer.domElement.addEventListener('touchend', () => this.onMouseUp());

    this._resizeObserver = new ResizeObserver(() => this.onResize());
    this._resizeObserver.observe(this.container);

    this.animate();
  }

  onMouseDown(e) { this.mouseDown = true; this.mouseX = e.clientX; this.mouseY = e.clientY; }
  onMouseMove(e) {
    if (!this.mouseDown) return;
    const dx = e.clientX - this.mouseX;
    const dy = e.clientY - this.mouseY;
    this.targetRotationY += dx * 0.008;
    this.targetPitch += dy * 0.008;
    this.targetPitch = Math.max(-0.5, Math.min(0.5, this.targetPitch));
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }
  onMouseUp() { this.mouseDown = false; }
  onTouchStart(e) {
    if (e.touches.length === 1) { this.mouseDown = true; this.mouseX = e.touches[0].clientX; this.mouseY = e.touches[0].clientY; }
  }
  onTouchMove(e) {
    e.preventDefault();
    if (!this.mouseDown || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - this.mouseX;
    const dy = e.touches[0].clientY - this.mouseY;
    this.targetRotationY += dx * 0.008;
    this.targetPitch += dy * 0.008;
    this.targetPitch = Math.max(-0.5, Math.min(0.5, this.targetPitch));
    this.mouseX = e.touches[0].clientX;
    this.mouseY = e.touches[0].clientY;
  }
  onWheel(e) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.002;
    this.targetDistance = Math.max(1.8, Math.min(5.5, this.targetDistance));
  }
  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  async loadModel(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        if (this.model) this.scene.remove(this.model);
        this.model = gltf.scene;
        this.materialsReplaced = false;
        this.colorMaterial = null;

        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Auto-fit model to camera view
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 1.2;
        const scale = targetSize / maxDim;
        this.model.scale.setScalar(scale);
        this.model.position.sub(center.multiplyScalar(scale));
        this.model.position.y += 0.1;

        this.scene.add(this.model);

        requestAnimationFrame(() => {
          this.applyGarmentColor();
        });

        resolve(gltf);
      }, undefined, reject);
    });
  }

  /**
   * Aplicar color a la prenda SIN usar MeshBasicMaterial para el decal.
   * El decal usa su propio material independiente que NO se ve afectado por el color de la prenda.
   */
  applyGarmentColor() {
    if (!this.model) return;

    // Crear un material compartido para toda la prenda
    if (!this.colorMaterial) {
      this.colorMaterial = new THREE.MeshStandardMaterial({
        color: this.currentColor.clone(),
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    }

    this.model.traverse((child) => {
      if (child.isMesh && child !== this.decalMesh) {
        // Clonar el material compartido para cada mesh (para que no comparta referencia)
        const mat = this.colorMaterial.clone();
        mat.color.copy(this.currentColor);
        mat.roughness = 0.85;
        mat.metalness = 0.0;
        mat.side = THREE.DoubleSide;
        child.material = mat;
      }
    });
  }

  setColor(hex) {
    this.targetColor.set(hex);
    this.applyGarmentColor();
  }

  /**
   * Coloca la imagen del diseño como un mesh independiente que NO es afectado
   * por el color de la prenda. Usa MeshBasicMaterial con blending para que
   * los colores de la imagen se muestren exactamente como son.
   */
  setDesignTexture(url) {
    if (!url) {
      this.removeDecal();
      return;
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      this.removeDecal();

      // Usar MeshBasicMaterial con transparent: true
      // El blending normal asegura que los colores de la imagen se respeten
      const decalGeo = new THREE.PlaneGeometry(0.3, 0.3);
      const decalMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.01, // Descarta píxeles casi transparentes
        depthTest: true,
        depthWrite: false, // No escribir en el depth buffer para evitar clipping
        side: THREE.DoubleSide,
      });
      this.decalMesh = new THREE.Mesh(decalGeo, decalMat);
      this.decalMesh.position.set(0, 0.12, 0.32);
      // Pequeño offset para evitar z-fighting con la prenda
      this.decalMesh.renderOrder = 1;

      this.scene.add(this.decalMesh);
    });
  }

  removeDecal() {
    if (this.decalMesh) {
      this.scene.remove(this.decalMesh);
      if (this.decalMesh.material.map) this.decalMesh.material.map.dispose();
      this.decalMesh.material.dispose();
      this.decalMesh.geometry.dispose();
      this.decalMesh = null;
    }
  }

  scaleDecal(factor) {
    if (!this.decalMesh) return;
    const s = this.decalMesh.scale;
    s.x = Math.max(0.3, Math.min(3.0, s.x * factor));
    s.y = Math.max(0.3, Math.min(3.0, s.y * factor));
    s.z = s.x;
  }

  moveDecal(dx, dy) {
    if (!this.decalMesh) return;
    this.decalMesh.position.x += dx * 0.02;
    this.decalMesh.position.y += dy * 0.02;
  }

  resetDecal() {
    if (!this.decalMesh) return;
    this.decalMesh.position.set(0, 0.12, 0.32);
    this.decalMesh.scale.set(1, 1, 1);
  }

  animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.pitch += (this.targetPitch - this.pitch) * 0.1;
    this.distance += (this.targetDistance - this.distance) * 0.1;
    this.currentColor.lerp(this.targetColor, 0.08);

    this.camera.position.x = Math.sin(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.position.y = Math.sin(this.pitch) * this.distance + 0.1;
    this.camera.position.z = Math.cos(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.lookAt(0, 0, 0);

    // Actualizar color del material de la prenda
    if (this.colorMaterial) {
      this.colorMaterial.color.copy(this.currentColor);
      this.applyGarmentColor();
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
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    if (this.model) this.scene.remove(this.model);
    this.removeDecal();
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
    setLoading(true);
    fetch(`/api/design-library?page=${page}&size=20${search ? '&search=' + encodeURIComponent(search) : ''}`)
      .then(r => r.json())
      .then(data => {
        setDesigns(data.items || []);
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
              <img src={d.imageUrl || d.url || d.thumbnailUrl} alt={d.name || 'Diseño'} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 rounded">Usar</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
        <span className="text-xs text-slate-500">Página {page}</span>
        <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={designs.length < 20}>Siguiente</Button>
      </div>
    </div>
  );
}

// ============================================================================
// EDITOR PRINCIPAL
// ============================================================================
export default function Mockup3DEditor() {
  const [activeTab, setActiveTab] = useState('garment');
  const [color, setColor] = useState('blanco');
  const [garment, setGarment] = useState('polera');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [decalScale, setDecalScale] = useState(1);
  const canvasContainerRef = useRef(null);
  const sceneRef = useRef(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const timer = setTimeout(() => {
      const scene = new ThreeScene(canvasContainerRef.current);
      sceneRef.current = scene;

      scene.loadModel(GARMENTS[garment].model)
        .then(() => {
          setLoading(false);
          scene.setColor(GARMENT_COLORS.blanco.hex);
        })
        .catch((err) => {
          console.error('Error loading model:', err);
          setError('No se pudo cargar el modelo 3D. Intenta recargar la página.');
          setLoading(false);
        });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  // Track last loaded model to avoid unnecessary reloads
  const lastModelRef = useRef(null);

  // Update garment model when type changes
  useEffect(() => {
    if (!sceneRef.current || !GARMENTS[garment]) return;
    const modelUrl = GARMENTS[garment].model;
    
    // Only reload if it's a different model file
    if (lastModelRef.current === modelUrl && sceneRef.current.model) {
      // Same model, just ensure color is applied
      sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#FFFFFF');
      return;
    }
    
    setLoading(true);
    setError(null);
    sceneRef.current.loadModel(modelUrl)
      .then(() => {
        lastModelRef.current = modelUrl;
        setLoading(false);
        sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#FFFFFF');
      })
      .catch((err) => {
        console.error('Error loading garment model:', err);
        setError('No se pudo cargar este modelo 3D.');
        setLoading(false);
      });
  }, [garment]);

  // Update color when selected color changes
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#FFFFFF');
  }, [color]);

  // Update design texture
  useEffect(() => {
    if (sceneRef.current) {
      const design = designs.find(d => d.id === selectedDesignId);
      sceneRef.current.setDesignTexture(design?.url || null);
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

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      const newDesign = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        url,
        name: file.name,
      };
      setDesigns([newDesign]);
      setSelectedDesignId(newDesign.id);
      setDecalScale(1);
      pushHistory([newDesign]);
      setActiveTab('upload');
      toast.success('Diseño cargado en el modelo 3D');
    };
    reader.readAsDataURL(file);
  }, [pushHistory]);

  const handleLibrarySelect = useCallback((design) => {
    const url = design.imageUrl || design.url || design.thumbnailUrl;
    if (!url) { toast.error('Este diseño no tiene imagen'); return; }
    const newDesign = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      url,
      name: design.name || 'Diseño de biblioteca',
    };
    setDesigns([newDesign]);
    setSelectedDesignId(newDesign.id);
    setDecalScale(1);
    pushHistory([newDesign]);
    setActiveTab('upload');
    toast.success('Diseño aplicado al modelo 3D');
  }, [pushHistory]);

  const removeDesign = useCallback(() => {
    setDesigns([]);
    setSelectedDesignId(null);
    setDecalScale(1);
    toast.success('Diseño eliminado');
  }, []);

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

  const handleScaleChange = useCallback((val) => {
    const factor = val[0] / decalScale;
    setDecalScale(val[0]);
    if (sceneRef.current) sceneRef.current.scaleDecal(factor);
  }, [decalScale]);

  const handleMove = useCallback((dx, dy) => {
    if (sceneRef.current) sceneRef.current.moveDecal(dx, dy);
  }, []);

  const handleResetDecal = useCallback(() => {
    setDecalScale(1);
    if (sceneRef.current) sceneRef.current.resetDecal();
  }, []);

  // Group colors for display (mostrar los más populares primero, luego el resto)
  const primaryColors = ['blanco', 'negro', 'gris', 'gris-melange', 'azul_marino', 'rojo', 'verde', 'verde-botella'];
  const secondaryColors = Object.keys(GARMENT_COLORS).filter(c => !primaryColors.includes(c));
  const [showAllColors, setShowAllColors] = useState(false);
  const visibleColors = showAllColors ? Object.keys(GARMENT_COLORS) : primaryColors;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-[1800px] mx-auto px-4 py-2.5 flex items-center justify-between">
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
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Canvas 3D */}
        <div className="flex-1 relative p-3 min-h-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full relative min-h-[400px]">
            {error && (
              <div className="flex flex-col items-center justify-center h-full bg-rose-50/60 px-6 text-center">
                <span className="text-2xl mb-3">⚠️</span>
                <div className="text-sm font-semibold text-slate-800">Error al cargar el editor</div>
                <div className="text-xs text-slate-600 mt-1 max-w-md">{error}</div>
                <Button onClick={() => window.location.reload()} size="sm" className="mt-4">Recargar</Button>
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
        <div className="w-80 xl:w-96 shrink-0 border-l border-slate-200 bg-white flex flex-col">
          <div className="flex border-b border-slate-200 shrink-0">
            {[
              { id: 'garment', label: 'Prenda', icon: Shirt },
              { id: 'upload', label: 'Diseño', icon: Upload },
              { id: 'library', label: 'Biblioteca', icon: Sparkles },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                `}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 overflow-y-auto flex-1">
            {activeTab === 'garment' && (
              <div className="space-y-5">
                {/* Tipo de prenda */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Shirt className="h-4 w-4" /> Tipo de prenda
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(GARMENTS).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => { setGarment(key); }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                          garment === key
                            ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                            : 'border-slate-200 hover:border-slate-300'}
                        `}
                      >
                        <span className="text-lg">{val.icon}</span>
                        <span className="text-[10px] text-slate-600 font-medium">{val.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color de prenda */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Palette className="h-4 w-4" /> Color de prenda
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {visibleColors.map(key => {
                      const val = GARMENT_COLORS[key];
                      return (
                        <button
                          key={key}
                          onClick={() => setColor(key)}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all ${
                            color === key
                              ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                              : 'border-slate-200 hover:border-slate-300'}
                          `}
                        >
                          <div className="w-6 h-6 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: val.hex }} />
                          <span className="text-[9px] text-slate-600 font-medium text-center leading-tight">{val.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowAllColors(!showAllColors)}
                    className="text-xs text-orange-600 hover:text-orange-700 mt-2 font-medium"
                  >
                    {showAllColors ? 'Ver menos colores' : `Ver todos los colores (${Object.keys(GARMENT_COLORS).length})`}
                  </button>
                </div>

                {/* Info */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    <strong className="text-slate-700">{GARMENTS[garment].label}</strong> — Modelo 3D con iluminación de estudio profesional. Arrastra para rotar, scroll para zoom.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2">Colores sincronizados con el catálogo de la tienda</p>
                </div>
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-orange-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('design-upload')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }}
                >
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-600">Arrastra tu diseño aquí</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG o WEBP</p>
                  <input id="design-upload" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
                  />
                </div>

                {designs.length > 0 && selectedDesignId && (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    {designs.map(d => (
                      <div key={d.id} className="flex items-center gap-2">
                        <img src={d.url} alt={d.name} className="w-10 h-10 object-cover rounded border" />
                        <span className="text-xs text-slate-600 truncate flex-1">{d.name}</span>
                        <button onClick={removeDesign} className="text-rose-500 hover:text-rose-700 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="space-y-3 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium text-slate-600">Posición del diseño</p>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-slate-500">Tamaño</Label>
                          <span className="text-[10px] text-slate-400">{decalScale.toFixed(1)}x</span>
                        </div>
                        <Slider value={[decalScale]} onValueChange={handleScaleChange} min={0.3} max={3} step={0.1} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Posición</Label>
                        <div className="grid grid-cols-3 gap-1">
                          <div />
                          <button onClick={() => handleMove(0, -1)} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 flex justify-center">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <div />
                          <button onClick={() => handleMove(-1, 0)} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 flex justify-center">
                            <ChevronUp className="h-3.5 w-3.5 rotate-[-90deg]" />
                          </button>
                          <button onClick={handleResetDecal} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 flex justify-center">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleMove(1, 0)} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 flex justify-center">
                            <ChevronUp className="h-3.5 w-3.5 rotate-[90deg]" />
                          </button>
                          <div />
                          <button onClick={() => handleMove(0, 1)} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 flex justify-center">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <div />
                        </div>
                      </div>
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
    </div>
  );
}
