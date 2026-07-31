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
import { GLTFLoader, DRACOLoader } from 'three-stdlib';

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
// MODELOS DISPONIBLES
// ============================================================================
const GARMENT_MODELS = {
  polera: {
    label: 'Polera',
    url: '/mockups/shirt_baked.glb',
    fallbackUrl: '/mockups/shirt_baked_simple.glb',
  },
  poleron: {
    label: 'Polerón',
    url: '/mockups/shirt_baked.glb',
    fallbackUrl: '/mockups/shirt_baked_simple.glb',
    description: 'Modelo de polera (modelo de polerón próximamente)',
  },
  gorra: {
    label: 'Gorra',
    url: '/mockups/shirt_baked.glb',
    fallbackUrl: '/mockups/shirt_baked_simple.glb',
    description: 'Modelo de polera (modelo de gorra próximamente)',
  },
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
    this.garmentMeshes = [];
    this.currentColorHex = '#FFFFFF';
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
    this.designPlane = null;
    this.designTexture = null;
    this.designScale = 1.0;
    this.designOffsetX = 0;
    this.designOffsetY = 0;
    this.modelBounds = null;
    this.modelScale = 1;
    // Track front-facing vertices for better design placement
    this.frontVertices = [];
    this.frontNormal = new THREE.Vector3();
  }

  init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return false;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 100);
    this.camera.position.set(0, 0.15, this.distance);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Studio lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.8);
    keyLight.position.set(3, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.002;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e0ff, 1.0);
    fillLight.position.set(-3, 2, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 3, -5);
    this.scene.add(rimLight);

    // Ground shadow
    const groundGeo = new THREE.PlaneGeometry(5, 5);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.65;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Mouse events
    this._onMouseDown = (e) => { this.mouseDown = true; this.mouseX = e.clientX; this.mouseY = e.clientY; };
    this._onMouseMove = (e) => {
      if (!this.mouseDown) return;
      const dx = e.clientX - this.mouseX;
      const dy = e.clientY - this.mouseY;
      this.targetRotationY += dx * 0.008;
      this.targetPitch = Math.max(-0.5, Math.min(0.5, this.targetPitch - dy * 0.008));
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    this._onMouseUp = () => { this.mouseDown = false; };
    this._onWheel = (e) => {
      e.preventDefault();
      this.targetDistance = Math.max(1.8, Math.min(5, this.targetDistance + e.deltaY * 0.001));
    };
    this._onResize = () => {
      if (!this.container || !this.renderer) return;
      const cw = this.container.clientWidth;
      const ch = this.container.clientHeight;
      if (cw === 0 || ch === 0) return;
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(cw, ch);
    };

    this.container.addEventListener('mousedown', this._onMouseDown);
    this.container.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.container.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('resize', this._onResize);

    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this.container);

    this.isPlaying = true;
    this._animate();
    this._render();
    return true;
  }

  _render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _animate() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this._animate());

    this.rotationY += (this.targetRotationY - this.rotationY) * 0.06;
    this.pitch += (this.targetPitch - this.pitch) * 0.06;
    this.distance += (this.targetDistance - this.distance) * 0.06;

    this.camera.position.x = Math.sin(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.position.y = Math.sin(this.pitch) * this.distance + 0.15;
    this.camera.position.z = Math.cos(this.rotationY) * Math.cos(this.pitch) * this.distance;
    this.camera.lookAt(0, 0.05, 0);

    this._render();
  }

  async loadModel(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Parse with GLTFLoader + DRACOLoader for compressed meshes
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);
      
      const gltf = await new Promise((resolve, reject) => {
        try {
          loader.parse(arrayBuffer, '', (gltf) => resolve(gltf), reject);
        } catch (e) {
          reject(e);
        }
      });
      
      this.model = gltf.scene;

      // Compute bounds before scaling
      const box = new THREE.Box3().setFromObject(this.model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Scale to fit nicely in viewport
      this.modelScale = 1.3 / maxDim;
      this.model.scale.setScalar(this.modelScale);
      this.model.position.sub(center.multiplyScalar(this.modelScale));
      this.model.position.y += 0.05;

      // Compute bounds after scaling for design placement
      const scaledBox = new THREE.Box3().setFromObject(this.model);
      this.modelBounds = {
        center: scaledBox.getCenter(new THREE.Vector3()),
        size: scaledBox.getSize(new THREE.Vector3()),
      };

      // Process meshes: tint the baked texture color but keep lighting info
      this.garmentMeshes = [];
      this.frontVertices = [];
      this.model.traverse((child) => {
        if (child.isMesh) {
          // Clone the original material
          const mat = child.material.clone();
          
          // Ensure material renders from both sides (fixes inverted normals on some models)
          if (mat.side !== undefined) {
            mat.side = THREE.DoubleSide;
          }
          
          // Store original for color changes
          this.originalMaterials.set(child, mat);
          
          // Apply the cloned material
          child.material = mat;
          child.castShadow = true;
          child.receiveShadow = true;
          this.garmentMeshes.push(child);

          // Collect front-facing vertices (z > 0 in model space)
          const geo = child.geometry;
          const posAttr = geo.attributes.position;
          child.updateMatrixWorld(true);
          const worldMatrix = child.matrixWorld;
          
          for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);
            const worldPos = new THREE.Vector3(x, y, z).applyMatrix4(worldMatrix);
            
            // Only keep vertices on the front (positive z after model transformation)
            if (worldPos.z > this.modelBounds.center.z - 0.05) {
              this.frontVertices.push({ x, y, z, worldX: worldPos.x, worldY: worldPos.y, worldZ: worldPos.z });
            }
          }
        }
      });

      // Set initial color
      this._applyGarmentColor(new THREE.Color(this.currentColorHex));

      this.scene.add(this.model);
      return gltf;
    } catch (err) {
      throw err;
    }
  }

  _applyGarmentColor(targetColor) {
    this.garmentMeshes.forEach((child) => {
      const original = this.originalMaterials.get(child);
      if (!original) return;

      // Create a new MeshStandardMaterial with cotton-like properties
      const mat = new THREE.MeshStandardMaterial({
        color: targetColor.clone(),
        roughness: 0.85,        // Tela es mate, no brillante
        metalness: 0.0,         // Algodón no tiene metalness
        emissive: new THREE.Color(0x000000), // Sin emisivo para no verse como plástico
        emissiveIntensity: 0.0,
        side: THREE.DoubleSide,
      });

      child.material = mat;
    });
  }

  setColor(hexColor) {
    this.currentColorHex = hexColor;
    if (!this.model) return;
    const targetColor = new THREE.Color(hexColor);
    this._applyGarmentColor(targetColor);
  }

  /**
   * Create a curved plane that follows the torso surface better.
   * Uses a cylindrical projection with adjustable curvature.
   */
  setDesignTexture(imageUrl) {
    if (!imageUrl) {
      this._removeDesign();
      return;
    }

    this._removeDesign();

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        this.designTexture = texture;

        // Create a curved plane that wraps around the chest
        const width = 0.40;
        const height = 0.40;
        const segmentsW = 32;
        const segmentsH = 32;
        const geometry = new THREE.PlaneGeometry(width, height, segmentsW, segmentsH);

        // Apply cylindrical curvature to match the chest shape
        // The curvature simulates the cylindrical form of a human torso
        const positions = geometry.attributes.position;
        const radius = 0.25; // approximate torso radius

        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const normalizedX = x / (width * 0.5);

          // Cylindrical projection: map flat plane to cylinder surface
          const angle = normalizedX * 0.35; // limited angle for chest area
          const cylZ = Math.cos(angle) * radius - radius + 0.02; // bulge outward
          const cylX = Math.sin(angle) * radius;

          // Apply gentle S-curve for vertical curvature (chest shape)
          const normalizedY = y / (height * 0.5);
          const vertCurve = normalizedY * normalizedY * 0.008;

          positions.setX(i, cylX);
          positions.setZ(i, cylZ + vertCurve);
        }
        geometry.computeVertexNormals();

        // Material: transparent, respects original image colors
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.02,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          // Use polygon offset to ensure it renders slightly in front of the garment
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        });

        this.designPlane = new THREE.Mesh(geometry, material);
        this.designPlane.renderOrder = 999;

        this._updateDesignPosition();
        this.scene.add(this.designPlane);
      },
      undefined,
      (err) => {
        console.error('Error loading design texture:', err);
      }
    );
  }

  _removeDesign() {
    if (this.designPlane) {
      this.scene.remove(this.designPlane);
      if (this.designTexture) { this.designTexture.dispose(); this.designTexture = null; }
      this.designPlane.geometry.dispose();
      this.designPlane.material.dispose();
      this.designPlane = null;
    }
  }

  _updateDesignPosition() {
    if (!this.designPlane || !this.modelBounds) return;
    const { center, size } = this.modelBounds;

    // Place the design on the front of the shirt (chest area)
    // Position it slightly in front of the torso surface
    this.designPlane.position.set(
      center.x + this.designOffsetX,
      center.y + this.designOffsetY + size.y * 0.08,
      center.z + size.z * 0.45 + 0.012
    );
    this.designPlane.scale.setScalar(this.designScale);
  }

  scaleDesign(factor) {
    this.designScale = Math.max(0.3, Math.min(2.5, this.designScale * factor));
    if (this.designPlane) {
      this.designPlane.scale.setScalar(this.designScale);
    }
  }

  moveDesign(dx, dy) {
    this.designOffsetX += dx * 0.012;
    this.designOffsetY += dy * 0.012;
    this._updateDesignPosition();
  }

  resetDesign() {
    this.designOffsetX = 0;
    this.designOffsetY = 0;
    this.designScale = 1.0;
    this._updateDesignPosition();
  }

  exportCanvas() {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
    return this.renderer?.domElement?.toDataURL('image/png') || null;
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
    if (this.designTexture) this.designTexture.dispose();
  }
}

// ============================================================================
// LIBRARY TAB COMPONENT
// ============================================================================
function LibraryTab({ onSelect }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
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
        setItems(data.items || data.results || data.designs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Buscar diseños..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-orange-400"
      />
      {loading ? (
        <div className="text-center py-4 text-sm text-slate-400">Cargando...</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => (
            <button
              key={item.id || item._id}
              onClick={() => onSelect(item.imageUrl || item.url || item.thumbnailUrl)}
              className="aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-orange-400 transition-colors bg-white"
            >
              <img
                src={item.imageUrl || item.url || item.thumbnailUrl}
                alt={item.name || 'Diseño'}
                className="w-full h-full object-contain p-1"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded border text-xs disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-slate-400 self-center">Página {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={items.length < PER_PAGE}
            className="px-3 py-1 rounded border text-xs disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================
export default function Mockup3DEditor() {
  const [activeTab, setActiveTab] = useState('prenda');
  const [garmentType, setGarmentType] = useState('polera');
  const [color, setColor] = useState('blanco');
  const [showAllColors, setShowAllColors] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasContainerRef = useRef(null);
  const sceneRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize Three.js scene - wait for container to have size
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    // Use ResizeObserver to wait for the container to have a real size
    let initialized = false;
    const observer = new ResizeObserver((entries) => {
      if (initialized) return;
      const entry = entries[0];
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return;

      initialized = true;
      observer.disconnect();

      // Small delay to ensure React has finished layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scene = new ThreeScene(container);
          const ok = scene.init();
          if (!ok) {
            setError('Error al inicializar el visor 3D');
            setLoading(false);
            return;
          }
          sceneRef.current = scene;

          // Load model with timeout
          const timeoutId = setTimeout(() => {
            if (!scene.model) {
              setError('El modelo 3D tardó demasiado en cargar. Intenta recargar.');
              setLoading(false);
            }
          }, 15000);

          // Cargar el modelo de la prenda seleccionada
          const modelConfig = GARMENT_MODELS[garmentType] || GARMENT_MODELS.polera;
          scene.loadModel(modelConfig.url)
            .then(() => {
              clearTimeout(timeoutId);
              setLoading(false);
              scene.setColor(GARMENT_COLORS.blanco.hex);
            })
            .catch((err) => {
              console.error('Error loading main model, trying fallback:', err.message);
              // Intentar con el modelo simplificado
              if (modelConfig.fallbackUrl) {
                scene.loadModel(modelConfig.fallbackUrl)
                  .then(() => {
                    clearTimeout(timeoutId);
                    setLoading(false);
                    scene.setColor(GARMENT_COLORS.blanco.hex);
                  })
                  .catch((err2) => {
                    clearTimeout(timeoutId);
                    setError('No se pudo cargar el modelo 3D. Intenta recargar la página.');
                    setLoading(false);
                  });
              } else {
                clearTimeout(timeoutId);
                setError('No se pudo cargar el modelo 3D. Intenta recargar la página.');
                setLoading(false);
              }
            });
        });
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [garmentType]);

  // Update color when it changes
  useEffect(() => {
    if (sceneRef.current && !loading) {
      sceneRef.current.setColor(GARMENT_COLORS[color]?.hex || '#FFFFFF');
    }
  }, [color, loading]);

  // Update design when selection changes
  useEffect(() => {
    if (sceneRef.current && !loading) {
      const design = designs.find(d => d.id === selectedDesignId);
      sceneRef.current.setDesignTexture(design?.imageUrl || design?.url || null);
    }
  }, [designs, selectedDesignId, loading]);

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
    if (!dataUrl) {
      toast.error('No se pudo exportar el mockup');
      return;
    }
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

  const handleGarmentChange = (type) => {
    if (type === garmentType) return;
    // Clear design when changing garment type
    setDesigns([]);
    setSelectedDesignId(null);
    setHistory([[]]);
    setHistoryIndex(0);
    setGarmentType(type);
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
        <div className="flex-1 relative bg-slate-50" style={{ minHeight: '0' }}>
          <div ref={canvasContainerRef} className="w-full h-full" style={{ minHeight: '400px' }} />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-20">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Cargando modelo 3D...</p>
                <p className="text-xs text-slate-400 mt-1">La primera vez puede tardar unos segundos</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20">
              <div className="text-center px-6">
                <p className="text-sm text-red-600 font-medium">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
                >
                  Recargar página
                </button>
              </div>
            </div>
          )}

          {/* Bottom hints */}
          {!loading && !error && (
            <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-slate-400 pointer-events-none">
              <span>Arrastra para rotar</span>
              <span>Scroll para zoom</span>
            </div>
          )}
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
                {/* Selector de tipo de prenda */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Shirt className="h-4 w-4" /> Tipo de prenda
                  </h3>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 font-medium">Poleras</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleGarmentChange('polera')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          garmentType === 'polera'
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Polera
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-2">Polerones</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleGarmentChange('poleron')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          garmentType === 'poleron'
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Polerón
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-2">Gorras</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleGarmentChange('gorra')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          garmentType === 'gorra'
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Gorra
                      </button>
                    </div>
                  </div>
                </div>

                {/* Selector de color */}
                <div>
                  {GARMENT_MODELS[garmentType]?.description && (
                    <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-700">{GARMENT_MODELS[garmentType].description}</p>
                    </div>
                  )}
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    Color de prenda
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
                        <span className="text-[10px] text-slate-600 leading-tight text-center">{val.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAllColors(!showAllColors)}
                    className="mt-3 text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    {showAllColors ? 'Ver menos colores' : `Ver todos los colores (${colorEntries.length})`}
                  </button>
                </div>
                <div className="pt-3 border-t space-y-1">
                  <p className="text-xs text-slate-500">
                    <strong>{GARMENT_MODELS[garmentType]?.label || 'Prenda'}</strong> — Modelo 3D realista con iluminación de estudio.
                  </p>
                  <p className="text-xs text-slate-400">
                    Arrastra para rotar 360°. Colores del catálogo.
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
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Controles del diseño</h3>
                    <div className="space-y-3">
                      {/* Size */}
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Tamaño</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => sceneRef.current?.scaleDesign(0.85)}
                            className="flex-1 py-1.5 rounded border text-xs hover:bg-slate-50"
                          >
                            − Más pequeño
                          </button>
                          <button
                            onClick={() => sceneRef.current?.scaleDesign(1.15)}
                            className="flex-1 py-1.5 rounded border text-xs hover:bg-slate-50"
                          >
                            + Más grande
                          </button>
                        </div>
                      </div>
                      {/* Position */}
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Posición</label>
                        <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
                          <div />
                          <button onClick={() => sceneRef.current?.moveDesign(0, 1)}
                            className="py-1 rounded border text-xs hover:bg-slate-50">↑</button>
                          <div />
                          <button onClick={() => sceneRef.current?.moveDesign(-1, 0)}
                            className="py-1 rounded border text-xs hover:bg-slate-50">←</button>
                          <div />
                          <button onClick={() => sceneRef.current?.moveDesign(1, 0)}
                            className="py-1 rounded border text-xs hover:bg-slate-50">→</button>
                          <div />
                          <button onClick={() => sceneRef.current?.moveDesign(0, -1)}
                            className="py-1 rounded border text-xs hover:bg-slate-50">↓</button>
                          <div />
                        </div>
                      </div>
                      {/* Reset */}
                      <button
                        onClick={() => sceneRef.current?.resetDesign()}
                        className="w-full py-1.5 rounded border text-xs text-slate-500 hover:bg-slate-50"
                      >
                        Resetear posición y tamaño
                      </button>
                    </div>
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
