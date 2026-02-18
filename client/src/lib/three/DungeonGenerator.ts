import type { ArenaData } from '../stores/realtimeStore.svelte';

export interface Room {
  x: number; y: number; w: number; h: number;
  centerX: number; centerY: number;
  isStart: boolean; isExit: boolean;
}

export interface DungeonLayout {
  arena: ArenaData;
  rooms: Room[];
  startRoom: Room;
  exitRoom: Room;
  exitPosition: { x: number; y: number };
  spawnPosition: { x: number; y: number };
  grid: Uint8Array;   // raw BSP grid: 0=wall, 1=floor
  gridW: number;
  gridH: number;
}

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

/**
 * Generate a dungeon with a deterministic seed by temporarily replacing Math.random.
 */
export function generateSeededDungeon(width: number, height: number, seed: number): DungeonLayout {
  const rng = createRNG(seed);
  const origRandom = Math.random;
  Math.random = rng;
  try {
    return generateProceduralDungeon(width, height);
  } finally {
    Math.random = origRandom;
  }
}

// BSP tree node
interface BSPNode {
  x: number; y: number; w: number; h: number;
  left: BSPNode | null;
  right: BSPNode | null;
  room: Room | null;
}

const MIN_LEAF = 300;
const MIN_ROOM = 200;
const ROOM_MARGIN = 40;
const CORRIDOR_WIDTH = 90;
const BORDER = 60;
const GRID_CELL = 20;
const PILLAR_SIZE = 24;
const PILLAR_THRESHOLD = 400;

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function splitBSP(node: BSPNode, depth: number): void {
  if (depth <= 0) return;
  if (node.w < MIN_LEAF * 2 && node.h < MIN_LEAF * 2) return;

  // Choose split direction: alternate, but respect size constraints
  let splitH: boolean;
  if (node.w < MIN_LEAF * 2) splitH = true;
  else if (node.h < MIN_LEAF * 2) splitH = false;
  else splitH = depth % 2 === 0;

  const ratio = randRange(0.4, 0.6);

  if (splitH) {
    const splitY = Math.round(node.y + node.h * ratio);
    const topH = splitY - node.y;
    const botH = node.h - topH;
    if (topH < MIN_LEAF || botH < MIN_LEAF) return;
    node.left = { x: node.x, y: node.y, w: node.w, h: topH, left: null, right: null, room: null };
    node.right = { x: node.x, y: splitY, w: node.w, h: botH, left: null, right: null, room: null };
  } else {
    const splitX = Math.round(node.x + node.w * ratio);
    const leftW = splitX - node.x;
    const rightW = node.w - leftW;
    if (leftW < MIN_LEAF || rightW < MIN_LEAF) return;
    node.left = { x: node.x, y: node.y, w: leftW, h: node.h, left: null, right: null, room: null };
    node.right = { x: splitX, y: node.y, w: rightW, h: node.h, left: null, right: null, room: null };
  }

  splitBSP(node.left!, depth - 1);
  splitBSP(node.right!, depth - 1);
}

function getLeaves(node: BSPNode): BSPNode[] {
  if (!node.left && !node.right) return [node];
  const leaves: BSPNode[] = [];
  if (node.left) leaves.push(...getLeaves(node.left));
  if (node.right) leaves.push(...getLeaves(node.right));
  return leaves;
}

function placeRooms(leaves: BSPNode[]): Room[] {
  const rooms: Room[] = [];
  const skipped: BSPNode[] = [];
  for (const leaf of leaves) {
    // 10-15% chance to skip (leave empty)
    if (Math.random() < 0.12) {
      skipped.push(leaf);
      continue;
    }

    const maxW = leaf.w - ROOM_MARGIN * 2;
    const maxH = leaf.h - ROOM_MARGIN * 2;
    if (maxW < MIN_ROOM || maxH < MIN_ROOM) continue;

    const rw = Math.round(randRange(MIN_ROOM, maxW));
    const rh = Math.round(randRange(MIN_ROOM, maxH));
    const rx = Math.round(leaf.x + ROOM_MARGIN + Math.random() * (maxW - rw));
    const ry = Math.round(leaf.y + ROOM_MARGIN + Math.random() * (maxH - rh));

    const room: Room = {
      x: rx, y: ry, w: rw, h: rh,
      centerX: Math.round(rx + rw / 2),
      centerY: Math.round(ry + rh / 2),
      isStart: false,
      isExit: false,
    };
    leaf.room = room;
    rooms.push(room);
  }
  // Ensure at least 2 rooms by backfilling skipped leaves
  while (rooms.length < 2 && skipped.length > 0) {
    const leaf = skipped.pop()!;
    const maxW = leaf.w - ROOM_MARGIN * 2;
    const maxH = leaf.h - ROOM_MARGIN * 2;
    if (maxW < MIN_ROOM || maxH < MIN_ROOM) continue;
    const rw = Math.round(randRange(MIN_ROOM, maxW));
    const rh = Math.round(randRange(MIN_ROOM, maxH));
    const rx = Math.round(leaf.x + ROOM_MARGIN + Math.random() * (maxW - rw));
    const ry = Math.round(leaf.y + ROOM_MARGIN + Math.random() * (maxH - rh));
    const room: Room = {
      x: rx, y: ry, w: rw, h: rh,
      centerX: Math.round(rx + rw / 2),
      centerY: Math.round(ry + rh / 2),
      isStart: false, isExit: false,
    };
    leaf.room = room;
    rooms.push(room);
  }
  return rooms;
}

// Get a room from a BSP subtree (any leaf's room)
function getRoom(node: BSPNode): Room | null {
  if (node.room) return node.room;
  if (node.left) {
    const r = getRoom(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = getRoom(node.right);
    if (r) return r;
  }
  return null;
}

interface Corridor {
  segments: { x: number; y: number; w: number; h: number }[];
}

function connectNodes(node: BSPNode): Corridor[] {
  const corridors: Corridor[] = [];
  if (!node.left || !node.right) return corridors;

  // Recurse children first
  corridors.push(...connectNodes(node.left));
  corridors.push(...connectNodes(node.right));

  // Connect the two children's nearest rooms with L-shaped corridor
  const roomA = getRoom(node.left);
  const roomB = getRoom(node.right);
  if (!roomA || !roomB) return corridors;

  const ax = roomA.centerX;
  const ay = roomA.centerY;
  const bx = roomB.centerX;
  const by = roomB.centerY;
  const hw = Math.round(CORRIDOR_WIDTH / 2);

  // L-shaped: horizontal then vertical (or vice versa, random)
  const segments: { x: number; y: number; w: number; h: number }[] = [];
  if (Math.random() < 0.5) {
    // Horizontal from A to midX, then vertical to B
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    segments.push({ x: minX - hw, y: ay - hw, w: maxX - minX + CORRIDOR_WIDTH, h: CORRIDOR_WIDTH });
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    segments.push({ x: bx - hw, y: minY - hw, w: CORRIDOR_WIDTH, h: maxY - minY + CORRIDOR_WIDTH });
  } else {
    // Vertical from A, then horizontal to B
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    segments.push({ x: ax - hw, y: minY - hw, w: CORRIDOR_WIDTH, h: maxY - minY + CORRIDOR_WIDTH });
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    segments.push({ x: minX - hw, y: by - hw, w: maxX - minX + CORRIDOR_WIDTH, h: CORRIDOR_WIDTH });
  }

  corridors.push({ segments });
  return corridors;
}

// BFS distance between rooms
function bfsDistance(rooms: Room[], corridors: Corridor[], start: Room): Map<Room, number> {
  // Build adjacency: two rooms are adjacent if a corridor connects areas overlapping them
  const adj = new Map<Room, Set<Room>>();
  for (const r of rooms) adj.set(r, new Set());

  for (const corr of corridors) {
    // Find which rooms this corridor touches
    const touching: Room[] = [];
    for (const room of rooms) {
      for (const seg of corr.segments) {
        if (rectsOverlap(room, seg, 20)) {
          touching.push(room);
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

  // Also connect rooms that directly overlap or are very close
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsOverlap(rooms[i], rooms[j], 50)) {
        adj.get(rooms[i])!.add(rooms[j]);
        adj.get(rooms[j])!.add(rooms[i]);
      }
    }
  }

  const dist = new Map<Room, number>();
  dist.set(start, 0);
  const queue: Room[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const neighbor of adj.get(cur) || []) {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }
  return dist;
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, margin = 0): boolean {
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x &&
         a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

function ensureConnectivity(rooms: Room[], corridors: Corridor[]): Corridor[] {
  if (rooms.length < 2) return [];

  // Build adjacency from corridors and overlapping rooms
  const adj = new Map<Room, Set<Room>>();
  for (const r of rooms) adj.set(r, new Set());

  for (const corr of corridors) {
    const touching: Room[] = [];
    for (const room of rooms) {
      for (const seg of corr.segments) {
        if (rectsOverlap(room, seg, 20)) {
          touching.push(room);
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

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsOverlap(rooms[i], rooms[j], 50)) {
        adj.get(rooms[i])!.add(rooms[j]);
        adj.get(rooms[j])!.add(rooms[i]);
      }
    }
  }

  // Find connected components via BFS
  const visited = new Set<Room>();
  const components: Room[][] = [];
  for (const room of rooms) {
    if (visited.has(room)) continue;
    const component: Room[] = [];
    const queue: Room[] = [room];
    visited.add(room);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const neighbor of adj.get(cur) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  if (components.length <= 1) return [];

  // Connect each disconnected component to component[0] via nearest room pair
  const extra: Corridor[] = [];
  for (let i = 1; i < components.length; i++) {
    let bestA: Room | null = null;
    let bestB: Room | null = null;
    let bestDist = Infinity;
    for (const a of components[0]) {
      for (const b of components[i]) {
        const d = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
        if (d < bestDist) {
          bestDist = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA && bestB) {
      const hw = Math.round(CORRIDOR_WIDTH / 2);
      const ax = bestA.centerX, ay = bestA.centerY;
      const bx = bestB.centerX, by = bestB.centerY;
      const segments: { x: number; y: number; w: number; h: number }[] = [];
      const minX = Math.min(ax, bx);
      const maxX = Math.max(ax, bx);
      segments.push({ x: minX - hw, y: ay - hw, w: maxX - minX + CORRIDOR_WIDTH, h: CORRIDOR_WIDTH });
      const minY = Math.min(ay, by);
      const maxY = Math.max(ay, by);
      segments.push({ x: bx - hw, y: minY - hw, w: CORRIDOR_WIDTH, h: maxY - minY + CORRIDOR_WIDTH });
      extra.push({ segments });
      // Merge into component 0 for subsequent iterations
      components[0].push(...components[i]);
    }
  }

  return extra;
}

/**
 * Greedy-mesh a boolean wall grid into rectangle wall segments.
 * @param wallGrid - Grid where 1 = wall, 0 = floor (opposite of BSP grid convention)
 * @param gridW - Grid width in cells
 * @param gridH - Grid height in cells
 * @param gridCell - Size of each cell in arena pixels
 * @returns Array of wall rectangles {x, y, w, h} in arena pixels
 */
export function greedyMeshWallGrid(
  wallGrid: Uint8Array,
  gridW: number,
  gridH: number,
  gridCell: number,
): { x: number; y: number; w: number; h: number }[] {
  const walls: { x: number; y: number; w: number; h: number }[] = [];
  const visited = new Uint8Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (wallGrid[idx] === 0 || visited[idx]) continue;

      // Expand horizontally
      let endX = gx;
      while (endX + 1 < gridW && wallGrid[gy * gridW + endX + 1] === 1 && !visited[gy * gridW + endX + 1]) {
        endX++;
      }

      // Expand vertically
      let endY = gy;
      outer:
      while (endY + 1 < gridH) {
        for (let x = gx; x <= endX; x++) {
          const ni = (endY + 1) * gridW + x;
          if (wallGrid[ni] === 0 || visited[ni]) break outer;
        }
        endY++;
      }

      // Mark visited
      for (let y = gy; y <= endY; y++) {
        for (let x = gx; x <= endX; x++) {
          visited[y * gridW + x] = 1;
        }
      }

      walls.push({
        x: gx * gridCell,
        y: gy * gridCell,
        w: (endX - gx + 1) * gridCell,
        h: (endY - gy + 1) * gridCell,
      });
    }
  }

  return walls;
}

export function generateProceduralDungeon(width: number, height: number): DungeonLayout {
  // BSP subdivision
  const root: BSPNode = {
    x: BORDER, y: BORDER,
    w: width - BORDER * 2, h: height - BORDER * 2,
    left: null, right: null, room: null,
  };
  splitBSP(root, 4);

  const leaves = getLeaves(root);
  const rooms = placeRooms(leaves);

  // Connect rooms via BSP hierarchy
  let corridors = connectNodes(root);

  // Fix disconnected components — add extra corridors where BSP skipped leaves
  const extraCorridors = ensureConnectivity(rooms, corridors);
  if (extraCorridors.length > 0) {
    corridors = [...corridors, ...extraCorridors];
  }

  // Build boolean grid
  const gridW = Math.ceil(width / GRID_CELL);
  const gridH = Math.ceil(height / GRID_CELL);
  const grid = new Uint8Array(gridW * gridH); // 0 = wall, 1 = floor

  // Mark rooms as floor
  for (const room of rooms) {
    const gx1 = Math.floor(room.x / GRID_CELL);
    const gy1 = Math.floor(room.y / GRID_CELL);
    const gx2 = Math.ceil((room.x + room.w) / GRID_CELL);
    const gy2 = Math.ceil((room.y + room.h) / GRID_CELL);
    for (let gy = gy1; gy < gy2 && gy < gridH; gy++) {
      for (let gx = gx1; gx < gx2 && gx < gridW; gx++) {
        if (gx >= 0 && gy >= 0) grid[gy * gridW + gx] = 1;
      }
    }
  }

  // Mark corridors as floor
  for (const corr of corridors) {
    for (const seg of corr.segments) {
      const gx1 = Math.floor(seg.x / GRID_CELL);
      const gy1 = Math.floor(seg.y / GRID_CELL);
      const gx2 = Math.ceil((seg.x + seg.w) / GRID_CELL);
      const gy2 = Math.ceil((seg.y + seg.h) / GRID_CELL);
      for (let gy = gy1; gy < gy2 && gy < gridH; gy++) {
        for (let gx = gx1; gx < gx2 && gx < gridW; gx++) {
          if (gx >= 0 && gy >= 0) grid[gy * gridW + gx] = 1;
        }
      }
    }
  }

  // Greedy-mesh wall cells into rectangles
  const walls: ArenaData['walls'] = [];
  const visited = new Uint8Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (grid[idx] === 1 || visited[idx]) continue;

      // Check this wall cell is adjacent to floor (only include walls near walkable areas)
      if (!isNearFloor(grid, gridW, gridH, gx, gy)) {
        visited[idx] = 1;
        continue;
      }

      // Expand horizontally
      let endX = gx;
      while (endX + 1 < gridW && grid[gy * gridW + endX + 1] === 0 && !visited[gy * gridW + endX + 1] && isNearFloor(grid, gridW, gridH, endX + 1, gy)) {
        endX++;
      }

      // Expand vertically
      let endY = gy;
      outer:
      while (endY + 1 < gridH) {
        for (let x = gx; x <= endX; x++) {
          const ni = (endY + 1) * gridW + x;
          if (grid[ni] === 1 || visited[ni] || !isNearFloor(grid, gridW, gridH, x, endY + 1)) break outer;
        }
        endY++;
      }

      // Mark visited
      for (let y = gy; y <= endY; y++) {
        for (let x = gx; x <= endX; x++) {
          visited[y * gridW + x] = 1;
        }
      }

      walls.push({
        x: gx * GRID_CELL,
        y: gy * GRID_CELL,
        w: (endX - gx + 1) * GRID_CELL,
        h: (endY - gy + 1) * GRID_CELL,
      });
    }
  }

  // Player spawns at one of the 4 corners
  const corners = [
    { x: 120, y: 120 },
    { x: width - 120, y: 120 },
    { x: 120, y: height - 120 },
    { x: width - 120, y: height - 120 },
  ];
  const corner = corners[Math.floor(Math.random() * corners.length)];

  // Find nearest room to this corner
  rooms.sort((a, b) => {
    const da = Math.hypot(a.centerX - corner.x, a.centerY - corner.y);
    const db = Math.hypot(b.centerX - corner.x, b.centerY - corner.y);
    return da - db;
  });
  const startRoom = rooms[0];
  startRoom.isStart = true;

  // Spawn position: edge of that room closest to the corner
  const spawnX = Math.max(startRoom.x + 30, Math.min(startRoom.x + startRoom.w - 30, corner.x));
  const spawnY = Math.max(startRoom.y + 30, Math.min(startRoom.y + startRoom.h - 30, corner.y));

  // Select exit room (greatest BFS distance from start)
  const distances = bfsDistance(rooms, corridors, startRoom);
  let exitRoom = rooms[rooms.length - 1]; // fallback: furthest geometrically
  let maxDist = 0;
  for (const [room, d] of distances) {
    if (d > maxDist && room !== startRoom) {
      maxDist = d;
      exitRoom = room;
    }
  }
  // If BFS didn't reach some rooms, use geometric distance for those
  if (maxDist === 0) {
    let maxGeoDist = 0;
    for (const room of rooms) {
      if (room === startRoom) continue;
      const d = Math.hypot(room.centerX - startRoom.centerX, room.centerY - startRoom.centerY);
      if (d > maxGeoDist) {
        maxGeoDist = d;
        exitRoom = room;
      }
    }
  }
  exitRoom.isExit = true;

  // Add interior pillars to large rooms
  for (const room of rooms) {
    if (room.w > PILLAR_THRESHOLD && room.h > PILLAR_THRESHOLD) {
      // Place 4 pillars in a grid pattern inside the room
      const px1 = room.x + Math.round(room.w * 0.25);
      const px2 = room.x + Math.round(room.w * 0.75) - PILLAR_SIZE;
      const py1 = room.y + Math.round(room.h * 0.25);
      const py2 = room.y + Math.round(room.h * 0.75) - PILLAR_SIZE;
      walls.push({ x: px1, y: py1, w: PILLAR_SIZE, h: PILLAR_SIZE });
      walls.push({ x: px2, y: py1, w: PILLAR_SIZE, h: PILLAR_SIZE });
      walls.push({ x: px1, y: py2, w: PILLAR_SIZE, h: PILLAR_SIZE });
      walls.push({ x: px2, y: py2, w: PILLAR_SIZE, h: PILLAR_SIZE });
    }
  }

  const arena: ArenaData = {
    width,
    height,
    walls,
    exitPosition: { x: exitRoom.centerX, y: exitRoom.centerY },
  };

  return {
    arena,
    rooms,
    startRoom,
    exitRoom,
    exitPosition: { x: exitRoom.centerX, y: exitRoom.centerY },
    spawnPosition: { x: spawnX, y: spawnY },
    grid,
    gridW,
    gridH,
  };
}

function isNearFloor(grid: Uint8Array, gridW: number, gridH: number, gx: number, gy: number): boolean {
  // Check 3x3 neighborhood for any floor cell
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
        if (grid[ny * gridW + nx] === 1) return true;
      }
    }
  }
  return false;
}
