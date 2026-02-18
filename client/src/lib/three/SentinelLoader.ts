import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Sentinel model: 7 separate GLB files sharing one mesh + skeleton,
// each containing a single animation clip.
// ---------------------------------------------------------------------------

const BASE_PATH = `${import.meta.env.BASE_URL}assets/Sentinel`;

/** Files to load, keyed by a short animation name for the clips map. */
const ANIM_FILES: Record<string, string> = {
  'Combat_Stance': 'sentinel_Combat_Stance_withSkin.glb',
  'Walking': 'sentinel_Animation_Walking_withSkin.glb',
  'Running': 'sentinel_Animation_Running_withSkin.glb',
  'Sprint': 'sentinel_Lean_Forward_Sprint_withSkin.glb',
  'Punch_Combo': 'sentinel_Animation_Punch_Combo_withSkin.glb',
  'Basic_Jump': 'sentinel_Animation_Basic_Jump_withSkin.glb',
  'Chest_Pound_Taunt': 'sentinel_Chest_Pound_Taunt_withSkin.glb',
};

/** The file we use as the canonical mesh source (loaded first). */
const MESH_SOURCE = 'Combat_Stance';

const SCALE = 0.95;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CachedSentinel {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

const gltfLoader = new GLTFLoader();
let cachedModel: CachedSentinel | null = null;
let loadPromise: Promise<CachedSentinel> | null = null;

// ---------------------------------------------------------------------------
// Preload
// ---------------------------------------------------------------------------

export function preloadSentinelModel(): Promise<void> {
  if (cachedModel) return Promise.resolve();
  if (loadPromise) return loadPromise.then(() => {});

  loadPromise = (async () => {
    // Load all GLBs in parallel
    const entries = Object.entries(ANIM_FILES);
    const results = await Promise.all(
      entries.map(([key, file]) =>
        new Promise<{ key: string; gltf: GLTF }>((resolve, reject) => {
          gltfLoader.load(
            `${BASE_PATH}/${file}`,
            (gltf) => resolve({ key, gltf }),
            undefined,
            (err) => {
              console.warn(`[SentinelLoader] Failed to load ${file}:`, err);
              reject(err);
            },
          );
        }),
      ),
    );

    // Extract mesh scene from the canonical source
    const meshResult = results.find((r) => r.key === MESH_SOURCE);
    if (!meshResult) throw new Error('Sentinel mesh source not found');

    const scene = meshResult.gltf.scene;

    // Collect all animation clips, re-keyed by our short name
    const clips = new Map<string, THREE.AnimationClip>();
    for (const { key, gltf } of results) {
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0];
        // Rename clip to our short key for easy lookup
        clip.name = key;
        clips.set(key, clip);
      }
    }

    cachedModel = { scene, clips };
    loadPromise = null;
    return cachedModel;
  })();

  return loadPromise.then(() => {});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function hasSentinelModel(): boolean {
  return cachedModel !== null;
}

export interface SentinelInstance {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
}

/**
 * Create a new Sentinel instance with its own skeleton, mixer, and clips.
 * Call preloadSentinelModel() first.
 */
export function createSentinelInstance(): SentinelInstance {
  if (!cachedModel) {
    throw new Error('Sentinel model not cached. Call preloadSentinelModel() first.');
  }

  // SkeletonUtils.clone creates a deep copy with independent skeletons
  const group = skeletonClone(cachedModel.scene) as THREE.Group;
  group.name = 'sentinel_gltf';
  group.scale.setScalar(SCALE);
  // Model's natural front is +Z, matching atan2(dx, dz) convention for smooth facing

  // Clone materials so per-instance flash/tint works
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
  return { group, mixer, clips: cachedModel.clips };
}
