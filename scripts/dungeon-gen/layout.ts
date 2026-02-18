// BSP-based seeded dungeon layout generator

import {
  createRNG,
  SIZE_ROOM_COUNTS,
  SIZE_GRID_DIMS,
  type DungeonConfig,
  type DungeonLayout,
  type RoomDef,
  type CorridorDef,
  type RoomType,
  type Difficulty,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ROOM_GRID = 3; // absolute minimum room dimension in grid units
const ROOM_MARGIN = 1; // gap between room edge and leaf edge (grid units)
const CORRIDOR_WIDTH = 2; // corridor width in grid units
const BSP_MAX_DEPTH = 6;

const DIFFICULTY_ROOM_LERP: Record<Difficulty, number> = {
  normal: 0.0,
  nightmare: 0.5,
  hell: 1.0,
};

const DIFFICULTY_MIN_ROOM_SIZE: Record<Difficulty, number> = {
  normal: 3,
  nightmare: 4,
  hell: 5,
};

// ---------------------------------------------------------------------------
// BSP types
// ---------------------------------------------------------------------------

interface BSPNode {
  x: number;
  y: number;
  w: number;
  h: number;
  left: BSPNode | null;
  right: BSPNode | null;
  room: { x: number; y: number; w: number; h: number } | null;
}

// ---------------------------------------------------------------------------
// BSP subdivision
// ---------------------------------------------------------------------------

function splitBSP(
  node: BSPNode,
  depth: number,
  minLeaf: number,
  rng: () => number,
): void {
  if (depth <= 0) return;
  if (node.w < minLeaf * 2 && node.h < minLeaf * 2) return;

  let splitH: boolean;
  if (node.w < minLeaf * 2) splitH = true;
  else if (node.h < minLeaf * 2) splitH = false;
  else splitH = depth % 2 === 0;

  const ratio = 0.4 + rng() * 0.2; // 0.4–0.6

  if (splitH) {
    const splitY = Math.round(node.y + node.h * ratio);
    const topH = splitY - node.y;
    const botH = node.h - topH;
    if (topH < minLeaf || botH < minLeaf) return;
    node.left = { x: node.x, y: node.y, w: node.w, h: topH, left: null, right: null, room: null };
    node.right = { x: node.x, y: splitY, w: node.w, h: botH, left: null, right: null, room: null };
  } else {
    const splitX = Math.round(node.x + node.w * ratio);
    const leftW = splitX - node.x;
    const rightW = node.w - leftW;
    if (leftW < minLeaf || rightW < minLeaf) return;
    node.left = { x: node.x, y: node.y, w: leftW, h: node.h, left: null, right: null, room: null };
    node.right = { x: splitX, y: node.y, w: rightW, h: node.h, left: null, right: null, room: null };
  }

  splitBSP(node.left!, depth - 1, minLeaf, rng);
  splitBSP(node.right!, depth - 1, minLeaf, rng);
}

function getLeaves(node: BSPNode): BSPNode[] {
  if (!node.left && !node.right) return [node];
  const leaves: BSPNode[] = [];
  if (node.left) leaves.push(...getLeaves(node.left));
  if (node.right) leaves.push(...getLeaves(node.right));
  return leaves;
}

// ---------------------------------------------------------------------------
// Room placement
// ---------------------------------------------------------------------------

function placeRooms(
  leaves: BSPNode[],
  targetCount: number,
  minRoomSize: number,
  rng: () => number,
): { x: number; y: number; w: number; h: number }[] {
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const skipped: BSPNode[] = [];

  // Shuffle leaves so skip selection is random
  const shuffled = [...leaves];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Calculate skip probability: if we have more leaves than target, skip some
  const skipProb = leaves.length > targetCount
    ? Math.min(0.4, (leaves.length - targetCount) / leaves.length)
    : 0;

  for (const leaf of shuffled) {
    if (rooms.length >= targetCount) {
      skipped.push(leaf);
      continue;
    }

    if (rooms.length >= 2 && rng() < skipProb) {
      skipped.push(leaf);
      continue;
    }

    const room = fitRoom(leaf, minRoomSize, rng);
    if (room) {
      leaf.room = room;
      rooms.push(room);
    } else {
      skipped.push(leaf);
    }
  }

  // Backfill if we don't have enough rooms
  for (const leaf of skipped) {
    if (rooms.length >= targetCount) break;
    const room = fitRoom(leaf, MIN_ROOM_GRID, rng);
    if (room) {
      leaf.room = room;
      rooms.push(room);
    }
  }

  return rooms;
}

function fitRoom(
  leaf: BSPNode,
  minSize: number,
  rng: () => number,
): { x: number; y: number; w: number; h: number } | null {
  const maxW = leaf.w - ROOM_MARGIN * 2;
  const maxH = leaf.h - ROOM_MARGIN * 2;
  if (maxW < minSize || maxH < minSize) return null;

  const rw = minSize + Math.floor(rng() * (maxW - minSize + 1));
  const rh = minSize + Math.floor(rng() * (maxH - minSize + 1));
  const rx = leaf.x + ROOM_MARGIN + Math.floor(rng() * (maxW - rw + 1));
  const ry = leaf.y + ROOM_MARGIN + Math.floor(rng() * (maxH - rh + 1));

  return { x: rx, y: ry, w: rw, h: rh };
}

// ---------------------------------------------------------------------------
// Corridor routing — L-shaped between BSP siblings
// ---------------------------------------------------------------------------

function getRoomFromSubtree(node: BSPNode): { x: number; y: number; w: number; h: number } | null {
  if (node.room) return node.room;
  if (node.left) {
    const r = getRoomFromSubtree(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = getRoomFromSubtree(node.right);
    if (r) return r;
  }
  return null;
}

interface RawCorridor {
  fromRoom: { x: number; y: number; w: number; h: number };
  toRoom: { x: number; y: number; w: number; h: number };
  segments: [number, number, number, number][];
}

function connectNodes(node: BSPNode, rng: () => number): RawCorridor[] {
  const corridors: RawCorridor[] = [];
  if (!node.left || !node.right) return corridors;

  corridors.push(...connectNodes(node.left, rng));
  corridors.push(...connectNodes(node.right, rng));

  const roomA = getRoomFromSubtree(node.left);
  const roomB = getRoomFromSubtree(node.right);
  if (!roomA || !roomB) return corridors;

  const ax = Math.floor(roomA.x + roomA.w / 2);
  const ay = Math.floor(roomA.y + roomA.h / 2);
  const bx = Math.floor(roomB.x + roomB.w / 2);
  const by = Math.floor(roomB.y + roomB.h / 2);

  const hw = Math.floor(CORRIDOR_WIDTH / 2);
  const segments: [number, number, number, number][] = [];

  if (rng() < 0.5) {
    // Horizontal first, then vertical
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    segments.push([minX - hw, ay - hw, maxX - minX + CORRIDOR_WIDTH, CORRIDOR_WIDTH]);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    segments.push([bx - hw, minY - hw, CORRIDOR_WIDTH, maxY - minY + CORRIDOR_WIDTH]);
  } else {
    // Vertical first, then horizontal
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    segments.push([ax - hw, minY - hw, CORRIDOR_WIDTH, maxY - minY + CORRIDOR_WIDTH]);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    segments.push([minX - hw, by - hw, maxX - minX + CORRIDOR_WIDTH, CORRIDOR_WIDTH]);
  }

  corridors.push({ fromRoom: roomA, toRoom: roomB, segments });
  return corridors;
}

// ---------------------------------------------------------------------------
// Connectivity: BFS component detection + bridge corridors
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

function buildAdjacency(
  rooms: Rect[],
  corridors: RawCorridor[],
): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < rooms.length; i++) adj.set(i, new Set());

  // Rooms touching corridors
  for (const corr of corridors) {
    const touching: number[] = [];
    for (let i = 0; i < rooms.length; i++) {
      for (const seg of corr.segments) {
        const segRect = { x: seg[0], y: seg[1], w: seg[2], h: seg[3] };
        if (rectsOverlap(rooms[i], segRect, 1)) {
          touching.push(i);
          break;
        }
      }
    }
    for (let i = 0; i < touching.length; i++) {
      for (let j = i + 1; j < touching.length; j++) {
        adj.get(touching[i])!.add(touching[j]);
        adj.get(touching[j])!.add(touching[i]);
      }
    }
  }

  // Rooms that directly overlap
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsOverlap(rooms[i], rooms[j], 1)) {
        adj.get(i)!.add(j);
        adj.get(j)!.add(i);
      }
    }
  }

  return adj;
}

function ensureConnectivity(
  rooms: Rect[],
  corridors: RawCorridor[],
): RawCorridor[] {
  if (rooms.length < 2) return [];

  const adj = buildAdjacency(rooms, corridors);

  // Find connected components via BFS
  const visited = new Set<number>();
  const components: number[][] = [];
  for (let i = 0; i < rooms.length; i++) {
    if (visited.has(i)) continue;
    const comp: number[] = [];
    const queue: number[] = [i];
    visited.add(i);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      const neighbors = adj.get(cur);
      if (neighbors) {
        for (const nb of neighbors) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
    }
    components.push(comp);
  }

  if (components.length <= 1) return [];

  // Connect each component to component[0] via nearest room pair
  const extra: RawCorridor[] = [];
  for (let c = 1; c < components.length; c++) {
    let bestA = -1;
    let bestB = -1;
    let bestDist = Infinity;
    for (const ai of components[0]) {
      const a = rooms[ai];
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;
      for (const bi of components[c]) {
        const b = rooms[bi];
        const bcx = b.x + b.w / 2;
        const bcy = b.y + b.h / 2;
        const d = Math.hypot(acx - bcx, acy - bcy);
        if (d < bestDist) {
          bestDist = d;
          bestA = ai;
          bestB = bi;
        }
      }
    }

    if (bestA >= 0 && bestB >= 0) {
      const a = rooms[bestA];
      const b = rooms[bestB];
      const ax = Math.floor(a.x + a.w / 2);
      const ay = Math.floor(a.y + a.h / 2);
      const bx = Math.floor(b.x + b.w / 2);
      const by = Math.floor(b.y + b.h / 2);
      const hw = Math.floor(CORRIDOR_WIDTH / 2);
      const segments: [number, number, number, number][] = [];

      const minX = Math.min(ax, bx);
      const maxX = Math.max(ax, bx);
      segments.push([minX - hw, ay - hw, maxX - minX + CORRIDOR_WIDTH, CORRIDOR_WIDTH]);
      const minY = Math.min(ay, by);
      const maxY = Math.max(ay, by);
      segments.push([bx - hw, minY - hw, CORRIDOR_WIDTH, maxY - minY + CORRIDOR_WIDTH]);

      extra.push({ fromRoom: a, toRoom: b, segments });
      // Merge into component 0
      components[0].push(...components[c]);
    }
  }

  return extra;
}

// ---------------------------------------------------------------------------
// BFS distance on room graph
// ---------------------------------------------------------------------------

function bfsDistance(
  rooms: Rect[],
  corridors: RawCorridor[],
  startIdx: number,
): Map<number, number> {
  const adj = buildAdjacency(rooms, corridors);
  const dist = new Map<number, number>();
  dist.set(startIdx, 0);
  const queue: number[] = [startIdx];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    const neighbors = adj.get(cur);
    if (neighbors) {
      for (const nb of neighbors) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Room type assignment
// ---------------------------------------------------------------------------

function assignRoomTypes(
  rooms: Rect[],
  corridors: RawCorridor[],
  gridW: number,
  gridH: number,
  rng: () => number,
): { types: RoomType[]; entranceIdx: number; bossIdx: number } {
  const n = rooms.length;
  const types: RoomType[] = new Array(n).fill('arena');

  // 1) Entrance: nearest to grid center
  const cx = gridW / 2;
  const cy = gridH / 2;
  let entranceIdx = 0;
  let minCenterDist = Infinity;
  for (let i = 0; i < n; i++) {
    const rcx = rooms[i].x + rooms[i].w / 2;
    const rcy = rooms[i].y + rooms[i].h / 2;
    const d = Math.hypot(rcx - cx, rcy - cy);
    if (d < minCenterDist) {
      minCenterDist = d;
      entranceIdx = i;
    }
  }
  types[entranceIdx] = 'entrance';

  // 2) Boss: max BFS distance from entrance
  const dist = bfsDistance(rooms, corridors, entranceIdx);
  let bossIdx = -1;
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    if (i === entranceIdx) continue;
    const d = dist.get(i) ?? 0;
    if (d > maxDist) {
      maxDist = d;
      bossIdx = i;
    }
  }
  // Fallback: geometric distance
  if (bossIdx < 0 || maxDist === 0) {
    let maxGeo = 0;
    for (let i = 0; i < n; i++) {
      if (i === entranceIdx) continue;
      const rcx = rooms[i].x + rooms[i].w / 2;
      const rcy = rooms[i].y + rooms[i].h / 2;
      const ecx = rooms[entranceIdx].x + rooms[entranceIdx].w / 2;
      const ecy = rooms[entranceIdx].y + rooms[entranceIdx].h / 2;
      const d = Math.hypot(rcx - ecx, rcy - ecy);
      if (d > maxGeo) {
        maxGeo = d;
        bossIdx = i;
      }
    }
  }
  if (bossIdx >= 0) types[bossIdx] = 'boss';

  // 3) Build connectivity count for each room
  const adj = buildAdjacency(rooms, corridors);
  const connectivity: number[] = [];
  for (let i = 0; i < n; i++) {
    connectivity.push(adj.get(i)?.size ?? 0);
  }

  // 4) Treasure rooms: 1-2 dead-end or low-connectivity rooms (not entrance/boss)
  const treasureCandidates = rooms
    .map((_, i) => i)
    .filter((i) => types[i] === 'arena')
    .sort((a, b) => connectivity[a] - connectivity[b]);

  const treasureCount = treasureCandidates.length >= 2 && rng() < 0.5 ? 2 : 1;
  for (let t = 0; t < treasureCount && t < treasureCandidates.length; t++) {
    types[treasureCandidates[t]] = 'treasure';
  }

  // 5) Shrine: smallest remaining arena room (0-1)
  const shrineCandidates = rooms
    .map((r, i) => ({ i, area: r.w * r.h }))
    .filter((c) => types[c.i] === 'arena')
    .sort((a, b) => a.area - b.area);

  if (shrineCandidates.length > 0 && rng() < 0.6) {
    types[shrineCandidates[0].i] = 'shrine';
  }

  return { types, entranceIdx, bossIdx };
}

// ---------------------------------------------------------------------------
// Grid stamping
// ---------------------------------------------------------------------------

function stampGrid(
  grid: Uint8Array,
  gridW: number,
  gridH: number,
  rooms: Rect[],
  corridors: RawCorridor[],
): void {
  // Stamp rooms
  for (const room of rooms) {
    for (let gy = room.y; gy < room.y + room.h && gy < gridH; gy++) {
      for (let gx = room.x; gx < room.x + room.w && gx < gridW; gx++) {
        if (gx >= 0 && gy >= 0) grid[gy * gridW + gx] = 1;
      }
    }
  }

  // Stamp corridor segments
  for (const corr of corridors) {
    for (const [sx, sy, sw, sh] of corr.segments) {
      for (let gy = sy; gy < sy + sh && gy < gridH; gy++) {
        for (let gx = sx; gx < sx + sw && gx < gridW; gx++) {
          if (gx >= 0 && gy >= 0) grid[gy * gridW + gx] = 1;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function generateLayout(config: DungeonConfig): DungeonLayout {
  const rng = createRNG(config.seed);

  const [gridW, gridH] = SIZE_GRID_DIMS[config.size];
  const [minRooms, maxRooms] = SIZE_ROOM_COUNTS[config.size];

  // Difficulty scales room count toward max and increases minimum room sizes
  const diffLerp = DIFFICULTY_ROOM_LERP[config.difficulty];
  const targetRoomCount = Math.round(minRooms + (maxRooms - minRooms) * diffLerp);
  const minRoomSize = DIFFICULTY_MIN_ROOM_SIZE[config.difficulty];

  // Compute minimum BSP leaf size: must fit room + margin
  const minLeaf = minRoomSize + ROOM_MARGIN * 2;

  // BSP subdivision — leave a 1-cell border around the grid
  const border = 1;
  const root: BSPNode = {
    x: border,
    y: border,
    w: gridW - border * 2,
    h: gridH - border * 2,
    left: null,
    right: null,
    room: null,
  };
  splitBSP(root, BSP_MAX_DEPTH, minLeaf, rng);

  const leaves = getLeaves(root);

  // Place rooms within BSP leaves
  const rawRooms = placeRooms(leaves, targetRoomCount, minRoomSize, rng);

  // Connect rooms via BSP hierarchy (L-shaped corridors)
  let corridors = connectNodes(root, rng);

  // Fix disconnected components
  const extraCorridors = ensureConnectivity(rawRooms, corridors);
  if (extraCorridors.length > 0) {
    corridors = [...corridors, ...extraCorridors];
  }

  // Assign room types
  const { types, entranceIdx, bossIdx } = assignRoomTypes(
    rawRooms,
    corridors,
    gridW,
    gridH,
    rng,
  );

  // Build RoomDef array
  const roomDefs: RoomDef[] = rawRooms.map((r, i) => ({
    id: `room_${i}`,
    type: types[i],
    position: [r.x, r.y] as [number, number],
    gridSize: [r.w, r.h] as [number, number],
    connected: true,
  }));

  // Build CorridorDef array
  const corridorDefs: CorridorDef[] = corridors.map((c, i) => {
    // Find room IDs for from/to
    let fromId = 'unknown';
    let toId = 'unknown';
    for (let ri = 0; ri < rawRooms.length; ri++) {
      if (rawRooms[ri] === c.fromRoom) fromId = `room_${ri}`;
      if (rawRooms[ri] === c.toRoom) toId = `room_${ri}`;
    }
    return {
      id: `corridor_${i}`,
      from: fromId,
      to: toId,
      segments: c.segments,
    };
  });

  // Stamp grid
  const grid = new Uint8Array(gridW * gridH); // 0=wall, 1=floor
  stampGrid(grid, gridW, gridH, rawRooms, corridors);

  // Spawn point = entrance room center
  const entrance = rawRooms[entranceIdx];
  const spawnPoint: [number, number] = [
    Math.floor(entrance.x + entrance.w / 2),
    Math.floor(entrance.y + entrance.h / 2),
  ];

  // Boss point = boss room center (or null)
  let bossPoint: [number, number] | null = null;
  if (bossIdx >= 0) {
    const boss = rawRooms[bossIdx];
    bossPoint = [
      Math.floor(boss.x + boss.w / 2),
      Math.floor(boss.y + boss.h / 2),
    ];
  }

  return {
    config,
    gridWidth: gridW,
    gridHeight: gridH,
    rooms: roomDefs,
    corridors: corridorDefs,
    grid,
    spawnPoint,
    bossPoint,
  };
}
