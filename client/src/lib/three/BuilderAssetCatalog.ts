import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// ---------------------------------------------------------------------------
// Builder Asset Catalog — all Cube World glTF/GLB assets for prop placement
// ---------------------------------------------------------------------------

const BASE = `${import.meta.env.BASE_URL}assets/Cube%20World%20-%20Aug%202023`;

export type AssetCategory =
  | 'environment'
  | 'enemies'
  | 'animals'
  | 'characters'
  | 'blocks'
  | 'pixel_blocks'
  | 'tools'
  | 'player';

export interface CatalogEntry {
  id: string;
  name: string;
  category: AssetCategory;
  path: string;
  defaultScale: number;
  yOffset: number;
}

// ---------------------------------------------------------------------------
// Display name formatting
// ---------------------------------------------------------------------------

function formatName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

// ---------------------------------------------------------------------------
// Catalog builder helpers
// ---------------------------------------------------------------------------

function gltfEntries(
  category: AssetCategory,
  folder: string,
  models: string[],
  defaultScale: number,
  yOffset = 0,
  scaleOverrides?: Record<string, number>,
): CatalogEntry[] {
  return models.map((model) => ({
    id: `${category}/${model}`,
    name: formatName(model),
    category,
    path: `${BASE}/${folder}/glTF/${model}.gltf`,
    defaultScale: scaleOverrides?.[model] ?? defaultScale,
    yOffset,
  }));
}

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

export const ASSET_CATALOG: CatalogEntry[] = [
  // Animals
  ...gltfEntries('animals', 'Animals', [
    'Cat', 'Chick', 'Chicken', 'Dog', 'Horse', 'Pig', 'Raccoon', 'Sheep', 'Wolf',
  ], 0.6),

  // Blocks
  ...gltfEntries('blocks', 'Blocks', [
    'Block_Blank', 'Block_Brick', 'Block_Cheese', 'Block_Coal', 'Block_Crate',
    'Block_Crystal', 'Block_Diamond', 'Block_Dirt', 'Block_Grass', 'Block_GreyBricks',
    'Block_Ice', 'Block_Metal', 'Block_Snow', 'Block_Stone', 'Block_WoodPlanks',
  ], 0.5),

  // Characters
  ...gltfEntries('characters', 'Characters', [
    'Character_Female_1', 'Character_Female_2', 'Character_Male_1', 'Character_Male_2',
  ], 0.8),

  // Enemies
  ...gltfEntries('enemies', 'Enemies', [
    'Demon', 'Giant', 'Goblin', 'Hedgehog', 'Skeleton', 'Skeleton_Armor',
    'Wizard', 'Yeti', 'Zombie',
  ], 0.85, 0, {
    Giant: 1.1,
    Goblin: 0.7,
    Demon: 1.5,
    Hedgehog: 0.7,
    Skeleton: 0.85,
    Skeleton_Armor: 0.85,
    Wizard: 0.85,
    Yeti: 1.1,
    Zombie: 0.85,
  }),

  // Environment
  ...gltfEntries('environment', 'Environment', [
    'Bamboo', 'Bamboo_Mid', 'Bamboo_Small', 'Bush', 'Button', 'Cart',
    'Chest_Closed', 'Chest_Open', 'Crystal_Big', 'Crystal_Small',
    'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'Door_Closed',
    'Fence_Center', 'Fence_Corner', 'Fence_End', 'Fence_T',
    'Flowers_1', 'Flowers_2', 'Grass_Big', 'Grass_Small', 'Key',
    'Lever_Left', 'Lever_Right', 'Mushroom', 'Plant_2', 'Plant_3',
    'Rail_Corner', 'Rail_Incline', 'Rail_Straight',
    'Rock1', 'Rock2', 'Tree_1', 'Tree_2', 'Tree_3',
  ], 0.5),

  // Pixel Blocks
  ...gltfEntries('pixel_blocks', 'Pixel%20Blocks', [
    'Block_Blank', 'Block_Square', 'Bricks_Dark', 'Bricks_Grey', 'Bricks_Red',
    'Bricks_Yellow', 'Coal', 'Diamond', 'Dirt', 'Exclamation', 'Grass', 'Ice',
    'Leaves', 'QuestionMark', 'Snow', 'Stone', 'Wood', 'WoodPlanks',
  ], 0.5),

  // Tools
  ...gltfEntries('tools', 'Tools', [
    'Axe_Diamond', 'Axe_Gold', 'Axe_Stone', 'Axe_Wood',
    'Pickaxe_Diamond', 'Pickaxe_Gold', 'Pickaxe_Stone', 'Pickaxe_Wood',
    'Shovel_Diamond', 'Shovel_Gold', 'Shovel_Stone', 'Shovel_Wood',
    'Sword_Diamond', 'Sword_Gold', 'Sword_Stone', 'Sword_Wood',
  ], 0.45),

  // Player (GLB, not glTF)
  {
    id: 'player/mage',
    name: 'Mage',
    category: 'player',
    path: `${BASE}/Player/mage.glb`,
    defaultScale: 0.8,
    yOffset: 0,
  },
];

// ---------------------------------------------------------------------------
// Grouped by category for UI
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  environment: 'Environment',
  enemies: 'Enemies',
  animals: 'Animals',
  characters: 'Characters',
  blocks: 'Blocks',
  pixel_blocks: 'Pixel Blocks',
  tools: 'Tools',
  player: 'Player',
};

const CATEGORY_ORDER: AssetCategory[] = [
  'environment', 'enemies', 'animals', 'characters', 'blocks', 'pixel_blocks', 'tools', 'player',
];

export const ASSET_CATEGORIES: { id: AssetCategory; label: string; entries: CatalogEntry[] }[] =
  CATEGORY_ORDER.map((cat) => ({
    id: cat,
    label: CATEGORY_LABELS[cat],
    entries: ASSET_CATALOG.filter((e) => e.category === cat),
  }));

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const catalogMap = new Map<string, CatalogEntry>();
for (const entry of ASSET_CATALOG) {
  catalogMap.set(entry.id, entry);
}

export function getCatalogEntry(catalogId: string): CatalogEntry | undefined {
  return catalogMap.get(catalogId);
}

// ---------------------------------------------------------------------------
// GLTF/GLB loader with cache & clone
// ---------------------------------------------------------------------------

const gltfLoader = new GLTFLoader();

interface CachedModel {
  scene: THREE.Group;
  groundOffset: number; // how much to lift so model sits on ground
  animations: THREE.AnimationClip[];
}

export interface BuilderAssetResult {
  model: THREE.Group;
  animations: THREE.AnimationClip[];
}

const modelCache = new Map<string, CachedModel>();
const loadingPromises = new Map<string, Promise<CachedModel>>();

/** Compute how much to raise the model so its bottom sits at y=0 */
function computeGroundOffset(group: THREE.Group): number {
  const box = new THREE.Box3().setFromObject(group);
  return -box.min.y; // lift by the negative of the lowest point
}

function cloneGroup(source: THREE.Group): THREE.Group {
  // Use SkeletonUtils.clone for proper skinned mesh support
  const clone = skeletonClone(source) as THREE.Group;
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m: THREE.Material) => m.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return clone;
}

/**
 * Load a builder asset by catalog ID. Returns a cloned THREE.Group and its
 * animation clips. The group's userData.groundOffset indicates how much to
 * raise it so it sits on the floor.
 */
export function loadBuilderAsset(catalogId: string): Promise<BuilderAssetResult> {
  const entry = catalogMap.get(catalogId);
  if (!entry) {
    return Promise.reject(new Error(`Unknown catalog id: ${catalogId}`));
  }

  function prepareClone(cached: CachedModel): BuilderAssetResult {
    const clone = cloneGroup(cached.scene);
    clone.userData.groundOffset = cached.groundOffset;
    return { model: clone, animations: cached.animations };
  }

  if (modelCache.has(catalogId)) {
    return Promise.resolve(prepareClone(modelCache.get(catalogId)!));
  }

  if (loadingPromises.has(catalogId)) {
    return loadingPromises.get(catalogId)!.then((cached) => prepareClone(cached));
  }

  const promise = new Promise<CachedModel>((resolve, reject) => {
    gltfLoader.load(
      entry.path,
      (gltf) => {
        const groundOffset = computeGroundOffset(gltf.scene);
        const cached: CachedModel = { scene: gltf.scene, groundOffset, animations: gltf.animations || [] };
        modelCache.set(catalogId, cached);
        loadingPromises.delete(catalogId);
        resolve(cached);
      },
      undefined,
      (err) => {
        console.warn(`[BuilderAssetCatalog] Failed to load ${catalogId}:`, err);
        loadingPromises.delete(catalogId);
        reject(err);
      },
    );
  });

  loadingPromises.set(catalogId, promise);
  return promise.then((cached) => prepareClone(cached));
}

/** Synchronous lookup of cached animation clip names for a catalog ID. */
export function getCachedAnimationClipNames(catalogId: string): string[] {
  const cached = modelCache.get(catalogId);
  if (!cached) return [];
  return cached.animations.map(clip => clip.name);
}
