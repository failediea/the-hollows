// Shared types for the procedural dungeon generation system

export type ZoneType = 'crypt' | 'cavern' | 'cathedral' | 'sewer' | 'fortress';
export type DungeonSize = 'small' | 'medium' | 'large';
export type Difficulty = 'normal' | 'nightmare' | 'hell';
export type RoomType = 'entrance' | 'corridor' | 'arena' | 'boss' | 'treasure' | 'shrine';

export interface DungeonConfig {
  seed: number;
  zone: ZoneType;
  size: DungeonSize;
  difficulty: Difficulty;
}

export interface RoomDef {
  id: string;
  type: RoomType;
  /** Grid position [gx, gy] */
  position: [number, number];
  /** Grid size [w, h] in grid units */
  gridSize: [number, number];
  /** Whether this room has been connected */
  connected: boolean;
}

export interface CorridorDef {
  id: string;
  from: string;
  to: string;
  /** Corridor path segments as [x, y, w, h] in grid units */
  segments: [number, number, number, number][];
}

export interface DungeonLayout {
  config: DungeonConfig;
  gridWidth: number;
  gridHeight: number;
  rooms: RoomDef[];
  corridors: CorridorDef[];
  /** Grid array: 0=wall, 1=floor */
  grid: Uint8Array;
  spawnPoint: [number, number];
  bossPoint: [number, number] | null;
}

/** Grid unit = 4x4x3 meters */
export const GRID_UNIT = 4;
export const WALL_HEIGHT = 3;

export const SIZE_ROOM_COUNTS: Record<DungeonSize, [number, number]> = {
  small: [5, 8],
  medium: [10, 15],
  large: [18, 25],
};

export const SIZE_GRID_DIMS: Record<DungeonSize, [number, number]> = {
  small: [24, 24],
  medium: [36, 36],
  large: [48, 48],
};

export const TRIANGLE_BUDGETS: Record<DungeonSize, number> = {
  small: 50_000,
  medium: 100_000,
  large: 200_000,
};

// Seeded PRNG (mulberry32)
export function createRNG(seed: number) {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DungeonManifest {
  seed: number;
  zone: ZoneType;
  size: DungeonSize;
  difficulty: Difficulty;
  rooms: { id: string; type: RoomType; position: [number, number]; size: [number, number] }[];
  connections: [string, string][];
  spawn_points: { player: [number, number, number]; boss: [number, number, number] | null };
  light_count: number;
  prop_count: number;
}
