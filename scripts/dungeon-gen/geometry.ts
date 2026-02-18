// Procedural geometry primitives for dungeon construction
// All geometry: centered XZ at origin, sitting on Y=0, CCW winding, indexed Uint16

import type { Document, Primitive, Mesh, Node, Material } from '@gltf-transform/core';
import { Accessor } from '@gltf-transform/core';
import { GRID_UNIT, WALL_HEIGHT } from './types.js';

type Buffer = ReturnType<Document['createBuffer']>;

// ---------------------------------------------------------------------------
// Helper: build a Primitive from raw arrays
// ---------------------------------------------------------------------------
function buildPrimitive(
  doc: Document,
  buffer: Buffer,
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array,
): Primitive {
  const posAcc = doc.createAccessor()
    .setType('VEC3')
    .setArray(positions)
    .setBuffer(buffer);

  const normAcc = doc.createAccessor()
    .setType('VEC3')
    .setArray(normals)
    .setBuffer(buffer);

  const uvAcc = doc.createAccessor()
    .setType('VEC2')
    .setArray(uvs)
    .setBuffer(buffer);

  const idxAcc = doc.createAccessor()
    .setType('SCALAR')
    .setArray(indices)
    .setBuffer(buffer);

  return doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setAttribute('TEXCOORD_0', uvAcc)
    .setIndices(idxAcc);
}

// ---------------------------------------------------------------------------
// Helper: push a quad (4 verts, 2 tris) into accumulator arrays
// Verts must be in CCW order when viewed from the front face.
// ---------------------------------------------------------------------------
function pushQuad(
  pos: number[], norm: number[], uv: number[], idx: number[],
  v0: number[], v1: number[], v2: number[], v3: number[],
  n: number[],
  uv0: number[], uv1: number[], uv2: number[], uv3: number[],
) {
  const base = pos.length / 3;
  pos.push(...v0, ...v1, ...v2, ...v3);
  norm.push(...n, ...n, ...n, ...n);
  uv.push(...uv0, ...uv1, ...uv2, ...uv3);
  // Two CCW triangles: 0-1-2, 0-2-3
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// ===========================================================================
// createFloorTile — horizontal plane at y=0 facing up (+Y normal)
// 4 verts, 2 tris
// ===========================================================================
export function createFloorTile(
  doc: Document,
  buffer: Buffer,
  w: number = GRID_UNIT,
  d: number = GRID_UNIT,
): Primitive {
  const hw = w / 2;
  const hd = d / 2;

  const positions = new Float32Array([
    -hw, 0, -hd,
     hw, 0, -hd,
     hw, 0,  hd,
    -hw, 0,  hd,
  ]);

  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);

  // UVs tiled proportional to world size (1 UV unit = 1 meter)
  const uvs = new Float32Array([
    0, 0,
    w, 0,
    w, d,
    0, d,
  ]);

  // CCW when viewed from above (+Y)
  const indices = new Uint16Array([
    0, 2, 1,
    0, 3, 2,
  ]);

  return buildPrimitive(doc, buffer, positions, normals, uvs, indices);
}

// ===========================================================================
// createWallSegment — vertical box with front, back, left, right, top faces.
// No bottom face. ~20 verts (5 faces * 4 verts)
// ===========================================================================
export function createWallSegment(
  doc: Document,
  buffer: Buffer,
  w: number = GRID_UNIT,
  h: number = WALL_HEIGHT,
): Primitive {
  const hw = w / 2;
  const thickness = 0.2; // thin wall
  const ht = thickness / 2;

  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  // Front face (+Z) — facing viewer
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, ht], [hw, 0, ht], [hw, h, ht], [-hw, h, ht],
    [0, 0, 1],
    [0, 0], [w, 0], [w, h], [0, h],
  );

  // Back face (-Z)
  pushQuad(pos, norm, uv, idx,
    [hw, 0, -ht], [-hw, 0, -ht], [-hw, h, -ht], [hw, h, -ht],
    [0, 0, -1],
    [0, 0], [w, 0], [w, h], [0, h],
  );

  // Left face (-X)
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, -ht], [-hw, 0, ht], [-hw, h, ht], [-hw, h, -ht],
    [-1, 0, 0],
    [0, 0], [thickness, 0], [thickness, h], [0, h],
  );

  // Right face (+X)
  pushQuad(pos, norm, uv, idx,
    [hw, 0, ht], [hw, 0, -ht], [hw, h, -ht], [hw, h, ht],
    [1, 0, 0],
    [0, 0], [thickness, 0], [thickness, h], [0, h],
  );

  // Top face (+Y)
  pushQuad(pos, norm, uv, idx,
    [-hw, h, ht], [hw, h, ht], [hw, h, -ht], [-hw, h, -ht],
    [0, 1, 0],
    [0, 0], [w, 0], [w, thickness], [0, thickness],
  );

  return buildPrimitive(
    doc, buffer,
    new Float32Array(pos),
    new Float32Array(norm),
    new Float32Array(uv),
    new Uint16Array(idx),
  );
}

// ===========================================================================
// createPillar — cylinder, bottom at y=0
// ~(segments*2 + 2) side verts + cap verts
// ===========================================================================
export function createPillar(
  doc: Document,
  buffer: Buffer,
  radius: number = 0.3,
  height: number = WALL_HEIGHT,
  segments: number = 8,
): Primitive {
  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const circumference = 2 * Math.PI * radius;

  // --- Side vertices ---
  // Each segment edge gets a bottom + top vertex. We need segments+1 edges
  // to close the seam (duplicated first edge for UV continuity).
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const u = (i / segments) * circumference; // UV tiled per meter

    // Bottom vertex (y=0)
    pos.push(radius * cos, 0, radius * sin);
    norm.push(cos, 0, sin);
    uv.push(u, 0);

    // Top vertex (y=height)
    pos.push(radius * cos, height, radius * sin);
    norm.push(cos, 0, sin);
    uv.push(u, height);
  }

  // Side indices
  for (let i = 0; i < segments; i++) {
    const a = i * 2;       // bottom-left
    const b = a + 1;       // top-left
    const c = a + 2;       // bottom-right
    const d = a + 3;       // top-right
    // CCW triangles
    idx.push(a, c, b);
    idx.push(b, c, d);
  }

  // --- Top cap ---
  const topCenter = pos.length / 3;
  pos.push(0, height, 0);
  norm.push(0, 1, 0);
  uv.push(0.5, 0.5);

  for (let i = 0; i < segments; i++) {
    const theta1 = (i / segments) * Math.PI * 2;
    const theta2 = ((i + 1) / segments) * Math.PI * 2;
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);
    const cos2 = Math.cos(theta2), sin2 = Math.sin(theta2);

    const vi = pos.length / 3;
    pos.push(radius * cos1, height, radius * sin1);
    norm.push(0, 1, 0);
    uv.push(0.5 + 0.5 * cos1, 0.5 + 0.5 * sin1);

    pos.push(radius * cos2, height, radius * sin2);
    norm.push(0, 1, 0);
    uv.push(0.5 + 0.5 * cos2, 0.5 + 0.5 * sin2);

    // CCW when viewed from above
    idx.push(topCenter, vi, vi + 1);
  }

  // --- Bottom cap ---
  const botCenter = pos.length / 3;
  pos.push(0, 0, 0);
  norm.push(0, -1, 0);
  uv.push(0.5, 0.5);

  for (let i = 0; i < segments; i++) {
    const theta1 = (i / segments) * Math.PI * 2;
    const theta2 = ((i + 1) / segments) * Math.PI * 2;
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);
    const cos2 = Math.cos(theta2), sin2 = Math.sin(theta2);

    const vi = pos.length / 3;
    // Reversed winding for bottom face (viewed from below)
    pos.push(radius * cos2, 0, radius * sin2);
    norm.push(0, -1, 0);
    uv.push(0.5 + 0.5 * cos2, 0.5 + 0.5 * sin2);

    pos.push(radius * cos1, 0, radius * sin1);
    norm.push(0, -1, 0);
    uv.push(0.5 + 0.5 * cos1, 0.5 + 0.5 * sin1);

    idx.push(botCenter, vi, vi + 1);
  }

  return buildPrimitive(
    doc, buffer,
    new Float32Array(pos),
    new Float32Array(norm),
    new Float32Array(uv),
    new Uint16Array(idx),
  );
}

// ===========================================================================
// createBox — full 6-face box, bottom-center origin (y from 0 to h)
// 24 verts, 36 indices (12 tris)
// ===========================================================================
export function createBox(
  doc: Document,
  buffer: Buffer,
  w: number = GRID_UNIT,
  h: number = WALL_HEIGHT,
  d: number = GRID_UNIT,
): Primitive {
  const hw = w / 2;
  const hd = d / 2;

  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  // Front face (+Z)
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd],
    [0, 0, 1],
    [0, 0], [w, 0], [w, h], [0, h],
  );

  // Back face (-Z)
  pushQuad(pos, norm, uv, idx,
    [hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd],
    [0, 0, -1],
    [0, 0], [w, 0], [w, h], [0, h],
  );

  // Right face (+X)
  pushQuad(pos, norm, uv, idx,
    [hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd],
    [1, 0, 0],
    [0, 0], [d, 0], [d, h], [0, h],
  );

  // Left face (-X)
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd],
    [-1, 0, 0],
    [0, 0], [d, 0], [d, h], [0, h],
  );

  // Top face (+Y)
  pushQuad(pos, norm, uv, idx,
    [-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd],
    [0, 1, 0],
    [0, 0], [w, 0], [w, d], [0, d],
  );

  // Bottom face (-Y)
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [0, -1, 0],
    [0, 0], [w, 0], [w, d], [0, d],
  );

  return buildPrimitive(
    doc, buffer,
    new Float32Array(pos),
    new Float32Array(norm),
    new Float32Array(uv),
    new Uint16Array(idx),
  );
}

// ===========================================================================
// createStairs — stepped blocks from y=0 to WALL_HEIGHT
// Each step is a box-like shape. Low vert count via shared faces.
// ===========================================================================
export function createStairs(
  doc: Document,
  buffer: Buffer,
  w: number = GRID_UNIT,
  d: number = GRID_UNIT,
  steps: number = 4,
): Primitive {
  const hw = w / 2;
  const stepH = WALL_HEIGHT / steps;
  const stepD = d / steps;

  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i < steps; i++) {
    const y0 = i * stepH;
    const y1 = (i + 1) * stepH;
    const z0 = -d / 2 + i * stepD;
    const z1 = -d / 2 + (i + 1) * stepD;

    // Top face of this step
    pushQuad(pos, norm, uv, idx,
      [-hw, y1, z0], [hw, y1, z0], [hw, y1, z1], [-hw, y1, z1],
      [0, 1, 0],
      [0, 0], [w, 0], [w, stepD], [0, stepD],
    );

    // Front face (the riser) of this step
    pushQuad(pos, norm, uv, idx,
      [-hw, y0, z0], [hw, y0, z0], [hw, y1, z0], [-hw, y1, z0],
      [0, 0, -1],
      [0, 0], [w, 0], [w, stepH], [0, stepH],
    );

    // Left side face of this step
    pushQuad(pos, norm, uv, idx,
      [-hw, 0, z0], [-hw, 0, z1], [-hw, y1, z1], [-hw, y1, z0],
      [-1, 0, 0],
      [0, 0], [stepD, 0], [stepD, y1], [0, y1],
    );

    // Right side face of this step
    pushQuad(pos, norm, uv, idx,
      [hw, 0, z1], [hw, 0, z0], [hw, y1, z0], [hw, y1, z1],
      [1, 0, 0],
      [0, 0], [stepD, 0], [stepD, y1], [0, y1],
    );
  }

  // Back wall — the full-height face at the far end
  const zBack = -d / 2 + d; // = d/2
  pushQuad(pos, norm, uv, idx,
    [hw, 0, zBack], [-hw, 0, zBack], [-hw, WALL_HEIGHT, zBack], [hw, WALL_HEIGHT, zBack],
    [0, 0, 1],
    [0, 0], [w, 0], [w, WALL_HEIGHT], [0, WALL_HEIGHT],
  );

  // Bottom face
  pushQuad(pos, norm, uv, idx,
    [-hw, 0, -d / 2], [hw, 0, -d / 2], [hw, 0, d / 2], [-hw, 0, d / 2],
    [0, -1, 0],
    [0, 0], [w, 0], [w, d], [0, d],
  );

  return buildPrimitive(
    doc, buffer,
    new Float32Array(pos),
    new Float32Array(norm),
    new Float32Array(uv),
    new Uint16Array(idx),
  );
}

// ===========================================================================
// Utility: wrap a Primitive into a Mesh with a material
// ===========================================================================
export function createMeshFromPrimitive(
  doc: Document,
  name: string,
  prim: Primitive,
  material: Material,
): Mesh {
  prim.setMaterial(material);
  return doc.createMesh(name).addPrimitive(prim);
}

// ===========================================================================
// Utility: create a Node with a Mesh attached
// ===========================================================================
export function createNodeWithMesh(
  doc: Document,
  name: string,
  mesh: Mesh,
): Node {
  return doc.createNode(name).setMesh(mesh);
}
