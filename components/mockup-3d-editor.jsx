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
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

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

// ============================================================================
// TIPOS DE PRENDA — todos usan el mismo modelo real
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
    this.decalMesh = null;
    this.decalData = null; // Store position/scale/rotation for decal

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
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

    // Lighting
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
    keyLight.position.set(3, 4, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.002;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd4e4ff, 0.6);
    fillLight.position.set(-3, 2, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 3, -4);
    this.scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.4);
    topLight.position.set(0, 6, 0);
    this.scene.add(topLight);

    // Ambient for base illumination
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // Floor
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Events
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
        // Clear scene of old model
        this.scene.children.forEach(child => {
          if (child !== this.renderer.shadowMap && !child.isLight && !child.isShadowMaterial) {
            // Don't remove lights or floor
          }
        });
        // Remove model from scene
        if (this.model) {
          this.scene.remove(this.model);
        }
        // Remove old decal
        if (this.decalMesh) {
          this.scene.remove(this.decalMesh);
          this.decalMesh = null;
          this.decalData = null;
        }

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

        // Auto-fit
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.4 / maxDim;
        this.model.scale.setScalar(scale);
        this.model.position.sub(center.multiplyScalar(scale));
        this.model.position.y += 0.08;

        this.scene.add(this.model);

        // Apply current color
        this.applyGarmentColor();

        // Re-apply decal if exists
        if (this.decalData) {
          this.recreateDecal();
        }

        resolve(gltf);
      }, undefined, reject);
    });
  }

  applyGarmentColor() {
    if (!this.model) return;
    this.model.traverse((child) => {
      if (child.isMesh) {
        const newMat = new THREE.MeshStandardMaterial({
          color: this.currentColor,
          roughness: 0.75,
          metalness: 0.0,
        });
        child.material = newMat;
      }
    });
  }

  setColor(hexColor) {
    this.targetColor.set(hexColor);
  }

  setDesignTexture(imageUrl) {
    if (!imageUrl) {
      if (this.decalMesh) {
        this.scene.remove(this.decalMesh);
        if (this.decalMesh.material.map) this.decalMesh.material.map.dispose();
        this.decalMesh.material.dispose();
        if (this.decalMesh.geometry) this.decalMesh.geometry.dispose();
        this.decalMesh = null;
      }
      this.decalData = null;
      return;
    }

    // Store the design data
    this.decalData = {
      imageUrl,
      position: new THREE.Vector3(0, 0.08, 0),
      scale: 0.35,
      rotation: new THREE.Euler(0, 0, 0),
    };

    // Load the texture and create decal
    const loader = new THREE.TextureLoader();
    loader.load(
      imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        if (this.decalMesh) {
          this.scene.remove(this.decalMesh);
          if (this.decalMesh.material.map) this.decalMesh.material.map.dispose();
          this.decalMesh.material.dispose();
          if (this.decalMesh.geometry) this.decalMesh.geometry.dispose();
        }

        // Create decal geometry on the model
        const decalSize = 0.35;
        const position = new THREE.Vector3(0, 0.08, 0);
        const orientation = new THREE.Euler(0, 0, 0);

        // Use the first mesh of the model as the target for the decal
        let targetMesh = null;
        if (this.model) {
          this.model.traverse((child) => {
            if (child.isMesh && !targetMesh) {
              targetMesh = child;
            }
          });
        }

        if (targetMesh && targetMesh.geometry) {
          try {
            const geometry = new DecalGeometry(
              targetMesh,
              position,
              orientation,
              new THREE.Vector3(decalSize, decalSize, decalSize * 0.5)
            );

            const material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              depthTest: true,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -4,
              polygonOffsetUnits: -4,
            });

            this.decalMesh = new THREE.Mesh(geometry, material);
            this.decalMesh.renderOrder = 10;
            this.scene.add(this.decalMesh);
          } catch (e) {
            console.warn('DecalGeometry failed, using fallback plane:', e);
            this.createFallbackDecal(texture);
          }
        } else {
          this.createFallbackDecal(texture);
        }
      },
      undefined,
      (err) => {
        console.error('Error loading decal texture:', err);
        this.createFallbackDecal(null);
      }
    );
  }

  createFallbackDecal(texture) {
    // Fallback: create a curved plane that follows the model surface
    if (this.decalMesh) {
      this.scene.remove(this.decalMesh);
      if (this.decalMesh.material.map) this.decalMesh.material.map.dispose();
      this.decalMesh.material.dispose();
      if (this.decalMesh.geometry) this.decalMesh.geometry.dispose();
    }

    const geometry = new THREE.PlaneGeometry(0.35, 0.35);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    this.decalMesh = new THREE.Mesh(geometry, material);
    this.decalMesh.renderOrder = 10;

    // Position at front of model
    if (this.model) {
      const box = new THREE.Box3().setFromObject(this.model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      this.decalMesh.position.set(
        center.x,
        center.y + size.y * 0.15,
        center.z + size.z * 0.49
      );
    }

    this.scene.add(this.decalMesh);
  }

  recreateDecal() {
    if (this.decalData && this.decalData.imageUrl) {
      this.setDesignTexture(this.decalData.imageUrl);
    }
  }

  scaleDesign(factor) {
    if (!this.decalData) return;
    this.decalData.scale = Math.max(0.15, Math.min(0.8, this.decalData.scale * factor));
    // Re-apply decal with new scale
    if (this.decalData.imageUrl) {
      this.setDesignTexture(this.decalData.imageUrl);
    }
  }

  moveDesign(dx, dy) {
    if (!this.decalData) return;
    this.decalData.position.x += dx * 0.02;
    this.decalData.position.y += dy * 0.02;
    if (this.decalData.imageUrl) {
      this.setDesignTexture(this.decalData.imageUrl);
    }
  }

  resetDesign() {
    this.decalData = {
      imageUrl: this.decalData?.imageUrl || null,
      position: new THREE.Vector3(0, 0.08, 0),
      scale: 0.35,
      rotation: new THREE.Euler(0, 0, 0),
    };
    if (this.decalData.imageUrl) {
      this.setDesignTexture(this.decalData.imageUrl);
    }
  }

  animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.pitch += (this.targetPitch - this.pitch) * 0.1;
    this.distance += (this.targetDistance - this.distance) * 0.1;
    this.currentColor.lerp(this.targetColor, 0.08);

    // Apply color change every frame
    this.applyGarmentColor();

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
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
  }
}

// ============================================================================
// LIBRARY TAB
// ============================================================================
function LibraryTab({ onSelect }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const PER_PAGE = 8;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PER_PAGE) });
    if (search) params.set('q', search);
    fetch(`/api/design-library?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar diseños..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
        />
      </div>

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
  const [garment, setGarment] = useState('polera');
  const [color, setColor] = useState('blanco');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [designSize, setDesignSize] = useState(0.35);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllColors, setShowAllColors] = useState(false);
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasContainerRef = useRef(null);
  const sceneRef = useRef(null);
  const lastModelRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Handle garment change — no reload since same model
  useEffect(() => {
    if (!sceneRef.current || !GARMENTS[garment]) return;
    // Since all garments use the same model file, just update description
    // No need to reload the model
  }, [garment]);

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
    link.download = `mockup-${garment}-${color}-${Date.now()}.png`;
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
    <div className="flex flex-col h-screen bg-slate-50">
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
              <div className="text-center">
                <p className="text-red-500 text-sm mb-2">{error}</p>
                <button onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600">
                  Recargar
                </button>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 flex gap-2">
            <Badge variant="outline" className="bg-white/80 backdrop-blur text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Arrastra para rotar
            </Badge>
            <Badge variant="outline" className="bg-white/80 backdrop-blur text-xs">
              <ZoomIn className="h-3 w-3 mr-1" /> Scroll para zoom
            </Badge>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l bg-white overflow-y-auto shrink-0">
          {/* Tabs */}
          <div className="flex border-b">
            <button onClick={() => setActiveTab('prenda')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === 'prenda' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Shirt className="h-4 w-4" /> Prenda
            </button>
            <button onClick={() => setActiveTab('diseno')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === 'diseno' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Upload className="h-4 w-4" /> Diseño
            </button>
            <button onClick={() => setActiveTab('biblioteca')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === 'biblioteca' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Sparkles className="h-4 w-4" /> Biblioteca
            </button>
          </div>

          <div className="p-4 space-y-5">
            {/* PRENDA TAB */}
            {activeTab === 'prenda' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Shirt className="h-4 w-4" /> Tipo de prenda
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(GARMENTS).map(([key, g]) => (
                      <button key={key}
                        onClick={() => setGarment(key)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all ${garment === key ? 'border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                        <span className="text-xl">{g.icon}</span>
                        <span className="text-xs">{g.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Palette className="h-4 w-4" /> Color de prenda
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {visibleColors.map(([key, c]) => (
                      <button key={key}
                        onClick={() => setColor(key)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${color === key ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-100 hover:border-slate-300'}`}>
                        <div className="w-6 h-6 rounded-full border border-slate-200 shadow-sm"
                          style={{ backgroundColor: c.hex }} />
                        <span className="text-[10px] text-slate-500">{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowAllColors(!showAllColors)}
                    className="text-xs text-orange-500 mt-2 hover:underline">
                    {showAllColors ? 'Ver menos colores' : `Ver todos los colores (${colorEntries.length})`}
                  </button>
                </div>

                <div className="text-xs text-slate-400 pt-2 border-t">
                  <p><strong>{GARMENTS[garment].label}</strong> — Modelo 3D con iluminación de estudio profesional.</p>
                  <p className="mt-1">Colores sincronizados con el catálogo de la tienda</p>
                </div>
              </>
            )}

            {/* DISEÑO TAB */}
            {activeTab === 'diseno' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Upload className="h-4 w-4" /> Subir diseño
                  </h3>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-orange-300 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">Click o arrastra tu diseño</p>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP (máx 10MB)</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {designs.length > 0 && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Diseños cargados</h3>
                      <div className="space-y-2">
                        {designs.map(d => (
                          <div key={d.id} className={`flex items-center gap-2 p-2 rounded-lg border ${selectedDesignId === d.id ? 'border-orange-400 bg-orange-50' : 'border-slate-100'}`}>
                            <button onClick={() => setSelectedDesignId(d.id)}
                              className="w-10 h-10 rounded overflow-hidden bg-white border flex-shrink-0">
                              <img src={d.imageUrl || d.url} alt="" className="w-full h-full object-contain" />
                            </button>
                            <span className="text-xs text-slate-600 flex-1 truncate">{d.name}</span>
                            <button onClick={() => removeDesign(d.id)}
                              className="text-slate-300 hover:text-red-500 p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedDesignId && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Ajustes</h3>
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-slate-500">Tamaño</Label>
                            <Slider
                              value={[designSize * 100]}
                              onValueChange={([v]) => {
                                setDesignSize(v / 100);
                                if (sceneRef.current) {
                                  sceneRef.current.scaleDesign((v / 100) / designSize);
                                }
                              }}
                              min={30} max={100} step={1}
                              className="mt-1"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => sceneRef.current?.moveDesign(0, 1)}
                              className="p-2 rounded-lg border text-center text-slate-500 hover:border-orange-300">↑</button>
                            <button onClick={() => sceneRef.current?.moveDesign(0, -1)}
                              className="p-2 rounded-lg border text-center text-slate-500 hover:border-orange-300">↓</button>
                            <button onClick={() => sceneRef.current?.moveDesign(-1, 0)}
                              className="p-2 rounded-lg border text-center text-slate-500 hover:border-orange-300">←</button>
                            <button onClick={() => sceneRef.current?.moveDesign(1, 0)}
                              className="p-2 rounded-lg border text-center text-slate-500 hover:border-orange-300">→</button>
                          </div>
                          <button onClick={() => { setDesignSize(0.35); sceneRef.current?.resetDesign(); }}
                            className="w-full py-2 rounded-lg border text-sm text-slate-500 hover:border-orange-300">
                            Resetear posición
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* BIBLIOTECA TAB */}
            {activeTab === 'biblioteca' && (
              <LibraryTab onSelect={handleLibrarySelect} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
