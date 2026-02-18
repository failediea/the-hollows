import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { EnemyArchetype } from '../stores/types';

// ---------------------------------------------------------------------------
// Archetype → Cube World GLTF model mapping
// ---------------------------------------------------------------------------

const ARCHETYPE_MODEL: Record<EnemyArchetype, string> = {
  brute: 'Giant',
  guardian: 'Skeleton_Armor',
  assassin: 'Goblin',
  caster: 'Wizard',
  boss: 'Demon',
};

// Archetype-specific scale (Cube World models are small, need scaling up)
const ARCHETYPE_SCALE: Record<EnemyArchetype, number> = {
  brute: 1.1,
  guardian: 0.85,
  assassin: 0.7,
  caster: 0.85,
  boss: 1.5,
};

// Use Vite's base URL so paths work with any base config
const BASE_PATH = `${import.meta.env.BASE_URL}models/enemies`;

// ---------------------------------------------------------------------------
// Cache: loaded GLTF data per model name (shared across instances)
// ---------------------------------------------------------------------------

interface CachedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const gltfLoader = new GLTFLoader();
const modelCache = new Map<string, CachedModel>();
const loadingPromises = new Map<string, Promise<CachedModel>>();

function loadModel(modelName: string): Promise<CachedModel> {
  if (modelCache.has(modelName)) {
    return Promise.resolve(modelCache.get(modelName)!);
  }

  if (loadingPromises.has(modelName)) {
    return loadingPromises.get(modelName)!;
  }

  const url = `${BASE_PATH}/${modelName}.gltf`;
  const promise = new Promise<CachedModel>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf: GLTF) => {
        const cached: CachedModel = {
          scene: gltf.scene,
          animations: gltf.animations,
        };
        modelCache.set(modelName, cached);
        loadingPromises.delete(modelName);
        resolve(cached);
      },
      undefined,
      (error) => {
        console.error(`Failed to load GLTF model: ${url}`, error);
        loadingPromises.delete(modelName);
        reject(error);
      },
    );
  });

  loadingPromises.set(modelName, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Clone helper — SkeletonUtils.clone properly duplicates skinned meshes
// so each instance has its own skeleton & can animate independently.
// ---------------------------------------------------------------------------

function cloneModel(cached: CachedModel, archetype: EnemyArchetype): { group: THREE.Group; mixer: THREE.AnimationMixer; clips: Map<string, THREE.AnimationClip> } {
  // SkeletonUtils.clone creates a deep copy with independent skeletons
  const group = skeletonClone(cached.scene) as THREE.Group;
  group.name = `gltf_enemy_${archetype}`;

  const scale = ARCHETYPE_SCALE[archetype];
  group.scale.setScalar(scale);

  // Clone materials so per-instance flash coloring works
  group.traverse((child) => {
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

  // Mixer bound to the cloned group's own skeleton
  const mixer = new THREE.AnimationMixer(group);

  // Clips can be shared (they reference bones by name, mixer resolves per-instance)
  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of cached.animations) {
    clips.set(clip.name, clip);
  }

  return { group, mixer, clips };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GLTFEnemyInstance {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
}

/**
 * Pre-load all enemy models so they're cached before gameplay starts.
 */
export async function preloadEnemyModels(): Promise<void> {
  const modelNames = new Set(Object.values(ARCHETYPE_MODEL));
  await Promise.all([...modelNames].map((name) => loadModel(name)));
}

/**
 * Check if a model is already cached (for sync fallback).
 */
export function isModelCached(archetype: EnemyArchetype): boolean {
  const modelName = ARCHETYPE_MODEL[archetype];
  return modelCache.has(modelName);
}

/**
 * Synchronously create from cache. Throws if not cached.
 */
export function createGLTFEnemySync(archetype: EnemyArchetype): GLTFEnemyInstance {
  const modelName = ARCHETYPE_MODEL[archetype];
  const cached = modelCache.get(modelName);
  if (!cached) {
    throw new Error(`Model ${modelName} not cached. Call preloadEnemyModels() first.`);
  }
  return cloneModel(cached, archetype);
}
