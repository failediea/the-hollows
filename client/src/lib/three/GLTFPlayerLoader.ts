import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { PlayerClass } from '../stores/types';

// ---------------------------------------------------------------------------
// Player class → GLTF model mapping
// Only classes with GLTF models are listed; others use procedural meshes.
// ---------------------------------------------------------------------------

const CLASS_MODEL: Partial<Record<PlayerClass, string>> = {
  pyromancer: 'mage',
};

const CLASS_SCALE: Partial<Record<PlayerClass, number>> = {
  pyromancer: 0.85,
};

// Y offset to place feet on ground (model bottom is at Y = -0.957)
const CLASS_Y_OFFSET: Partial<Record<PlayerClass, number>> = {
  pyromancer: 0.957,
};

const BASE_PATH = `${import.meta.env.BASE_URL}models/player`;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CachedPlayerModel {
  scene: THREE.Group;
}

const gltfLoader = new GLTFLoader();
const modelCache = new Map<string, CachedPlayerModel>();
const loadingPromises = new Map<string, Promise<CachedPlayerModel>>();

function loadModel(modelName: string): Promise<CachedPlayerModel> {
  if (modelCache.has(modelName)) {
    return Promise.resolve(modelCache.get(modelName)!);
  }
  if (loadingPromises.has(modelName)) {
    return loadingPromises.get(modelName)!;
  }

  const url = `${BASE_PATH}/${modelName}.glb`;
  const promise = new Promise<CachedPlayerModel>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf: GLTF) => {
        const cached: CachedPlayerModel = { scene: gltf.scene };
        modelCache.set(modelName, cached);
        loadingPromises.delete(modelName);
        resolve(cached);
      },
      undefined,
      (error) => {
        console.error(`Failed to load player GLTF: ${url}`, error);
        loadingPromises.delete(modelName);
        reject(error);
      },
    );
  });

  loadingPromises.set(modelName, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-load all GLTF player models so they're cached before gameplay.
 */
export async function preloadPlayerModels(): Promise<void> {
  const modelNames = new Set(Object.values(CLASS_MODEL));
  await Promise.all([...modelNames].map((name) => loadModel(name)));
}

/**
 * Check if a GLTF model exists and is cached for the given class.
 */
export function hasGLTFPlayerModel(playerClass: PlayerClass): boolean {
  const modelName = CLASS_MODEL[playerClass];
  if (!modelName) return false;
  return modelCache.has(modelName);
}

/**
 * Create a clone of the cached GLTF player mesh.
 * Returns a THREE.Group named 'body' with correct scale/offset applied.
 * Throws if not cached — call preloadPlayerModels() first.
 */
export function createGLTFPlayerMesh(playerClass: PlayerClass): THREE.Group {
  const modelName = CLASS_MODEL[playerClass];
  if (!modelName) throw new Error(`No GLTF model for class: ${playerClass}`);

  const cached = modelCache.get(modelName);
  if (!cached) throw new Error(`Player model ${modelName} not cached.`);

  // Deep clone the scene
  const clone = cached.scene.clone(true);

  // Clone materials so per-instance tinting/flash works
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: THREE.Material) => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    }
  });

  // Wrap in a group named 'body' for AnimationController compatibility
  const wrapper = new THREE.Group();
  wrapper.name = 'body';

  const scale = CLASS_SCALE[playerClass] ?? 1.0;
  const yOffset = CLASS_Y_OFFSET[playerClass] ?? 0;

  clone.scale.setScalar(scale);
  clone.position.y = yOffset * scale; // lift model so feet are at y=0
  wrapper.add(clone);

  return wrapper;
}
