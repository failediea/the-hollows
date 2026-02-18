import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WALL_GLB_PATH = `${import.meta.env.BASE_URL}assets/map/wall.glb`;
const gltfLoader = new GLTFLoader();

export interface WallAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Native model dimensions (from bounding box) */
  width: number;
  height: number;
  depth: number;
}

let cachedAsset: WallAsset | null = null;
let loadPromise: Promise<WallAsset> | null = null;

/**
 * Preload wall.glb — stores the mesh geometry + material + native dimensions.
 * Cached so subsequent calls return the same instance.
 */
export function preloadWallAsset(): Promise<WallAsset> {
  if (cachedAsset) return Promise.resolve(cachedAsset);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<WallAsset>((resolve, reject) => {
    gltfLoader.load(
      WALL_GLB_PATH,
      (gltf) => {
        let mesh: THREE.Mesh | null = null;
        gltf.scene.traverse((child) => {
          if (!mesh && child instanceof THREE.Mesh) {
            mesh = child as THREE.Mesh;
          }
        });

        if (!mesh) {
          loadPromise = null;
          reject(new Error('No mesh found in wall.glb'));
          return;
        }

        const geo = mesh.geometry as THREE.BufferGeometry;
        const mat = mesh.material as THREE.MeshStandardMaterial;

        // Ensure textures tile via REPEAT wrapping
        const textures = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap];
        for (const tex of textures) {
          if (tex) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
          }
        }

        // Compute native bounding box dimensions
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);

        cachedAsset = {
          geometry: geo,
          material: mat,
          width: size.x,
          height: size.y,
          depth: size.z,
        };
        loadPromise = null;
        resolve(cachedAsset);
      },
      undefined,
      (err) => {
        console.warn('[WallAssetLoader] Failed to load wall.glb:', err);
        loadPromise = null;
        reject(err);
      },
    );
  });

  return loadPromise;
}

/**
 * Returns the cached wall asset if already loaded, or null.
 */
export function getLoadedWallAsset(): WallAsset | null {
  return cachedAsset;
}
