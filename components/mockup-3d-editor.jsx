'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Copy, Undo2, Redo2,
  Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, MousePointer2, RotateCw, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

// ============================================================================
// THREE.JS - Cargar solo en cliente
// ============================================================================
import * as THREE from 'three';

// ============================================================================
// DATOS DE PRENDAS Y COLORES
// ============================================================================
const GARMENT_TEMPLATES = {
  polera_frontal: { id: 'polera_frontal', label: 'Polera (Frontal)', category: 'poleras' },
  polera_espalda: { id: 'polera_espalda', label: 'Polera (Espalda)', category: 'poleras' },
  poleron_frontal: { id: 'poleron_frontal', label: 'Polerón (Frontal)', category: 'polerones' },
  poleron_espalda: { id: 'poleron_espalda', label: 'Polerón (Espalda)', category: 'polerones' },
  gorra_frontal: { id: 'gorra_frontal', label: 'Gorra (Frontal)', category: 'gorras' },
  gorra_lateral: { id: 'gorra_lateral', label: 'Gorra (Lateral)', category: 'gorras' },
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
// ESCENA 3D — Motor principal
// ============================================================================
function ThreeScene({ template, color, designs, onSceneReady }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const garmentRef = useRef(null);
  const decalMeshesRef = useRef([]);
  const animFrameRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: -0.3, y: 0 });
  const targetRotationRef = useRef({ x: -0.3, y: 0 });

  // Inicializar escena
  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);

    // Camera
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 4.5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    // Iluminación profesional
    // Ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Key light (principal)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(3, 4, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    // Rim light (contraluz)
    const rimLight = new THREE.DirectionalLight(0xfff0dd, 0.4);
    rimLight.position.set(0, 2, -3);
    scene.add(rimLight);

    // Hemisphere light para suavizar
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdce4f0, 0.3);
    scene.add(hemiLight);

    // Suelo con sombra
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.15 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    scene.add(floor);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Crear prenda
    createGarment(scene, template, color);

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Suavizar rotación
      rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.08;
      rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.08;

      if (garmentRef.current) {
        garmentRef.current.rotation.x = rotationRef.current.x;
        garmentRef.current.rotation.y = rotationRef.current.y;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    onSceneReady?.({ renderer, scene, camera, mount });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Actualizar prenda cuando cambia template o color
  useEffect(() => {
    if (!sceneRef.current) return;
    createGarment(sceneRef.current, template, color);
  }, [template, color]);

  // Actualizar decals (diseños) cuando cambian
  useEffect(() => {
    if (!sceneRef.current || !garmentRef.current) return;
    updateDecals(garmentRef.current, designs, template);
  }, [designs, template]);

  // Mouse/touch rotation
  const handlePointerDown = (e) => {
    setIsDragging(true);
    const rect = mountRef.current.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const rect = mountRef.current.getBoundingClientRect();
    const dx = e.clientX - rect.left - dragStartRef.current.x;
    const dy = e.clientY - rect.top - dragStartRef.current.y;
    targetRotationRef.current = {
      x: rotationRef.current.x - dy * 0.005,
      y: rotationRef.current.y + dx * 0.005,
    };
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={mountRef}
      className="w-full h-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}

// ============================================================================
// CREAR PRENDA 3D PROCEDURAL
// ============================================================================
function createGarment(scene, template, colorName) {
  // Limpiar prenda anterior
  if (garmentRef.current) {
    scene.remove(garmentRef.current);
    garmentRef.current.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  const color = new THREE.Color(GARMENT_COLORS[colorName]?.hex || '#F5F5F0');
  const group = new THREE.Group();

  const isGorra = template.includes('gorra');
  const isPoleron = template.includes('poleron');
  const isBack = template.includes('espalda') || template.includes('lateral');

  if (isGorra) {
    createCap3D(group, color, isBack);
  } else {
    createTshirt3D(group, color, isPoleron, isBack);
  }

  // Aplicar textura de tela realista
  applyFabricTexture(group, colorName);

  // Sombras
  group.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(group);
  garmentRef.current = group;
}

function createTshirt3D(group, color, isHoodie, isBack) {
  // Cuerpo principal de la polera
  const bodyGeo = new THREE.CylinderGeometry(0.85, 0.90, 1.6, 32, 1, true);
  // Aplanar la parte trasera para simular la forma de polera
  bodyGeo.scale(1, 1, 0.55);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = -0.1;
  group.add(body);

  // Parte trasera (cerrar el cilindro)
  const backGeo = new THREE.CylinderGeometry(0.85, 0.90, 1.6, 32, 1, true);
  backGeo.scale(1, 1, 0.55);
  const backMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const backMesh = new THREE.Mesh(backGeo, backMat);
  backMesh.position.y = -0.1;
  backMesh.rotation.y = Math.PI;
  group.add(backMesh);

  // Manga derecha
  const sleeveRGeo = new THREE.CylinderGeometry(0.25, 0.30, 0.55, 16, 1, true);
  sleeveRGeo.scale(1, 1, 0.7);
  const sleeveR = new THREE.Mesh(sleeveRGeo, bodyMat.clone());
  sleeveR.position.set(1.05, 0.25, 0);
  sleeveR.rotation.z = -0.8;
  sleeveR.rotation.y = isBack ? Math.PI : 0;
  group.add(sleeveR);

  // Manga izquierda
  const sleeveLMat = bodyMat.clone();
  const sleeveL = new THREE.Mesh(sleeveRGeo.clone(), sleeveLMat);
  sleeveL.position.set(-1.05, 0.25, 0);
  sleeveL.rotation.z = 0.8;
  sleeveL.rotation.y = isBack ? Math.PI : 0;
  group.add(sleeveL);

  // Cuello
  const collarGeo = new THREE.TorusGeometry(0.32, 0.06, 8, 24, Math.PI * 1.3);
  const collarMat = new THREE.MeshStandardMaterial({
    color: adjustColor(color, -15),
    roughness: 0.9,
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, 0.70, 0.25);
  collar.rotation.x = -0.3;
  collar.rotation.z = isBack ? Math.PI : 0;
  group.add(collar);

  // Capucha (polerón)
  if (isHoodie && !isBack) {
    const hoodGeo = new THREE.SphereGeometry(0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hoodMat = new THREE.MeshStandardMaterial({
      color: adjustColor(color, -5),
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(0, 0.75, -0.30);
    hood.rotation.x = 0.4;
    group.add(hood);
  }

  // Posición del grupo completo
  group.position.y = 0.1;
}

function createCap3D(group, color, isSide) {
  // Corona de la gorra (semi-esfera)
  const crownGeo = new THREE.SphereGeometry(0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const crownMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.rotation.x = Math.PI;
  crown.position.y = 0.1;
  group.add(crown);

  // Banda inferior de la gorra
  const bandGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.15, 32, 1, true);
  const bandMat = new THREE.MeshStandardMaterial({
    color: adjustColor(color, -8),
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.y = -0.15;
  group.add(band);

  // Visera
  const visorShape = new THREE.Shape();
  visorShape.moveTo(-0.55, 0);
  visorShape.quadraticCurveTo(-0.55, -0.15, -0.35, -0.35);
  visorShape.lineTo(0.35, -0.35);
  visorShape.quadraticCurveTo(0.55, -0.15, 0.55, 0);
  visorShape.closePath();

  const visorExtrudeSettings = { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 };
  const visorGeo = new THREE.ExtrudeGeometry(visorShape, visorExtrudeSettings);
  const visorMat = new THREE.MeshStandardMaterial({
    color: adjustColor(color, -10),
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, -0.22, 0.48);
  visor.rotation.x = -0.3;
  group.add(visor);

  // Botón superior
  const buttonGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const buttonMat = new THREE.MeshStandardMaterial({
    color: adjustColor(color, -20),
    roughness: 0.5,
    metalness: 0.3,
  });
  const button = new THREE.Mesh(buttonGeo, buttonMat);
  button.position.y = 0.56;
  group.add(button);

  if (isSide) {
    group.rotation.y = Math.PI / 2;
  }

  group.position.y = -0.1;
}

function applyFabricTexture(group, colorName) {
  // Crear textura procedural de tela (canvas)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const baseColor = GARMENT_COLORS[colorName]?.hex || '#F5F5F0';
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  // Agregar textura de algodón (patrón cruzado)
  for (let x = 0; x < 256; x += 2) {
    for (let y = 0; y < 256; y += 2) {
      const noise = Math.random() * 8 - 4;
      const r = Math.max(0, Math.min(255, parseInt(baseColor.slice(1, 3), 16) + noise));
      const g = Math.max(0, Math.min(255, parseInt(baseColor.slice(3, 5), 16) + noise));
      const b = Math.max(0, Math.min(255, parseInt(baseColor.slice(5, 7), 16) + noise));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);

  // Aplicar a todos los meshes
  group.traverse(child => {
    if (child.isMesh && child.material.map) return;
    if (child.isMesh && child.material) {
      const mat = child.material.clone();
      mat.map = texture;
      mat.needsUpdate = true;
      child.material = mat;
    }
  });
}

function adjustColor(color, amount) {
  const r = Math.max(0, Math.min(255, Math.round(color.r * 255) + amount));
  const g = Math.max(0, Math.min(255, Math.round(color.g * 255) + amount));
  const b = Math.max(0, Math.min(255, Math.round(color.b * 255) + amount));
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// ============================================================================
// ACTUALIZAR DECALS (DISEÑOS SOBRE LA PRENDA)
// ============================================================================
function updateDecals(garmentGroup, designs, template) {
  // Limpiar decals anteriores
  decalMeshesRef.current.forEach(m => {
    garmentGroup.remove(m);
    m.geometry?.dispose();
    if (m.material?.map) m.material.map.dispose();
    m.material?.dispose();
  });
  decalMeshesRef.current = [];

  if (!garmentGroup || designs.length === 0) return;

  const pa = getPrintArea3D(template);

  designs.forEach((design, index) => {
    const img = design.imgEl;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Crear textura del diseño
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Crear mesh como decal sobre la prenda
    const decalSize = design.width / 500; // Escalar a unidades 3D
    const decalGeo = new THREE.PlaneGeometry(decalSize, decalSize * (img.height / img.width));
    const decalMat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: design.opacity || 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const decal = new THREE.Mesh(decalGeo, decalMat);

    // Posicionar en la prenda
    const tx = (design.x / 500 - 0.5) * 1.2; // -0.6 a 0.6
    const ty = -(design.y / 500 - 0.5) * 1.2 + 0.1;
    decal.position.set(tx, ty, 0.48);

    // Rotación
    decal.rotation.z = -(design.rotation || 0) * Math.PI / 180;

    // Asegurar que el decal esté ligeramente fuera de la superficie
    if (template.includes('espalda') || template.includes('lateral')) {
      decal.position.z = -0.48;
      decal.rotation.y = Math.PI;
    }

    garmentGroup.add(decal);
    decalMeshesRef.current.push(decal);
  });
}

function getPrintArea3D(template) {
  const areas = {
    polera_frontal: { x: 0, y: 0, w: 0.6, h: 0.7 },
    polera_espalda: { x: 0, y: 0, w: 0.6, h: 0.7 },
    poleron_frontal: { x: 0, y: 0, w: 0.6, h: 0.6 },
    poleron_espalda: { x: 0, y: 0, w: 0.6, h: 0.6 },
    gorra_frontal: { x: 0, y: 0, w: 0.4, h: 0.3 },
    gorra_lateral: { x: 0, y: 0, w: 0.3, h: 0.25 },
  };
  return areas[template] || areas.polera_frontal;
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ template, setTemplate, color, setColor, designs, selectedDesignId, selectDesign, removeDesign, duplicateDesign, updateDesignLive, commitDesignChange, activeTab, setActiveTab, handleFile, handleLibrarySelect }) {
  const design = designs.find(d => d.id === selectedDesignId);

  return (
    <div className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {[
            { id: 'garment', label: 'Prenda', icon: Shirt },
            { id: 'upload', label: 'Subir', icon: Upload },
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
            <GarmentSelector template={template} setTemplate={setTemplate} color={color} setColor={setColor} />
          )}

          {activeTab === 'upload' && (
            <DesignUploader onFile={handleFile} />
          )}

          {activeTab === 'library' && (
            <LibraryPicker onSelect={handleLibrarySelect} />
          )}

          {/* Capas */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Capas ({designs.length})</h3>
            <LayersList designs={designs} selectedDesignId={selectedDesignId} selectDesign={selectDesign} removeDesign={removeDesign} />
          </div>

          {/* Propiedades */}
          {design && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades</h3>
              <DesignProperties design={design} updateDesignLive={updateDesignLive} commitDesignChange={commitDesignChange} removeDesign={removeDesign} duplicateDesign={duplicateDesign} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GarmentSelector({ template, setTemplate, color, setColor }) {
  const groups = [
    { name: 'Poleras', items: ['polera_frontal', 'polera_espalda'] },
    { name: 'Polerones', items: ['poleron_frontal', 'poleron_espalda'] },
    { name: 'Gorras', items: ['gorra_frontal', 'gorra_lateral'] },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Tipo de prenda</h3>
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.name}>
              <div className="text-xs text-slate-500 font-medium mb-1">{g.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map(id => (
                  <button
                    key={id}
                    onClick={() => setTemplate(id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      template === id ? 'bg-orange-500 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {GARMENT_TEMPLATES[id].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Color de prenda</h3>
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
        <MousePointer2 className="h-3 w-3 inline mr-1" />
        Arrastra sobre la prenda 3D para rotarla y verla desde cualquier ángulo
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
      className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-all ${
        drag ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50'
      }`}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
      <Upload className="h-5 w-5 text-orange-500 mx-auto" />
      <div className="mt-2 text-sm font-medium text-slate-700">Subir diseño</div>
      <div className="text-xs text-slate-500">PNG, JPG, WEBP</div>
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

function DesignProperties({ design, updateDesignLive, commitDesignChange, removeDesign, duplicateDesign }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{design.name}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => duplicateDesign(design.id)} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeDesign(design.id)} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-600">Rotación: {design.rotation}°</label>
        <Slider value={[design.rotation || 0]} min={0} max={360} step={1} onValueChange={([v]) => updateDesignLive(design.id, { rotation: v })} onValueCommit={commitDesignChange} className="mt-1" />
      </div>
      <div>
        <label className="text-xs text-slate-600">Opacidad: {Math.round((design.opacity || 1) * 100)}%</label>
        <Slider value={[(design.opacity || 1) * 100]} min={0} max={100} step={1} onValueChange={([v]) => updateDesignLive(design.id, { opacity: v / 100 })} onValueCommit={commitDesignChange} className="mt-1" />
      </div>
    </div>
  );
}

// ============================================================================
// ERROR BOUNDARY (mismo patrón que gang-sheet)
// ============================================================================
class MockupErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] rounded-xl border border-rose-200 bg-rose-50/60 px-6 text-center">
          <X className="h-10 w-10 text-rose-500 mb-3" />
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
  const [template, setTemplate] = useState('polera_frontal');
  const [color, setColor] = useState('white');
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [activeTab, setActiveTab] = useState('garment');
  const [uploading, setUploading] = useState(0);
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
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const aspect = img.width / img.height;
      const initialW = 120;
      const initialH = aspect >= 1 ? initialW : initialW / aspect;
      const newDesign = {
        id,
        imageUrl: imageData.url,
        name: imageData.name || 'Diseño',
        srcWidthPx: imageData.srcWidthPx || img.width,
        srcHeightPx: imageData.srcHeightPx || img.height,
        x: 250 - initialW / 2,
        y: 250 - initialH / 2,
        width: initialW,
        height: initialH,
        rotation: 0,
        opacity: 1,
        imgEl: img,
      };
      setDesigns(prev => {
        const next = [...prev, newDesign];
        pushHistory(next);
        return next;
      });
      setSelectedDesignId(id);
      toast.success(`${imageData.name} agregado al mockup`);
    };
    img.src = imageData.url;
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

  const duplicateDesign = useCallback((id) => {
    setDesigns(prev => {
      const src = prev.find(d => d.id === id);
      if (!src) return prev;
      const newId = crypto.randomUUID();
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const clone = { ...src, id: newId, x: src.x + 20, y: src.y + 20, imgEl: img };
        setDesigns(p => {
          const next = [...p, clone];
          pushHistory(next);
          return next;
        });
        setSelectedDesignId(newId);
      };
      img.src = src.imageUrl;
      return prev;
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    // Restaurar imágenes
    const snap = history[newIndex];
    const cache = new Map();
    designs.forEach(d => { if (d.imgEl) cache.set(d.id, d.imgEl); });
    setDesigns(snap.map(d => ({ ...d, imgEl: cache.get(d.id) || null })));
    setSelectedDesignId(null);
  }, [historyIndex, history, designs]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const snap = history[newIndex];
    const cache = new Map();
    designs.forEach(d => { if (d.imgEl) cache.set(d.id, d.imgEl); });
    setDesigns(snap.map(d => ({ ...d, imgEl: cache.get(d.id) || null })));
    setSelectedDesignId(null);
  }, [historyIndex, history, designs]);

  const handleFile = async (file) => {
    setUploading(n => n + 1);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      const data = await r.json();
      addDesign({ imageUrl: data.url, name: data.originalName, srcWidthPx: data.widthPx, srcHeightPx: data.heightPx });
    } catch { toast.error('Error al subir imagen'); }
    finally { setUploading(n => n - 1); }
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
      toast.success('Mockup 3D exportado');
    } catch { toast.error('Error al exportar'); }
  };

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
                <div className="text-sm text-slate-500 mt-3">Cargando motor 3D...</div>
              </div>
            )}
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
              </div>
            }>
              <ThreeScene
                template={template}
                color={color}
                designs={designs}
                onSceneReady={() => setLoading3D(false)}
              />
            </Suspense>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500 max-w-md">
            Arrastra sobre la prenda para rotarla en 3D. Selecciona una prenda, color y sube tus diseños.
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar
          template={template} setTemplate={setTemplate}
          color={color} setColor={setColor}
          designs={designs} selectedDesignId={selectedDesignId}
          selectDesign={setSelectedDesignId}
          removeDesign={removeDesign} duplicateDesign={duplicateDesign}
          updateDesignLive={updateDesignLive} commitDesignChange={commitDesignChange}
          activeTab={activeTab} setActiveTab={setActiveTab}
          handleFile={handleFile} handleLibrarySelect={handleLibrarySelect}
        />
      </div>
    </MockupErrorBoundary>
  );
}
