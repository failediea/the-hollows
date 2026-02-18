import { greedyMeshWallGrid, generateSeededDungeon, createRNG } from '../three/DungeonGenerator';
import type { ArenaData } from './realtimeStore.svelte';

export const GRID_CELL = 20;

export interface BuilderEnemy {
  id: string;
  name: string;
  archetype: string;
  element: string;
  x: number;
  y: number;
}

export interface BuilderResource {
  id: string;
  resourceId: string;
  name: string;
  rarity: string;
  x: number;
  y: number;
}

export interface BuilderProp {
  id: string;
  catalogId: string;  // e.g. "environment/Rock1" — references BuilderAssetCatalog
  x: number;          // arena coords
  y: number;          // arena coords
  rotation: number;   // Y-axis rotation in radians
  scale: number;      // multiplier on default scale
}

export interface BuilderBlockStyle {
  floorBlock: string;
  wallBlock: string;
  wallHeight: number;
  enabled: boolean;
}

export interface BuilderMapData {
  version: 1;
  name: string;
  zone: string;
  arena: { width: number; height: number };
  wallGrid: string; // base64 encoded Uint8Array
  gridW: number;
  gridH: number;
  playerSpawn: { x: number; y: number } | null;
  exitPosition: { x: number; y: number } | null;
  enemies: BuilderEnemy[];
  resources: BuilderResource[];
  props: BuilderProp[];
  blockStyle?: BuilderBlockStyle;
}

export type BuilderTool = 'wall_paint' | 'wall_erase' | 'player_spawn' | 'exit_portal' | 'resource' | 'prop' | 'select' | 'pan';

function createBuilderStore() {
  // Arena dimensions (pixels) - default 3600x2700
  let arenaWidth = $state(3600);
  let arenaHeight = $state(2700);
  let gridW = $derived(Math.ceil(arenaWidth / GRID_CELL));
  let gridH = $derived(Math.ceil(arenaHeight / GRID_CELL));

  // Wall grid: 1 = wall, 0 = floor (NOTE: opposite of DungeonGenerator where 1=floor)
  let wallGrid = $state(new Uint8Array(Math.ceil(3600 / GRID_CELL) * Math.ceil(2700 / GRID_CELL)));

  let zone = $state('tomb_halls');
  let mapName = $state('Untitled Map');
  let activeTool = $state<BuilderTool>('select');
  let showGrid = $state(true);
  let playerSpawn = $state<{ x: number; y: number } | null>(null);
  let exitPosition = $state<{ x: number; y: number } | null>(null);
  let enemies = $state<BuilderEnemy[]>([]);
  let resources = $state<BuilderResource[]>([]);
  let props = $state<BuilderProp[]>([]);
  let selectedId = $state<string | null>(null);
  let nextEnemyId = 0;
  let nextResourceId = 0;
  let nextPropId = 0;
  let selectedCatalogId = $state('environment/Rock1');
  let blockStyle = $state<BuilderBlockStyle | null>(null);

  // Enemy placement defaults
  let enemyArchetype = $state('brute');
  let enemyElement = $state('none');
  let resourceType = $state('iron_scraps');
  let resourceRarity = $state('common');

  // Dirty flag for rebuild
  let wallsDirty = $state(false);

  function setArenaSize(w: number, h: number) {
    arenaWidth = w;
    arenaHeight = h;
    const newGridW = Math.ceil(w / GRID_CELL);
    const newGridH = Math.ceil(h / GRID_CELL);
    const newGrid = new Uint8Array(newGridW * newGridH);
    // Copy old grid data where it overlaps
    const oldGridW = Math.ceil(arenaWidth / GRID_CELL);
    const oldGridH = Math.ceil(arenaHeight / GRID_CELL);
    const copyW = Math.min(oldGridW, newGridW);
    const copyH = Math.min(oldGridH, newGridH);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        newGrid[y * newGridW + x] = wallGrid[y * oldGridW + x] || 0;
      }
    }
    wallGrid = newGrid;
  }

  function setWallCell(gx: number, gy: number, value: 0 | 1) {
    const gw = Math.ceil(arenaWidth / GRID_CELL);
    if (gx < 0 || gy < 0 || gx >= gw || gy >= Math.ceil(arenaHeight / GRID_CELL)) return;
    const idx = gy * gw + gx;
    if (wallGrid[idx] !== value) {
      wallGrid[idx] = value;
      wallsDirty = true;
    }
  }

  function getWallCell(gx: number, gy: number): number {
    const gw = Math.ceil(arenaWidth / GRID_CELL);
    if (gx < 0 || gy < 0 || gx >= gw || gy >= Math.ceil(arenaHeight / GRID_CELL)) return 0;
    return wallGrid[gy * gw + gx];
  }

  function setPlayerSpawn(x: number, y: number) {
    playerSpawn = { x, y };
  }

  function setExitPosition(x: number, y: number) {
    exitPosition = { x, y };
  }

  function addEnemy(x: number, y: number): string {
    const id = `builder_enemy_${nextEnemyId++}`;
    enemies = [...enemies, {
      id,
      name: `${enemyArchetype} (${enemyElement})`,
      archetype: enemyArchetype,
      element: enemyElement,
      x, y,
    }];
    return id;
  }

  function removeEnemy(id: string) {
    enemies = enemies.filter(e => e.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function addResource(x: number, y: number): string {
    const id = `builder_resource_${nextResourceId++}`;
    resources = [...resources, {
      id,
      resourceId: resourceType,
      name: resourceType.replace(/_/g, ' '),
      rarity: resourceRarity,
      x, y,
    }];
    return id;
  }

  function removeResource(id: string) {
    resources = resources.filter(r => r.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function addProp(x: number, y: number): string {
    const id = `builder_prop_${nextPropId++}`;
    props = [...props, {
      id,
      catalogId: selectedCatalogId,
      x, y,
      rotation: 0,
      scale: 1,
    }];
    return id;
  }

  function removeProp(id: string) {
    props = props.filter(p => p.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function updateProp(id: string, updates: Partial<Pick<BuilderProp, 'rotation' | 'scale' | 'x' | 'y'>>) {
    const prop = props.find(p => p.id === id);
    if (prop) {
      if (updates.rotation !== undefined) prop.rotation = updates.rotation;
      if (updates.scale !== undefined) prop.scale = updates.scale;
      if (updates.x !== undefined) prop.x = updates.x;
      if (updates.y !== undefined) prop.y = updates.y;
      props = [...props]; // trigger reactivity
    }
  }

  function moveEntity(id: string, x: number, y: number) {
    const enemy = enemies.find(e => e.id === id);
    if (enemy) {
      enemy.x = x;
      enemy.y = y;
      enemies = [...enemies]; // trigger reactivity
      return;
    }
    const resource = resources.find(r => r.id === id);
    if (resource) {
      resource.x = x;
      resource.y = y;
      resources = [...resources];
      return;
    }
    const prop = props.find(p => p.id === id);
    if (prop) {
      prop.x = x;
      prop.y = y;
      props = [...props];
    }
  }

  function toArenaData(): ArenaData {
    const gw = Math.ceil(arenaWidth / GRID_CELL);
    const gh = Math.ceil(arenaHeight / GRID_CELL);
    const walls = greedyMeshWallGrid(wallGrid, gw, gh, GRID_CELL);
    return {
      width: arenaWidth,
      height: arenaHeight,
      walls,
      exitPosition: exitPosition || undefined,
    };
  }

  function consumeWallsDirty(): boolean {
    if (wallsDirty) {
      wallsDirty = false;
      return true;
    }
    return false;
  }

  function exportJSON(): string {
    // Encode wallGrid as base64
    const bytes = new Uint8Array(wallGrid);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);

    const data: BuilderMapData = {
      version: 1,
      name: mapName,
      zone,
      arena: { width: arenaWidth, height: arenaHeight },
      wallGrid: b64,
      gridW: Math.ceil(arenaWidth / GRID_CELL),
      gridH: Math.ceil(arenaHeight / GRID_CELL),
      playerSpawn,
      exitPosition,
      enemies: [...enemies],
      resources: [...resources],
      props: [...props],
      blockStyle: blockStyle ?? undefined,
    };
    return JSON.stringify(data, null, 2);
  }

  // Map dungeon-gen zone types to builder zone IDs
  const DUNGEON_ZONE_MAP: Record<string, string> = {
    crypt: 'tomb_halls',
    cavern: 'the_mines',
    cathedral: 'bone_throne',
    sewer: 'the_web',
    fortress: 'forge_of_ruin',
  };

  const ENEMY_CATALOG_IDS = [
    'enemies/Goblin', 'enemies/Skeleton', 'enemies/Skeleton_Armor',
    'enemies/Hedgehog', 'enemies/Wizard', 'enemies/Zombie', 'enemies/Yeti',
  ];
  const BOSS_CATALOG_IDS = ['enemies/Demon', 'enemies/Giant'];

  function generateDungeon(seed: number, size: 'small' | 'medium' | 'large') {
    const sizeDims: Record<string, [number, number]> = {
      small: [1800, 1800],
      medium: [3600, 2700],
      large: [5400, 5400],
    };
    const [w, h] = sizeDims[size] || sizeDims.medium;

    const layout = generateSeededDungeon(w, h, seed);

    // Set arena size
    arenaWidth = w;
    arenaHeight = h;

    // Invert grid: DungeonGen 0=wall,1=floor → Builder 1=wall,0=floor
    const gw = layout.gridW;
    const gh = layout.gridH;
    const builderGrid = new Uint8Array(gw * gh);
    for (let i = 0; i < layout.grid.length; i++) {
      builderGrid[i] = layout.grid[i] === 0 ? 1 : 0;
    }
    wallGrid = builderGrid;

    // Set spawn and exit
    playerSpawn = { x: layout.startRoom.centerX, y: layout.startRoom.centerY };
    exitPosition = { x: layout.exitRoom.centerX, y: layout.exitRoom.centerY };

    // Clear existing entities
    enemies = [];
    resources = [];
    props = [];
    nextEnemyId = 0;
    nextResourceId = 0;
    nextPropId = 0;

    // Use seeded RNG for deterministic placement
    const rng = createRNG(seed + 7919);

    for (const room of layout.rooms) {
      if (room.isStart) continue;

      if (room.isExit) {
        // Boss room — place a large boss enemy prop
        const bossId = BOSS_CATALOG_IDS[Math.floor(rng() * BOSS_CATALOG_IDS.length)];
        const id = `builder_prop_${nextPropId++}`;
        props.push({
          id,
          catalogId: bossId,
          x: room.centerX,
          y: room.centerY,
          rotation: 0,
          scale: 1.5,
        });
        continue;
      }

      // ~70% of non-start/exit rooms get enemies
      if (rng() < 0.7) {
        // Scale enemy count by room area — bigger rooms get more enemies
        const roomArea = room.w * room.h;
        const baseCount = Math.max(2, Math.floor(roomArea / 40000)); // ~2 per 200x200 chunk
        const count = baseCount + Math.floor(rng() * 3); // +0-2 extra
        const margin = 60; // keep enemies away from walls
        const spawnW = Math.max(room.w - margin * 2, 40);
        const spawnH = Math.max(room.h - margin * 2, 40);

        for (let i = 0; i < count; i++) {
          const enemyId = ENEMY_CATALOG_IDS[Math.floor(rng() * ENEMY_CATALOG_IDS.length)];
          const id = `builder_prop_${nextPropId++}`;
          // Spread enemies across the room area
          const ex = room.x + margin + rng() * spawnW;
          const ey = room.y + margin + rng() * spawnH;
          props.push({
            id,
            catalogId: enemyId,
            x: ex,
            y: ey,
            rotation: rng() * Math.PI * 2,
            scale: 1,
          });
        }
      }
    }

    wallsDirty = true;
  }

  function importDungeonManifest(data: {
    seed: number;
    zone: string;
    size: string;
    difficulty: string;
    rooms: { id: string; type: string; position: [number, number]; size: [number, number] }[];
    connections: [string, string][];
    spawn_points: { player: [number, number, number]; boss: [number, number, number] | null };
  }) {
    // Determine grid dimensions from size
    const gridDims: Record<string, [number, number]> = {
      small: [24, 24],
      medium: [36, 36],
      large: [48, 48],
    };
    const [gw, gh] = gridDims[data.size] || [36, 36];

    // Set arena size: each dungeon grid cell = one builder grid cell (GRID_CELL pixels)
    arenaWidth = gw * GRID_CELL;
    arenaHeight = gh * GRID_CELL;

    // Start with all walls (1 = wall in builder)
    const grid = new Uint8Array(gw * gh);
    grid.fill(1);

    // Carve rooms (set to 0 = floor)
    for (const room of data.rooms) {
      const [rx, ry] = room.position;
      const [rw, rh] = room.size;
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          const gx = rx + dx;
          const gy = ry + dy;
          if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
            grid[gy * gw + gx] = 0;
          }
        }
      }
    }

    // Build room center lookup for corridor carving
    const roomCenters = new Map<string, [number, number]>();
    for (const room of data.rooms) {
      const cx = Math.floor(room.position[0] + room.size[0] / 2);
      const cy = Math.floor(room.position[1] + room.size[1] / 2);
      roomCenters.set(room.id, [cx, cy]);
    }

    // Carve L-shaped corridors between connected rooms
    for (const [fromId, toId] of data.connections) {
      const from = roomCenters.get(fromId);
      const to = roomCenters.get(toId);
      if (!from || !to) continue;

      const [x1, y1] = from;
      const [x2, y2] = to;

      // Horizontal segment from x1 to x2 at y1
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX; x <= maxX; x++) {
        if (x >= 0 && x < gw && y1 >= 0 && y1 < gh) {
          grid[y1 * gw + x] = 0;
          // Make corridor 2 cells wide when possible
          if (y1 + 1 < gh) grid[(y1 + 1) * gw + x] = 0;
        }
      }

      // Vertical segment from y1 to y2 at x2
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY; y <= maxY; y++) {
        if (x2 >= 0 && x2 < gw && y >= 0 && y < gh) {
          grid[y * gw + x2] = 0;
          if (x2 + 1 < gw) grid[y * gw + x2 + 1] = 0;
        }
      }
    }

    wallGrid = grid;

    // Map zone
    zone = DUNGEON_ZONE_MAP[data.zone] || 'tomb_halls';
    mapName = `${data.zone}_${data.seed}`;

    // Convert spawn points from world coords back to arena pixel coords
    const sp = data.spawn_points.player;
    const spGridX = (sp[0] - 2) / 4;
    const spGridY = (sp[2] - 2) / 4;
    playerSpawn = {
      x: spGridX * GRID_CELL + GRID_CELL / 2,
      y: spGridY * GRID_CELL + GRID_CELL / 2,
    };

    // Boss spawn → exit position
    if (data.spawn_points.boss) {
      const bp = data.spawn_points.boss;
      const bpGridX = (bp[0] - 2) / 4;
      const bpGridY = (bp[2] - 2) / 4;
      exitPosition = {
        x: bpGridX * GRID_CELL + GRID_CELL / 2,
        y: bpGridY * GRID_CELL + GRID_CELL / 2,
      };
    } else {
      exitPosition = null;
    }

    // Place enemy props and resources (not legacy BuilderEnemy)
    enemies = [];
    resources = [];
    props = [];
    nextEnemyId = 0;
    nextResourceId = 0;
    nextPropId = 0;

    const difficultyMultiplier: Record<string, number> = {
      normal: 1,
      nightmare: 2,
      hell: 3,
    };
    const mult = difficultyMultiplier[data.difficulty] || 1;

    // Use seeded RNG for deterministic enemy selection
    const rng = createRNG(data.seed + 7919);

    for (const room of data.rooms) {
      const cx = (room.position[0] + room.size[0] / 2) * GRID_CELL;
      const cy = (room.position[1] + room.size[1] / 2) * GRID_CELL;

      if (room.type === 'arena') {
        // Spread enemies across room area, scale count by difficulty and room size
        const roomPxW = room.size[0] * GRID_CELL;
        const roomPxH = room.size[1] * GRID_CELL;
        const roomArea = roomPxW * roomPxH;
        const baseCount = Math.max(2, Math.floor(roomArea / 40000));
        const count = baseCount + mult; // difficulty adds more
        const margin = GRID_CELL;
        const spawnW = Math.max(roomPxW - margin * 2, GRID_CELL);
        const spawnH = Math.max(roomPxH - margin * 2, GRID_CELL);
        const roomLeft = room.position[0] * GRID_CELL;
        const roomTop = room.position[1] * GRID_CELL;

        for (let i = 0; i < count; i++) {
          const enemyCatalogId = ENEMY_CATALOG_IDS[Math.floor(rng() * ENEMY_CATALOG_IDS.length)];
          const id = `builder_prop_${nextPropId++}`;
          const ex = roomLeft + margin + rng() * spawnW;
          const ey = roomTop + margin + rng() * spawnH;
          props.push({
            id,
            catalogId: enemyCatalogId,
            x: ex,
            y: ey,
            rotation: rng() * Math.PI * 2,
            scale: 1,
          });
        }
      } else if (room.type === 'boss') {
        // Boss room — large Demon or Giant
        const bossId = BOSS_CATALOG_IDS[Math.floor(rng() * BOSS_CATALOG_IDS.length)];
        const id = `builder_prop_${nextPropId++}`;
        props.push({
          id,
          catalogId: bossId,
          x: cx,
          y: cy,
          rotation: 0,
          scale: 1.5,
        });
      } else if (room.type === 'treasure') {
        const id = `builder_resource_${nextResourceId++}`;
        const rarity = mult >= 3 ? 'legendary' : mult >= 2 ? 'rare' : 'uncommon';
        resources.push({ id, resourceId: 'ancient_coins', name: 'ancient coins', rarity, x: cx, y: cy });
      }
    }

    wallsDirty = true;
  }

  function importJSON(json: string) {
    const data = JSON.parse(json);

    // Detect dungeon manifest format (has seed + rooms + connections, no version)
    if (data.seed !== undefined && data.rooms && data.connections && data.spawn_points) {
      importDungeonManifest(data);
      return;
    }

    // Standard builder map format
    if (data.version !== 1) throw new Error('Unsupported map version');

    mapName = data.name;
    zone = data.zone;
    arenaWidth = data.arena.width;
    arenaHeight = data.arena.height;

    // Decode base64 wallGrid
    const binary = atob(data.wallGrid);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    wallGrid = bytes;

    playerSpawn = data.playerSpawn;
    exitPosition = data.exitPosition;
    enemies = data.enemies;
    resources = data.resources;
    props = data.props || [];
    blockStyle = data.blockStyle ?? null;

    // Reset ID counters
    nextEnemyId = enemies.length;
    nextResourceId = resources.length;
    nextPropId = props.length;

    wallsDirty = true;
  }

  function clear() {
    const gw = Math.ceil(arenaWidth / GRID_CELL);
    const gh = Math.ceil(arenaHeight / GRID_CELL);
    wallGrid = new Uint8Array(gw * gh);
    playerSpawn = null;
    exitPosition = null;
    enemies = [];
    resources = [];
    props = [];
    selectedId = null;
    blockStyle = null;
    nextEnemyId = 0;
    nextResourceId = 0;
    nextPropId = 0;
    wallsDirty = true;
  }

  return {
    get arenaWidth() { return arenaWidth; },
    get arenaHeight() { return arenaHeight; },
    get gridW() { return gridW; },
    get gridH() { return gridH; },
    get wallGrid() { return wallGrid; },
    get zone() { return zone; },
    set zone(v: string) { zone = v; },
    get mapName() { return mapName; },
    set mapName(v: string) { mapName = v; },
    get activeTool() { return activeTool; },
    set activeTool(v: BuilderTool) { activeTool = v; },
    get showGrid() { return showGrid; },
    set showGrid(v: boolean) { showGrid = v; },
    get playerSpawn() { return playerSpawn; },
    get exitPosition() { return exitPosition; },
    get enemies() { return enemies; },
    get resources() { return resources; },
    get props() { return props; },
    get selectedCatalogId() { return selectedCatalogId; },
    set selectedCatalogId(v: string) { selectedCatalogId = v; },
    get selectedId() { return selectedId; },
    set selectedId(v: string | null) { selectedId = v; },
    get enemyArchetype() { return enemyArchetype; },
    set enemyArchetype(v: string) { enemyArchetype = v; },
    get enemyElement() { return enemyElement; },
    set enemyElement(v: string) { enemyElement = v; },
    get resourceType() { return resourceType; },
    set resourceType(v: string) { resourceType = v; },
    get resourceRarity() { return resourceRarity; },
    set resourceRarity(v: string) { resourceRarity = v; },
    get blockStyle() { return blockStyle; },
    set blockStyle(v: BuilderBlockStyle | null) { blockStyle = v; wallsDirty = true; },

    setArenaSize,
    setWallCell,
    getWallCell,
    setPlayerSpawn,
    setExitPosition,
    addEnemy,
    removeEnemy,
    addResource,
    removeResource,
    addProp,
    removeProp,
    updateProp,
    moveEntity,
    toArenaData,
    consumeWallsDirty,
    exportJSON,
    importJSON,
    generateDungeon,
    clear,
  };
}

export const builderStore = createBuilderStore();
