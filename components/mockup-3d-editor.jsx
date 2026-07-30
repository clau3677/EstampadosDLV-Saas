"use client";

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
  amarillo:     { label: 'Amarillo',        hex: '#F5C518' },
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
// TIPOS DE PRENDA
// ============================================================================
const GARMENTS = {
  polera:     { label: 'Polera',     model: '/mockups/shirt_baked.glb', icon: '👕' },
  poleron:    { label: 'Polerón',    model: '/mockups/hoodie.glb', icon: '🧥' },
  gorra:      { label: 'Gorra',      model: '/mockups/cap.glb', icon: '🧢' },
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
    this.outlineMeshes = [];
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
    this.distance = 2.8;
    this.targetDistance = 2.8;
    this.animationId = null;
    this.isPlaying = true;
    this.designTexture = null;
    this.designMesh = null;
    this.modelGroup = null;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    // Fondo blanco puro para mockups profesionales
    this.scene.background = new THREE.Color(0xffffff);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 100);
    this.camera.position.set(0, 0.15, 2.8);

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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Iluminación de estudio
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    keyLight.position.set(3, 4, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.002;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd4e4ff, 0.5);
    fillLight.position.set(-3, 2, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 3, -4);
    this.scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 6, 0);
    this.scene.add(topLight);

    // Group para el modelo (para poder añadir outline y diseño)
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    // Floor for shadows
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Event listeners
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
    this.targetPitch += dy * 0.006;
    this.targetPitch = Math.max(-0.4, Math.min(0.4, this.targetPitch));
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
    this.targetPitch += dy * 0.006;
    this.targetPitch = Math.max(-0.4, Math.min(0.4, this.targetPitch));
    this.mouseX = e.touches[0].clientX;
    this.mouseY = e.touches[0].clientY;
  }
  onWheel(e) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.002;
    this.targetDistance = Math.max(1.8, Math.min(6.0, this.targetDistance));
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

  loadModel(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        // Remove old model from group
        while (this.modelGroup.children.length > 0) {
          this.modelGroup.remove(this.modelGroup.children[0]);
        }
        this.outlineMeshes = [];

        this.model = gltf.scene;
        this.originalMaterials = new Map();

        // Process all meshes
        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            this.originalMaterials.set(child.uuid, child.material.clone());
          }
        });

        // Auto-fit model
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 1.4;
        const scale = targetSize / maxDim;
        this.model.scale.setScalar(scale);
        this.model.position.sub(center.multiplyScalar(scale));
        this.model.position.y += 0.08;

        this.modelGroup.add(this.model);

        // Add edge outline for visibility on white background
        this.createOutline();

        // Apply current color
        this.applyGarmentColor();

        resolve(gltf);
      }, undefined, reject);
    });
  }

  createOutline() {
    // Create edge lines for the model to make it visible on white background
    this.model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const edges = new THREE.EdgesGeometry(child.geometry, 15);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xe0e0e0,
          transparent: true,
          opacity: 0.4,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wireframe.position.copy(child.position);
        wireframe.rotation.copy(child.rotation);
        wireframe.scale.copy(child.scale);
        this.modelGroup.add(wireframe);
        this.outlineMeshes.push(wireframe);
      }
    });
  }

  applyGarmentColor() {
    if (!this.model) return;

    this.model.traverse((child) => {
      if (child.isMesh) {
        const color = this.currentColor.clone();
        child.material = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.82,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
      }
    });

    // Update outline color based on garment color
    const isWhite = this.currentColor.r > 0.95 && this.currentColor.g > 0.95 && this.currentColor.b > 0.95;
    this.outlineMeshes.forEach(outline => {
      outline.material.color.set(isWhite ? 0xcccccc : 0xe8e8e8);
      outline.material.opacity = isWhite ? 0.5 : 0.3;
    });
  }

  setColor(hex) {
    this.targetColor.set(hex);
    this.currentColor.set(hex);
    this.applyGarmentColor();
    if (this.designTexture) {
      this.applyDesign();
    }
  }

  setDesignTexture(url) {
    if (!url) {
      this.removeDesign();
      return;
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    textureLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.designTexture = texture;
      this.applyDesign();
    });
  }

  applyDesign() {
    this.removeDesign();
    if (!this.designTexture || !this.model) return;

    // Get the main mesh bounding box
    let frontMesh = null;
    this.model.traverse((child) => {
      if (child.isMesh && !frontMesh) {
        frontMesh = child;
      }
    });

    if (!frontMesh) return;

    const meshBox = new THREE.Box3().setFromObject(frontMesh);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const meshSize = meshBox.getSize(new THREE.Vector3());

    // Create a curved plane for the design
    const width = meshSize.x * 0.55;
    const height = meshSize.y * 0.45;
    const radius = meshSize.x * 0.5;

    const geo = new THREE.SphereGeometry(radius, 32, 32,
      -Math.PI * 0.3, Math.PI * 0.6,
      Math.PI * 0.2, Math.PI * 0.35
    );

    geo.scale(width / radius, height / radius, 1.0);

    const mat = new THREE.MeshStandardMaterial({
      map: this.designTexture,
      transparent: true,
      alphaTest: 0.05,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.designMesh = new THREE.Mesh(geo, mat);
    
    const frontZ = meshCenter.z + meshSize.z * 0.48;
    const centerX = meshCenter.x;
    const centerY = meshCenter.y + meshSize.y * 0.05;
    
    this.designMesh.position.set(centerX, centerY, frontZ);
    this.designMesh.rotation.y = 0;
    this.designMesh.renderOrder = 1;

    this.modelGroup.add(this.designMesh);
  }

  removeDesign() {
    if (this.designMesh) {
      this.modelGroup.remove(this.designMesh);
      if (this.designMesh.material) {
        if (this.designMesh.material.map) this.designMesh.material.map.dispose();
        this.designMesh.material.dispose();
      }
      if (this.designMesh.geometry) this.designMesh.geometry.dispose();
      this.designMesh = null;
    }
  }

  scaleDesign(factor) {
    if (!this.designMesh) return;
    const s = this.designMesh.scale;
    s.x = Math.max(0.3, Math.min(3.0, s.x * factor));
    s.y = Math.max(0.3, Math.min(3.0, s.y * factor));
  }

  moveDesign(dx, dy) {
    if (!this.designMesh) return;
    this.designMesh.position.x += dx * 0.03;
    this.designMesh.position.y += dy * 0.03;
  }

  resetDesign() {
    if (!this.designMesh || !this.model) return;
    this.designMesh.scale.set(1, 1, 1);
    const meshBox = new THREE.Box3().setFromObject(this.model);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const meshSize = meshBox.getSize(new THREE.Vector3());
    this.designMesh.position.set(
      meshCenter.x,
      meshCenter.y + meshSize.y * 0.05,
      meshCenter.z + meshSize.z * 0.48
    );
  }

  animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.pitch += (this.targetPitch - this.pitch) * 0.1;
    this.distance += (this.targetDistance - this.distance) * 0.1;
    this.currentColor.lerp(this.targetColor, 0.08);

    this.camera.position.x = Math.sin(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.position.y = Math.sin(this.pitch) * this.distance + 0.12;
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
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ============================================================================
// LIBRARY TAB
// ============================================================================
function LibraryTab({ onSelect }) {
  const [designs, setDesigns] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/design-library?page=${page}&limit=20&q=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(data => {
        const items = data.items || data.designs || [];
        setDesigns(items);
        setLoading(false);
      })
      .catch(() => {
        setDesigns([]);
        setLoading(false);
      });
  }, [page, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar diseños..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {designs.map((d) => (
            <button
              key={d._id || d.id || Math.random()}
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
  const lastModelRef = useRef(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const timer = setTimeout(() => {
      const scene = new ThreeScene(canvasContainerRef.current);
      sceneRef.current = scene;

      const modelUrl = GARMENTS[garment].model;
      lastModelRef.current = modelUrl;

      scene.loadModel(modelUrl)
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

  // Handle garment change - load new model when garment changes
  useEffect(() => {
    if (!sceneRef.current || !GARMENTS[garment]) return;
    const modelUrl = GARMENTS[garment].model;
    if (modelUrl === lastModelRef.current) return; // Same model, no reload needed
    lastModelRef.current = modelUrl;
    setLoading(true);
    setError(null);
    sceneRef.current.loadModel(modelUrl)
      .then(() => {
        setLoading(false);
        sceneRef.current.setColor(GARMENT_COLORS[color].hex);
      })
      .catch((err) => {
        console.error('Model load error:', err);
        setError('No se pudo cargar el modelo 3D.');
        setLoading(false);
      });
  }, [garment, color]);

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

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setDesigns(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setDesigns(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [historyIndex, history]);

  const handleUpload = useCallback((file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const newDesign = { id: Date.now(), url, name: file.name };
    const newDesigns = [...designs, newDesign];
    setDesigns(newDesigns);
    setSelectedDesignId(newDesign.id);
    pushHistory(newDesigns);
    toast.success('Diseño agregado al mockup');
  }, [designs, pushHistory]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleLibrarySelect = useCallback((design) => {
    const newDesign = {
      id: design._id || design.id || Date.now(),
      url: design.imageUrl || design.url,
      name: design.name || 'Diseño',
      imageUrl: design.imageUrl || design.url,
    };
    setDesigns([newDesign]);
    setSelectedDesignId(newDesign.id);
    pushHistory([newDesign]);
    toast.success('Diseño aplicado al mockup');
  }, [pushHistory]);

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
    if (sceneRef.current) sceneRef.current.scaleDesign(factor);
  }, [decalScale]);

  const handleMove = useCallback((dx, dy) => {
    if (sceneRef.current) sceneRef.current.moveDesign(dx, dy);
  }, []);

  const handleResetDesign = useCallback(() => {
    setDecalScale(1);
    if (sceneRef.current) sceneRef.current.resetDesign();
  }, []);

  // Group colors for display
  const primaryColors = ['blanco', 'negro', 'gris', 'gris-melange', 'azul_marino', 'rojo', 'verde', 'verde-botella'];
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
              <div className="flex flex-col items-center justify-center h-full bg-white">
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

          <div className="flex-1 overflow-y-auto p-4">
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
                    {visibleColors.map(colorKey => {
                      const c = GARMENT_COLORS[colorKey];
                      return (
                        <button
                          key={colorKey}
                          onClick={() => setColor(colorKey)}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all ${
                            color === colorKey
                              ? 'border-orange-500 ring-2 ring-orange-200'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-full border border-slate-300 shadow-sm"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span className="text-[9px] text-slate-500 truncate w-full text-center">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowAllColors(!showAllColors)}
                    className="text-xs text-orange-600 hover:text-orange-700 mt-3 font-medium"
                  >
                    {showAllColors ? 'Ver menos colores' : `Ver todos los colores (${Object.keys(GARMENT_COLORS).length})`}
                  </button>
                </div>

                {/* Info */}
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                  <p><strong className="text-slate-700">{GARMENTS[garment].label}</strong> — Modelo 3D con iluminación de estudio profesional. Arrastra para rotar, scroll para zoom.</p>
                  <p className="mt-1 text-slate-400">Colores sincronizados con el catálogo de la tienda</p>
                </div>
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="space-y-5">
                <div
                  onDrop={handleFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-orange-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600 font-medium">Arrastra tu diseño aquí</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG o WEBP</p>
                  <input
                    id="file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0])}
                  />
                </div>

                {designs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-slate-700">Diseño actual</h4>
                      <Button variant="ghost" size="sm" onClick={() => { setDesigns([]); setSelectedDesignId(null); if (sceneRef.current) sceneRef.current.removeDesign(); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Controles de posición y tamaño */}
                    <div className="space-y-3 bg-slate-50 rounded-lg p-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Tamaño</Label>
                        <Slider value={[decalScale]} min={0.3} max={3.0} step={0.1} onValueChange={handleScaleChange} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Posición</Label>
                        <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
                          <div />
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleMove(0, 1)}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <div />
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleMove(-1, 0)}>
                            <ChevronDown className="h-3 w-3 rotate-90" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleResetDesign}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleMove(1, 0)}>
                            <ChevronDown className="h-3 w-3 -rotate-90" />
                          </Button>
                          <div />
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleMove(0, -1)}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                          <div />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                  <p className="font-medium text-slate-700 mb-1">Cómo funciona</p>
                  <p>Sube tu diseño y se proyectará sobre la prenda en 3D siguiendo las curvas del tejido. Los colores se mantienen exactamente como en tu imagen original.</p>
                </div>
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
