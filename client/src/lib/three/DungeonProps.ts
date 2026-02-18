import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaData } from '../stores/realtimeStore.svelte';
import { arenaToWorld } from './DungeonBuilder';

// ---------------------------------------------------------------------------
// Cube World environment GLTF props for dungeon decoration
// ---------------------------------------------------------------------------

const BASE_PATH = `${import.meta.env.BASE_URL}assets/Cube%20World%20-%20Aug%202023/Environment/glTF`;

interface PropDef {
  model: string;
  scale: number;
  yOffset: number; // vertical offset from floor
  castShadow: boolean;
  maxCount: number; // max instances per dungeon
  placement: 'wall' | 'corner' | 'open' | 'boundary'; // where to place
}

// Props suitable for a dungeon environment
const DUNGEON_PROPS: PropDef[] = [
  // Rocks — scattered near walls and in open areas
  { model: 'Rock1', scale: 0.7, yOffset: 0, castShadow: true, maxCount: 12, placement: 'wall' },
  { model: 'Rock2', scale: 0.5, yOffset: 0, castShadow: true, maxCount: 8, placement: 'open' },
  { model: 'Rock1', scale: 0.4, yOffset: 0, castShadow: true, maxCount: 10, placement: 'open' },

  // Dead trees — along boundary walls
  { model: 'DeadTree_1', scale: 0.45, yOffset: 0, castShadow: true, maxCount: 3, placement: 'boundary' },
  { model: 'DeadTree_2', scale: 0.45, yOffset: 0, castShadow: true, maxCount: 3, placement: 'boundary' },
  { model: 'DeadTree_3', scale: 0.45, yOffset: 0, castShadow: true, maxCount: 2, placement: 'boundary' },

  // Mushrooms — near walls in damp areas
  { model: 'Mushroom', scale: 0.35, yOffset: 0, castShadow: true, maxCount: 8, placement: 'wall' },

  // Crystals — glowing accents near walls
  { model: 'Crystal_Small', scale: 1.2, yOffset: 0, castShadow: true, maxCount: 6, placement: 'wall' },
  { model: 'Crystal_Big', scale: 0.6, yOffset: 0, castShadow: true, maxCount: 3, placement: 'corner' },

  // Bushes — open area vegetation
  { model: 'Bush', scale: 0.3, yOffset: 0, castShadow: true, maxCount: 5, placement: 'open' },

  // Ground cover — small plants and grass
  { model: 'Grass_Small', scale: 0.6, yOffset: 0, castShadow: false, maxCount: 15, placement: 'open' },
  { model: 'Grass_Big', scale: 0.4, yOffset: 0, castShadow: false, maxCount: 8, placement: 'open' },
  { model: 'Flowers_1', scale: 0.35, yOffset: 0, castShadow: false, maxCount: 6, placement: 'open' },
  { model: 'Flowers_2', scale: 0.35, yOffset: 0, castShadow: false, maxCount: 6, placement: 'open' },
  { model: 'Plant_2', scale: 0.3, yOffset: 0, castShadow: false, maxCount: 5, placement: 'wall' },

  // Chests — rare, placed in corners
  { model: 'Chest_Closed', scale: 0.4, yOffset: 0, castShadow: true, maxCount: 2, placement: 'corner' },
];

// ---------------------------------------------------------------------------
// Seeded pseudo-random (deterministic placement per dungeon)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// GLTF loading with cache
// ---------------------------------------------------------------------------

const gltfLoader = new GLTFLoader();
const propCache = new Map<string, THREE.Group>();
const loadingPromises = new Map<string, Promise<THREE.Group>>();

function loadPropModel(modelName: string): Promise<THREE.Group> {
  if (propCache.has(modelName)) {
    return Promise.resolve(propCache.get(modelName)!);
  }
  if (loadingPromises.has(modelName)) {
    return loadingPromises.get(modelName)!;
  }

  const url = `${BASE_PATH}/${modelName}.gltf`;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        propCache.set(modelName, gltf.scene);
        loadingPromises.delete(modelName);
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        console.warn(`[DungeonProps] Failed to load ${modelName}:`, err);
        loadingPromises.delete(modelName);
        reject(err);
      },
    );
  });

  loadingPromises.set(modelName, promise);
  return promise;
}

function cloneProp(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Clone material so tinting doesn't affect all instances
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m: THREE.Material) => m.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return clone;
}

// ---------------------------------------------------------------------------
// Collision check — ensure props don't overlap walls
// ---------------------------------------------------------------------------

const ARENA_SCALE = 0.1;

interface WallRect {
  x: number; y: number; w: number; h: number;
}

function isInsideWall(worldX: number, worldZ: number, walls: WallRect[], margin: number): boolean {
  for (const wall of walls) {
    const wx = (wall.x - wall.w * 0) * ARENA_SCALE; // wall positions are in arena coords
    const wz = (wall.y - wall.h * 0) * ARENA_SCALE;
    // Convert wall to world coords (center-based)
    const center = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    const halfW = (wall.w * ARENA_SCALE) / 2 + margin;
    const halfH = (wall.h * ARENA_SCALE) / 2 + margin;

    if (
      worldX >= center.x - halfW && worldX <= center.x + halfW &&
      worldZ >= center.z - halfH && worldZ <= center.z + halfH
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Placement generators
// ---------------------------------------------------------------------------

function generateWallPositions(
  walls: WallRect[],
  count: number,
  rng: () => number,
  arenaW: number,
  arenaH: number,
  allWalls: WallRect[],
): Array<{ x: number; z: number; rot: number }> {
  const positions: Array<{ x: number; z: number; rot: number }> = [];
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;

  for (let attempt = 0; attempt < count * 5 && positions.length < count; attempt++) {
    // Pick a random interior wall
    if (walls.length === 0) break;
    const wall = walls[Math.floor(rng() * walls.length)];
    const center = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    const ww = wall.w * ARENA_SCALE;
    const wh = wall.h * ARENA_SCALE;

    // Place near a random side of the wall
    const side = Math.floor(rng() * 4);
    let px: number, pz: number;
    const offset = 0.8 + rng() * 0.6;
    if (side === 0) { px = center.x + ww / 2 + offset; pz = center.z + (rng() - 0.5) * wh; }
    else if (side === 1) { px = center.x - ww / 2 - offset; pz = center.z + (rng() - 0.5) * wh; }
    else if (side === 2) { px = center.x + (rng() - 0.5) * ww; pz = center.z + wh / 2 + offset; }
    else { px = center.x + (rng() - 0.5) * ww; pz = center.z - wh / 2 - offset; }

    // Keep within arena bounds
    if (px < -halfW + 1 || px > halfW - 1 || pz < -halfH + 1 || pz > halfH - 1) continue;
    // Don't overlap other walls
    if (isInsideWall(px, pz, allWalls, 0.3)) continue;

    positions.push({ x: px, z: pz, rot: rng() * Math.PI * 2 });
  }
  return positions;
}

function generateBoundaryPositions(
  count: number,
  rng: () => number,
  arenaW: number,
  arenaH: number,
  allWalls: WallRect[],
): Array<{ x: number; z: number; rot: number }> {
  const positions: Array<{ x: number; z: number; rot: number }> = [];
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;
  const inset = 1.5; // distance from boundary wall

  for (let attempt = 0; attempt < count * 5 && positions.length < count; attempt++) {
    const side = Math.floor(rng() * 4);
    let px: number, pz: number;
    if (side === 0) { px = (rng() - 0.5) * (arenaW - 4); pz = -halfH + inset; }
    else if (side === 1) { px = (rng() - 0.5) * (arenaW - 4); pz = halfH - inset; }
    else if (side === 2) { px = -halfW + inset; pz = (rng() - 0.5) * (arenaH - 4); }
    else { px = halfW - inset; pz = (rng() - 0.5) * (arenaH - 4); }

    if (isInsideWall(px, pz, allWalls, 0.5)) continue;
    positions.push({ x: px, z: pz, rot: rng() * Math.PI * 2 });
  }
  return positions;
}

function generateOpenPositions(
  count: number,
  rng: () => number,
  arenaW: number,
  arenaH: number,
  allWalls: WallRect[],
): Array<{ x: number; z: number; rot: number }> {
  const positions: Array<{ x: number; z: number; rot: number }> = [];
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;

  for (let attempt = 0; attempt < count * 8 && positions.length < count; attempt++) {
    const px = (rng() - 0.5) * (arenaW - 4);
    const pz = (rng() - 0.5) * (arenaH - 4);

    // Stay away from arena center (player spawn area)
    const distFromCenter = Math.sqrt(px * px + pz * pz);
    if (distFromCenter < 5) continue;

    if (isInsideWall(px, pz, allWalls, 0.5)) continue;
    positions.push({ x: px, z: pz, rot: rng() * Math.PI * 2 });
  }
  return positions;
}

function generateCornerPositions(
  walls: WallRect[],
  count: number,
  rng: () => number,
  arenaW: number,
  arenaH: number,
  allWalls: WallRect[],
): Array<{ x: number; z: number; rot: number }> {
  const positions: Array<{ x: number; z: number; rot: number }> = [];
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;

  // Place near corners of interior walls
  for (let attempt = 0; attempt < count * 6 && positions.length < count; attempt++) {
    if (walls.length === 0) break;
    const wall = walls[Math.floor(rng() * walls.length)];
    const center = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    const ww = wall.w * ARENA_SCALE;
    const wh = wall.h * ARENA_SCALE;

    // Pick a corner
    const corner = Math.floor(rng() * 4);
    const sx = corner < 2 ? 1 : -1;
    const sz = corner % 2 === 0 ? 1 : -1;
    const offset = 0.6 + rng() * 0.4;
    const px = center.x + sx * (ww / 2 + offset);
    const pz = center.z + sz * (wh / 2 + offset);

    if (px < -halfW + 1 || px > halfW - 1 || pz < -halfH + 1 || pz > halfH - 1) continue;
    if (isInsideWall(px, pz, allWalls, 0.3)) continue;
    positions.push({ x: px, z: pz, rot: rng() * Math.PI * 2 });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DungeonPropsHandle {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Asynchronously load and place Cube World environment props in the dungeon.
 * Props are added to the returned group which should be added to the scene.
 */
export async function loadDungeonProps(
  arena: ArenaData,
  zone: string,
): Promise<DungeonPropsHandle> {
  const group = new THREE.Group();
  group.name = 'dungeonProps';

  const arenaW = arena.width * ARENA_SCALE;
  const arenaH = arena.height * ARENA_SCALE;

  // Deterministic seed from arena dimensions
  const seed = arena.width * 31 + arena.height * 17 + zone.length * 7;
  const rng = seededRandom(seed);

  // Collect unique model names to preload
  const uniqueModels = [...new Set(DUNGEON_PROPS.map((p) => p.model))];

  // Load all models in parallel (failures are silently skipped)
  const loaded = new Map<string, THREE.Group>();
  const results = await Promise.allSettled(uniqueModels.map((m) => loadPropModel(m)));
  for (let i = 0; i < uniqueModels.length; i++) {
    if (results[i].status === 'fulfilled') {
      loaded.set(uniqueModels[i], (results[i] as PromiseFulfilledResult<THREE.Group>).value);
    }
  }

  if (loaded.size === 0) {
    console.warn('[DungeonProps] No models loaded, skipping props');
    return { group, dispose: () => {} };
  }

  // Place each prop type
  for (const propDef of DUNGEON_PROPS) {
    const source = loaded.get(propDef.model);
    if (!source) continue;

    let positions: Array<{ x: number; z: number; rot: number }>;
    switch (propDef.placement) {
      case 'wall':
        positions = generateWallPositions(arena.walls, propDef.maxCount, rng, arenaW, arenaH, arena.walls);
        break;
      case 'boundary':
        positions = generateBoundaryPositions(propDef.maxCount, rng, arenaW, arenaH, arena.walls);
        break;
      case 'open':
        positions = generateOpenPositions(propDef.maxCount, rng, arenaW, arenaH, arena.walls);
        break;
      case 'corner':
        positions = generateCornerPositions(arena.walls, propDef.maxCount, rng, arenaW, arenaH, arena.walls);
        break;
    }

    for (const pos of positions) {
      const prop = cloneProp(source);
      prop.scale.setScalar(propDef.scale);
      prop.position.set(pos.x, propDef.yOffset, pos.z);
      prop.rotation.y = pos.rot;

      if (propDef.castShadow) {
        prop.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      } else {
        prop.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.receiveShadow = true;
          }
        });
      }

      group.add(prop);
    }
  }

  console.log(`[DungeonProps] Placed ${group.children.length} props`);

  return {
    group,
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      group.removeFromParent();
    },
  };
}
