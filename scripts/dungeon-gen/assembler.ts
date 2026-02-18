// Scene assembler: converts a DungeonLayout into a glTF binary (.glb)
// Uses @gltf-transform/core to build the scene graph, geometry, and materials.

import { Document, NodeIO } from '@gltf-transform/core';
import { generateLayout } from './layout.js';
import { createZoneMaterials, type ZoneMaterials } from './materials.js';
import {
  createFloorTile,
  createWallSegment,
  createPillar,
  createBox,
  createMeshFromPrimitive,
} from './geometry.js';
import {
  GRID_UNIT,
  WALL_HEIGHT,
  createRNG,
  type DungeonConfig,
  type DungeonLayout,
  type DungeonManifest,
  type RoomDef,
  type RoomType,
} from './types.js';

type Buffer = ReturnType<Document['createBuffer']>;
type Node = ReturnType<Document['createNode']>;
type Scene = ReturnType<Document['createScene']>;
type Primitive = ReturnType<Document['createPrimitive']>;
type Material = ReturnType<Document['createMaterial']>;

// ---------------------------------------------------------------------------
// Shared accessor cache — create geometry data once, reuse across primitives
// ---------------------------------------------------------------------------

interface SharedGeometry {
  floorTile: Primitive;
  wallSegmentPosZ: Primitive;  // facing +Z
  wallSegmentNegZ: Primitive;  // facing -Z (rotated 180)
  wallSegmentPosX: Primitive;  // facing +X (rotated 90)
  wallSegmentNegX: Primitive;  // facing -X (rotated -90)
}

/**
 * Clone a primitive's accessor references into a new Primitive.
 * The new primitive shares the same accessor data but can have its own material.
 */
function clonePrimitive(doc: Document, source: Primitive): Primitive {
  const prim = doc.createPrimitive();
  const pos = source.getAttribute('POSITION');
  const norm = source.getAttribute('NORMAL');
  const uv = source.getAttribute('TEXCOORD_0');
  const idx = source.getIndices();
  if (pos) prim.setAttribute('POSITION', pos);
  if (norm) prim.setAttribute('NORMAL', norm);
  if (uv) prim.setAttribute('TEXCOORD_0', uv);
  if (idx) prim.setIndices(idx);
  return prim;
}

/**
 * Create a positioned node with a mesh built from a cloned primitive + material.
 */
function placeTile(
  doc: Document,
  name: string,
  sourcePrim: Primitive,
  material: Material,
  x: number,
  y: number,
  z: number,
): Node {
  const prim = clonePrimitive(doc, sourcePrim);
  prim.setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  return doc.createNode(name).setMesh(mesh).setTranslation([x, y, z]);
}

// ---------------------------------------------------------------------------
// Wall placement helpers
// ---------------------------------------------------------------------------

/** Directions: [dx, dy, normalFacing, rotationAxis] */
const WALL_DIRS = [
  { dx: 0, dy: -1, face: 'negZ' as const },  // cell above is wall -> wall on north edge
  { dx: 0, dy: 1, face: 'posZ' as const },    // cell below is wall -> wall on south edge
  { dx: -1, dy: 0, face: 'negX' as const },   // cell left is wall -> wall on west edge
  { dx: 1, dy: 0, face: 'posX' as const },    // cell right is wall -> wall on east edge
];

function isWall(grid: Uint8Array, gw: number, gh: number, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true; // out-of-bounds = wall
  return grid[gy * gw + gx] === 0;
}

/**
 * Get wall offset for each facing direction.
 * Walls sit on the edge of the cell, facing inward.
 */
function wallOffset(face: string): [number, number, number] {
  const half = GRID_UNIT / 2;
  switch (face) {
    case 'negZ': return [0, 0, -half]; // north edge
    case 'posZ': return [0, 0, half];  // south edge
    case 'negX': return [-half, 0, 0]; // west edge
    case 'posX': return [half, 0, 0];  // east edge
    default: return [0, 0, 0];
  }
}

/**
 * Get rotation quaternion for wall facing.
 * Default wall faces +Z. Rotate for other directions.
 */
function wallRotation(face: string): [number, number, number, number] {
  // Quaternion [x, y, z, w]
  const s = Math.SQRT1_2; // sin(45) = cos(45)
  switch (face) {
    case 'posZ': return [0, 0, 0, 1];           // default, facing +Z
    case 'negZ': return [0, 1, 0, 0];           // 180 around Y
    case 'posX': return [0, s, 0, s];           // 90 around Y
    case 'negX': return [0, -s, 0, s];          // -90 around Y
    default: return [0, 0, 0, 1];
  }
}

// ---------------------------------------------------------------------------
// Prop placement per room type
// ---------------------------------------------------------------------------

interface PropCounts {
  lights: number;
  props: number;
}

function placeRoomProps(
  doc: Document,
  buffer: Buffer,
  roomNode: Node,
  room: RoomDef,
  materials: ZoneMaterials,
  rng: () => number,
): PropCounts {
  const [gx, gy] = room.position;
  const [gw, gh] = room.gridSize;
  const counts: PropCounts = { lights: 0, props: 0 };

  // Room center in world coords
  const cx = (gx + gw / 2) * GRID_UNIT;
  const cz = (gy + gh / 2) * GRID_UNIT;

  // Room extents in world coords
  const minX = gx * GRID_UNIT;
  const minZ = gy * GRID_UNIT;
  const maxX = (gx + gw) * GRID_UNIT;
  const maxZ = (gy + gh) * GRID_UNIT;

  const area = gw * gh;

  switch (room.type) {
    case 'entrance': {
      // 2 torch brackets near the edges
      const torchSize = 0.15;
      const torchHeight = 1.5;
      const positions: [number, number, number][] = [
        [minX + GRID_UNIT * 0.5, 0, minZ + GRID_UNIT * 0.5],
        [maxX - GRID_UNIT * 0.5, 0, minZ + GRID_UNIT * 0.5],
      ];
      for (let i = 0; i < positions.length; i++) {
        const [tx, ty, tz] = positions[i];
        const bracketPrim = createBox(doc, buffer, torchSize, torchHeight, torchSize);
        bracketPrim.setMaterial(materials.torchBracket);
        const bracketMesh = doc.createMesh(`torch_bracket_${i}`).addPrimitive(bracketPrim);
        const bracketNode = doc.createNode(`torch_bracket_${i}`).setMesh(bracketMesh).setTranslation([tx, ty, tz]);
        roomNode.addChild(bracketNode);
        counts.lights++;
        counts.props++;
      }
      break;
    }

    case 'arena': {
      // 4 pillars if room area >= 20 grid cells
      if (area >= 20) {
        const inset = GRID_UNIT * 1.5;
        const pillarPositions: [number, number, number][] = [
          [minX + inset, 0, minZ + inset],
          [maxX - inset, 0, minZ + inset],
          [minX + inset, 0, maxZ - inset],
          [maxX - inset, 0, maxZ - inset],
        ];
        for (let i = 0; i < pillarPositions.length; i++) {
          const [px, py, pz] = pillarPositions[i];
          const pillarPrim = createPillar(doc, buffer, 0.35, WALL_HEIGHT);
          pillarPrim.setMaterial(materials.pillar);
          const pillarMesh = doc.createMesh(`arena_pillar_${i}`).addPrimitive(pillarPrim);
          const pillarNode = doc.createNode(`arena_pillar_${i}`).setMesh(pillarMesh).setTranslation([px, py, pz]);
          roomNode.addChild(pillarNode);
          counts.props++;
        }
      }

      // Rubble boxes scattered (2-4)
      const rubbleCount = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < rubbleCount; i++) {
        const rx = minX + GRID_UNIT + rng() * (maxX - minX - 2 * GRID_UNIT);
        const rz = minZ + GRID_UNIT + rng() * (maxZ - minZ - 2 * GRID_UNIT);
        const size = 0.2 + rng() * 0.4;
        const rubblePrim = createBox(doc, buffer, size, size * 0.6, size);
        rubblePrim.setMaterial(materials.propSecondary);
        const rubbleMesh = doc.createMesh(`rubble_${i}`).addPrimitive(rubblePrim);
        const rubbleNode = doc.createNode(`rubble_${i}`).setMesh(rubbleMesh).setTranslation([rx, 0, rz]);
        roomNode.addChild(rubbleNode);
        counts.props++;
      }
      break;
    }

    case 'boss': {
      // Central pillar/altar (large box)
      const altarPrim = createBox(doc, buffer, 1.5, 1.0, 1.5);
      altarPrim.setMaterial(materials.propPrimary);
      const altarMesh = doc.createMesh('boss_altar').addPrimitive(altarPrim);
      const altarNode = doc.createNode('boss_altar').setMesh(altarMesh).setTranslation([cx, 0, cz]);
      roomNode.addChild(altarNode);
      counts.props++;

      // Corner pillars
      const inset = GRID_UNIT;
      const cornerPositions: [number, number, number][] = [
        [minX + inset, 0, minZ + inset],
        [maxX - inset, 0, minZ + inset],
        [minX + inset, 0, maxZ - inset],
        [maxX - inset, 0, maxZ - inset],
      ];
      for (let i = 0; i < cornerPositions.length; i++) {
        const [px, py, pz] = cornerPositions[i];
        const pillarPrim = createPillar(doc, buffer, 0.4, WALL_HEIGHT);
        pillarPrim.setMaterial(materials.pillar);
        const pillarMesh = doc.createMesh(`boss_pillar_${i}`).addPrimitive(pillarPrim);
        const pillarNode = doc.createNode(`boss_pillar_${i}`).setMesh(pillarMesh).setTranslation([px, py, pz]);
        roomNode.addChild(pillarNode);
        counts.props++;
      }

      // Extra torch brackets (4 along walls)
      const torchPositions: [number, number, number][] = [
        [minX + GRID_UNIT * 0.5, 0, cz],
        [maxX - GRID_UNIT * 0.5, 0, cz],
        [cx, 0, minZ + GRID_UNIT * 0.5],
        [cx, 0, maxZ - GRID_UNIT * 0.5],
      ];
      for (let i = 0; i < torchPositions.length; i++) {
        const [tx, ty, tz] = torchPositions[i];
        const bracketPrim = createBox(doc, buffer, 0.15, 1.5, 0.15);
        bracketPrim.setMaterial(materials.torchBracket);
        const bracketMesh = doc.createMesh(`boss_torch_${i}`).addPrimitive(bracketPrim);
        const bracketNode = doc.createNode(`boss_torch_${i}`).setMesh(bracketMesh).setTranslation([tx, ty, tz]);
        roomNode.addChild(bracketNode);
        counts.lights++;
        counts.props++;
      }
      break;
    }

    case 'treasure': {
      // 2-4 crates (boxes of varying sizes)
      const crateCount = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < crateCount; i++) {
        const cw = 0.4 + rng() * 0.6;
        const ch = 0.3 + rng() * 0.5;
        const cd = 0.4 + rng() * 0.6;
        const crateX = minX + GRID_UNIT * 0.5 + rng() * (maxX - minX - GRID_UNIT);
        const crateZ = minZ + GRID_UNIT * 0.5 + rng() * (maxZ - minZ - GRID_UNIT);
        const cratePrim = createBox(doc, buffer, cw, ch, cd);
        cratePrim.setMaterial(materials.propPrimary);
        const crateMesh = doc.createMesh(`crate_${i}`).addPrimitive(cratePrim);
        const crateNode = doc.createNode(`crate_${i}`).setMesh(crateMesh).setTranslation([crateX, 0, crateZ]);
        roomNode.addChild(crateNode);
        counts.props++;
      }
      break;
    }

    case 'shrine': {
      // Altar box
      const shrineAltarPrim = createBox(doc, buffer, 1.0, 0.8, 0.6);
      shrineAltarPrim.setMaterial(materials.propEmissive);
      const shrineAltarMesh = doc.createMesh('shrine_altar').addPrimitive(shrineAltarPrim);
      const shrineAltarNode = doc.createNode('shrine_altar').setMesh(shrineAltarMesh).setTranslation([cx, 0, cz]);
      roomNode.addChild(shrineAltarNode);
      counts.props++;

      // 2 flanking pillars
      const flankOffset = GRID_UNIT * 1.2;
      const flankPositions: [number, number, number][] = [
        [cx - flankOffset, 0, cz],
        [cx + flankOffset, 0, cz],
      ];
      for (let i = 0; i < flankPositions.length; i++) {
        const [px, py, pz] = flankPositions[i];
        const pillarPrim = createPillar(doc, buffer, 0.25, WALL_HEIGHT * 0.8);
        pillarPrim.setMaterial(materials.pillar);
        const pillarMesh = doc.createMesh(`shrine_pillar_${i}`).addPrimitive(pillarPrim);
        const pillarNode = doc.createNode(`shrine_pillar_${i}`).setMesh(pillarMesh).setTranslation([px, py, pz]);
        roomNode.addChild(pillarNode);
        counts.props++;
      }
      break;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

export async function generateDungeon(
  config: DungeonConfig,
): Promise<{ glb: Uint8Array; manifest: DungeonManifest }> {
  // 1. Generate layout
  const layout = generateLayout(config);

  // 2. Create glTF document and buffer
  const doc = new Document();
  const buffer = doc.createBuffer('main');

  // 3. Create zone materials
  const materials = createZoneMaterials(doc, config.zone);

  // 4. Create shared geometry templates (one set of accessor data each)
  const floorTemplate = createFloorTile(doc, buffer);
  const wallTemplate = createWallSegment(doc, buffer);

  // 5. Create root scene
  const scene = doc.createScene('Dungeon');

  // RNG for prop placement
  const rng = createRNG(config.seed + 9999);

  let totalLights = 0;
  let totalProps = 0;

  // 6. Process each room
  for (const room of layout.rooms) {
    const roomNode = doc.createNode(`Room_${room.id}`);
    const [rx, ry] = room.position;
    const [rw, rh] = room.gridSize;

    // Floor tiles for each grid cell in the room
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const gx = rx + dx;
        const gy = ry + dy;
        // World position: cell center
        const wx = gx * GRID_UNIT + GRID_UNIT / 2;
        const wz = gy * GRID_UNIT + GRID_UNIT / 2;

        const floorNode = placeTile(
          doc, `floor_${room.id}_${dx}_${dy}`,
          floorTemplate, materials.floor,
          wx, 0, wz,
        );
        roomNode.addChild(floorNode);
      }
    }

    // Walls at room boundary cells adjacent to wall cells
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const gx = rx + dx;
        const gy = ry + dy;
        const wx = gx * GRID_UNIT + GRID_UNIT / 2;
        const wz = gy * GRID_UNIT + GRID_UNIT / 2;

        for (const dir of WALL_DIRS) {
          const nx = gx + dir.dx;
          const ny = gy + dir.dy;
          if (isWall(layout.grid, layout.gridWidth, layout.gridHeight, nx, ny)) {
            const [ox, oy, oz] = wallOffset(dir.face);
            const rot = wallRotation(dir.face);

            const wallPrim = clonePrimitive(doc, wallTemplate);
            wallPrim.setMaterial(materials.wall);
            const wallMesh = doc.createMesh(`wall_${room.id}_${dx}_${dy}_${dir.face}`).addPrimitive(wallPrim);
            const wallNode = doc.createNode(`wall_${room.id}_${dx}_${dy}_${dir.face}`)
              .setMesh(wallMesh)
              .setTranslation([wx + ox, oy, wz + oz])
              .setRotation(rot);
            roomNode.addChild(wallNode);
          }
        }
      }
    }

    // Props based on room type
    const propCounts = placeRoomProps(doc, buffer, roomNode, room, materials, rng);
    totalLights += propCounts.lights;
    totalProps += propCounts.props;

    scene.addChild(roomNode);
  }

  // 7. Process each corridor
  for (const corridor of layout.corridors) {
    const corrNode = doc.createNode(`Corridor_${corridor.id}`);

    for (const [sx, sy, sw, sh] of corridor.segments) {
      for (let dy = 0; dy < sh; dy++) {
        for (let dx = 0; dx < sw; dx++) {
          const gx = sx + dx;
          const gy = sy + dy;

          // Skip if out of bounds or not a floor cell
          if (gx < 0 || gy < 0 || gx >= layout.gridWidth || gy >= layout.gridHeight) continue;
          if (layout.grid[gy * layout.gridWidth + gx] !== 1) continue;

          const wx = gx * GRID_UNIT + GRID_UNIT / 2;
          const wz = gy * GRID_UNIT + GRID_UNIT / 2;

          // Floor tile
          const floorNode = placeTile(
            doc, `floor_${corridor.id}_${dx}_${dy}`,
            floorTemplate, materials.floor,
            wx, 0, wz,
          );
          corrNode.addChild(floorNode);

          // Walls at corridor edges adjacent to wall cells
          for (const dir of WALL_DIRS) {
            const nx = gx + dir.dx;
            const ny = gy + dir.dy;
            if (isWall(layout.grid, layout.gridWidth, layout.gridHeight, nx, ny)) {
              const [ox, oy, oz] = wallOffset(dir.face);
              const rot = wallRotation(dir.face);

              const wallPrim = clonePrimitive(doc, wallTemplate);
              wallPrim.setMaterial(materials.wall);
              const wallMesh = doc.createMesh(`wall_${corridor.id}_${dx}_${dy}_${dir.face}`).addPrimitive(wallPrim);
              const wallNode = doc.createNode(`wall_${corridor.id}_${dx}_${dy}_${dir.face}`)
                .setMesh(wallMesh)
                .setTranslation([wx + ox, oy, wz + oz])
                .setRotation(rot);
              corrNode.addChild(wallNode);
            }
          }
        }
      }
    }

    scene.addChild(corrNode);
  }

  // 8. Build manifest
  const manifest: DungeonManifest = {
    seed: config.seed,
    zone: config.zone,
    size: config.size,
    difficulty: config.difficulty,
    rooms: layout.rooms.map((r) => ({
      id: r.id,
      type: r.type,
      position: r.position,
      size: r.gridSize,
    })),
    connections: layout.corridors.map((c) => [c.from, c.to] as [string, string]),
    spawn_points: {
      player: [
        layout.spawnPoint[0] * GRID_UNIT + GRID_UNIT / 2,
        0,
        layout.spawnPoint[1] * GRID_UNIT + GRID_UNIT / 2,
      ],
      boss: layout.bossPoint
        ? [
            layout.bossPoint[0] * GRID_UNIT + GRID_UNIT / 2,
            0,
            layout.bossPoint[1] * GRID_UNIT + GRID_UNIT / 2,
          ]
        : null,
    },
    light_count: totalLights,
    prop_count: totalProps,
  };

  // 9. Export to GLB
  const io = new NodeIO();
  const glb = await io.writeBinary(doc);

  return { glb, manifest };
}
