import * as THREE from 'three';
import type { ArenaData } from '../stores/realtimeStore.svelte';
import { createWallMaterial, createFloorMaterial, getZoneTheme } from './materials';

// Arena pixel → Three.js unit mapping: 1 arena px = 0.1 Three.js units
// Arena Y -> Three.js Z (Y-up in Three.js)
const ARENA_SCALE = 0.1;
const WALL_HEIGHT = 3;

// Dynamic arena center — updated by buildDungeon() to support any arena size
let arenaCenterX = 400;
let arenaCenterY = 300;

export interface DungeonGeometry {
  floor: THREE.Mesh;
  walls: THREE.Mesh[];
  group: THREE.Group;
}

export function arenaToWorld(arenaX: number, arenaY: number): { x: number; z: number } {
  return {
    x: (arenaX - arenaCenterX) * ARENA_SCALE,
    z: (arenaY - arenaCenterY) * ARENA_SCALE,
  };
}

export function worldToArena(worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: worldX / ARENA_SCALE + arenaCenterX,
    y: worldZ / ARENA_SCALE + arenaCenterY,
  };
}

export function buildDungeon(arena: ArenaData, zone: string): DungeonGeometry {
  // Update centering for this arena size
  arenaCenterX = arena.width / 2;
  arenaCenterY = arena.height / 2;

  const group = new THREE.Group();

  const arenaW = arena.width * ARENA_SCALE;
  const arenaH = arena.height * ARENA_SCALE;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(arenaW, arenaH);
  const floorMat = createFloorMaterial(zone);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2; // Lay flat
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  // Floor grid detail — subtle dark lines for worn stone tile look
  const theme = getZoneTheme(zone);
  const gridMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0f,
    roughness: 0.95,
    metalness: 0.0,
    emissive: 0x000000,
  });
  const TILE_SPACING = 5;  // units between grid lines
  const LINE_THICKNESS = 0.02;
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;

  // Lines along X-axis (running east-west)
  for (let z = -halfH + TILE_SPACING; z < halfH; z += TILE_SPACING) {
    const lineGeo = new THREE.BoxGeometry(arenaW, LINE_THICKNESS, LINE_THICKNESS);
    const lineMesh = new THREE.Mesh(lineGeo, gridMat);
    lineMesh.position.set(0, 0.005, z);
    lineMesh.receiveShadow = true;
    group.add(lineMesh);
  }
  // Lines along Z-axis (running north-south)
  for (let x = -halfW + TILE_SPACING; x < halfW; x += TILE_SPACING) {
    const lineGeo = new THREE.BoxGeometry(LINE_THICKNESS, LINE_THICKNESS, arenaH);
    const lineMesh = new THREE.Mesh(lineGeo, gridMat);
    lineMesh.position.set(x, 0.005, 0);
    lineMesh.receiveShadow = true;
    group.add(lineMesh);
  }

  // No ceiling — top-down camera needs to see into the dungeon

  // Wall base trim material — slightly darker than walls for grounding
  const trimColor = Math.max((theme.wallColor & 0xff0000) - 0x0a0000, 0)
    | Math.max((theme.wallColor & 0x00ff00) - 0x000a00, 0)
    | Math.max((theme.wallColor & 0x0000ff) - 0x00000a, 0);
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.9,
    metalness: 0.08,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.15,
  });
  const TRIM_HEIGHT = 0.05;
  const TRIM_OVERHANG = 0.06; // how much wider than wall on each side

  // Walls from arena data
  const wallMat = createWallMaterial(zone);
  const walls: THREE.Mesh[] = [];

  for (const wall of arena.walls) {
    const w = wall.w * ARENA_SCALE;
    const h = wall.h * ARENA_SCALE;
    const wallGeo = new THREE.BoxGeometry(w, WALL_HEIGHT, h);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    const pos = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    wallMesh.position.set(pos.x, WALL_HEIGHT / 2, pos.z);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    walls.push(wallMesh);
    group.add(wallMesh);

    // Wall base trim
    const trimGeo = new THREE.BoxGeometry(w + TRIM_OVERHANG * 2, TRIM_HEIGHT, h + TRIM_OVERHANG * 2);
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.set(pos.x, TRIM_HEIGHT / 2, pos.z);
    trimMesh.receiveShadow = true;
    group.add(trimMesh);
  }

  // Boundary walls (arena edges)
  const thickness = 0.5;
  const boundaryMat = wallMat.clone();

  // North wall
  const northGeo = new THREE.BoxGeometry(arenaW + thickness * 2, WALL_HEIGHT, thickness);
  const northWall = new THREE.Mesh(northGeo, boundaryMat);
  northWall.position.set(0, WALL_HEIGHT / 2, -halfH - thickness / 2);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  group.add(northWall);
  walls.push(northWall);

  // South wall
  const southWall = new THREE.Mesh(northGeo, boundaryMat);
  southWall.position.set(0, WALL_HEIGHT / 2, halfH + thickness / 2);
  southWall.castShadow = true;
  southWall.receiveShadow = true;
  group.add(southWall);
  walls.push(southWall);

  // East wall
  const eastGeo = new THREE.BoxGeometry(thickness, WALL_HEIGHT, arenaH + thickness * 2);
  const eastWall = new THREE.Mesh(eastGeo, boundaryMat);
  eastWall.position.set(halfW + thickness / 2, WALL_HEIGHT / 2, 0);
  eastWall.castShadow = true;
  eastWall.receiveShadow = true;
  group.add(eastWall);
  walls.push(eastWall);

  // West wall
  const westWall = new THREE.Mesh(eastGeo, boundaryMat);
  westWall.position.set(-halfW - thickness / 2, WALL_HEIGHT / 2, 0);
  westWall.castShadow = true;
  westWall.receiveShadow = true;
  group.add(westWall);
  walls.push(westWall);

  // Boundary wall base trim
  const northTrimGeo = new THREE.BoxGeometry(arenaW + thickness * 2 + TRIM_OVERHANG * 2, TRIM_HEIGHT, thickness + TRIM_OVERHANG * 2);
  const northTrim = new THREE.Mesh(northTrimGeo, trimMat);
  northTrim.position.set(0, TRIM_HEIGHT / 2, -halfH - thickness / 2);
  group.add(northTrim);

  const southTrim = new THREE.Mesh(northTrimGeo, trimMat);
  southTrim.position.set(0, TRIM_HEIGHT / 2, halfH + thickness / 2);
  group.add(southTrim);

  const eastTrimGeo = new THREE.BoxGeometry(thickness + TRIM_OVERHANG * 2, TRIM_HEIGHT, arenaH + thickness * 2 + TRIM_OVERHANG * 2);
  const eastTrim = new THREE.Mesh(eastTrimGeo, trimMat);
  eastTrim.position.set(halfW + thickness / 2, TRIM_HEIGHT / 2, 0);
  group.add(eastTrim);

  const westTrim = new THREE.Mesh(eastTrimGeo, trimMat);
  westTrim.position.set(-halfW - thickness / 2, TRIM_HEIGHT / 2, 0);
  group.add(westTrim);

  // Corner pillar decorations at boundary wall intersections
  const pillarMat = new THREE.MeshStandardMaterial({
    color: theme.wallColor,
    roughness: 0.8,
    metalness: 0.1,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.2,
  });
  const pillarRadius = 0.3;
  const pillarHeight = WALL_HEIGHT + 0.2;
  const pillarGeo = new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 8);
  const corners = [
    { x: -halfW - thickness / 2, z: -halfH - thickness / 2 },
    { x:  halfW + thickness / 2, z: -halfH - thickness / 2 },
    { x: -halfW - thickness / 2, z:  halfH + thickness / 2 },
    { x:  halfW + thickness / 2, z:  halfH + thickness / 2 },
  ];
  for (const corner of corners) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(corner.x, pillarHeight / 2, corner.z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
  }

  // --- Decorative Props ---

  // 1. Wall-mounted torches along boundaries
  const torchSpacing = 12;
  const torchBracketGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15);
  const torchBracketMat = new THREE.MeshStandardMaterial({
    color: 0x4a3a2a, roughness: 0.5, metalness: 0.6,
  });
  const torchFlameGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const torchFlameMat = new THREE.MeshStandardMaterial({
    color: 0xff8833, emissive: 0xff6b20, emissiveIntensity: 2.0,
    transparent: true, opacity: 0.9,
  });

  // North and south walls — every torch gets bracket+flame mesh, every 3rd gets a PointLight
  let torchIndex = 0;
  for (let x = -halfW + torchSpacing; x < halfW; x += torchSpacing) {
    // North wall (inner face = +Z side)
    const nBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    nBracket.position.set(x, 2.0, -halfH + 0.3);
    group.add(nBracket);
    const nFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    nFlame.position.set(x, 2.3, -halfH + 0.3);
    group.add(nFlame);

    // South wall (inner face = -Z side)
    const sBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    sBracket.position.set(x, 2.0, halfH - 0.3);
    group.add(sBracket);
    const sFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    sFlame.position.set(x, 2.3, halfH - 0.3);
    group.add(sFlame);

    // Only every 3rd torch gets a real PointLight (performance)
    if (torchIndex % 3 === 0) {
      const nLight = new THREE.PointLight(0xff8833, 2.5, 14, 1.5);
      nLight.position.set(x, 2.4, -halfH + 0.5);
      group.add(nLight);
      const sLight = new THREE.PointLight(0xff8833, 2.5, 14, 1.5);
      sLight.position.set(x, 2.4, halfH - 0.5);
      group.add(sLight);
    }
    torchIndex++;
  }
  // East and west walls
  torchIndex = 0;
  for (let z = -halfH + torchSpacing; z < halfH; z += torchSpacing) {
    // West wall
    const wBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    wBracket.position.set(-halfW + 0.3, 2.0, z);
    group.add(wBracket);
    const wFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    wFlame.position.set(-halfW + 0.3, 2.3, z);
    group.add(wFlame);

    // East wall
    const eBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    eBracket.position.set(halfW - 0.3, 2.0, z);
    group.add(eBracket);
    const eFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    eFlame.position.set(halfW - 0.3, 2.3, z);
    group.add(eFlame);

    if (torchIndex % 3 === 0) {
      const wLight = new THREE.PointLight(0xff8833, 2.5, 14, 1.5);
      wLight.position.set(-halfW + 0.5, 2.4, z);
      group.add(wLight);
      const eLight = new THREE.PointLight(0xff8833, 2.5, 14, 1.5);
      eLight.position.set(halfW - 0.5, 2.4, z);
      group.add(eLight);
    }
    torchIndex++;
  }

  // 2. Decorative pillars at corners of larger interior walls
  const decorPillarGeo = new THREE.CylinderGeometry(0.2, 0.25, WALL_HEIGHT + 0.1, 6);
  for (const wall of arena.walls) {
    const w = wall.w * ARENA_SCALE;
    const h = wall.h * ARENA_SCALE;
    if (w < 3 && h < 3) continue; // skip small pillars/blocks

    const center = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    const hw = w / 2;
    const hh = h / 2;

    const wallCorners = [
      { x: center.x - hw, z: center.z - hh },
      { x: center.x + hw, z: center.z - hh },
      { x: center.x - hw, z: center.z + hh },
      { x: center.x + hw, z: center.z + hh },
    ];
    for (const c of wallCorners) {
      const p = new THREE.Mesh(decorPillarGeo, pillarMat);
      p.position.set(c.x, (WALL_HEIGHT + 0.1) / 2, c.z);
      p.castShadow = true;
      group.add(p);
    }
  }

  // 3. Floor accent tiles — zone-colored cross pattern at intervals
  const accentMat = new THREE.MeshStandardMaterial({
    color: theme.wallColor,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.5,
    roughness: 0.8,
    metalness: 0.1,
  });
  const accentGeo = new THREE.BoxGeometry(1.5, 0.02, 1.5);
  const ACCENT_SPACING = 20;
  for (let ax = -halfW + ACCENT_SPACING; ax < halfW; ax += ACCENT_SPACING) {
    for (let az = -halfH + ACCENT_SPACING; az < halfH; az += ACCENT_SPACING) {
      const tile = new THREE.Mesh(accentGeo, accentMat);
      tile.position.set(ax, 0.01, az);
      tile.receiveShadow = true;
      tile.rotation.y = Math.PI / 4; // diamond orientation
      group.add(tile);
    }
  }

  // 4. Rubble scatter near walls
  const rubbleMat = new THREE.MeshStandardMaterial({
    color: (theme.wallColor & 0xfefefe) >> 1,
    roughness: 0.95,
    metalness: 0.0,
  });
  const rubbleGeos = [
    new THREE.DodecahedronGeometry(0.15, 0),
    new THREE.DodecahedronGeometry(0.1, 0),
    new THREE.OctahedronGeometry(0.12, 0),
  ];

  for (const wall of arena.walls) {
    const w = wall.w * ARENA_SCALE;
    const h = wall.h * ARENA_SCALE;
    if (w < 1 || h < 1) continue;

    const center = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
    // Scatter 2-4 rubble pieces around each wall
    const seed = wall.x * 13 + wall.y * 7;
    const count = 2 + (seed % 3);
    for (let i = 0; i < count; i++) {
      const angle = ((seed + i * 137) % 360) * Math.PI / 180;
      const dist = (w + h) / 2 * 0.6 + 0.3;
      const rx = center.x + Math.cos(angle) * dist;
      const rz = center.z + Math.sin(angle) * dist;
      const geo = rubbleGeos[(seed + i) % rubbleGeos.length];
      const rubble = new THREE.Mesh(geo, rubbleMat);
      rubble.position.set(rx, 0.08, rz);
      rubble.rotation.set(seed * 0.1, seed * 0.2, seed * 0.3);
      rubble.castShadow = true;
      group.add(rubble);
    }
  }

  // 5. Bone pile decorations
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd4c8a8,
    emissive: 0x1a1408,
    emissiveIntensity: 0.2,
    roughness: 0.7,
    metalness: 0.05,
  });
  const boneGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4);
  // Place bone piles at fixed positions relative to arena size
  const bonePositions = [
    { x: 0.15, z: 0.2 }, { x: 0.35, z: 0.7 }, { x: 0.65, z: 0.3 },
    { x: 0.8, z: 0.75 }, { x: 0.25, z: 0.85 }, { x: 0.7, z: 0.15 },
    { x: 0.5, z: 0.55 }, { x: 0.1, z: 0.5 }, { x: 0.9, z: 0.5 },
  ];
  for (const bp of bonePositions) {
    const bx = (bp.x - 0.5) * arenaW;
    const bz = (bp.z - 0.5) * arenaH;
    // Small pile of 3-4 bones
    for (let i = 0; i < 3; i++) {
      const bone = new THREE.Mesh(boneGeo, boneMat);
      bone.position.set(
        bx + (i - 1) * 0.15,
        0.03,
        bz + Math.sin(i * 2) * 0.1,
      );
      bone.rotation.set(0, i * 1.2, Math.PI / 2 + i * 0.3);
      group.add(bone);
    }
  }

  // 7. Mid-point pillars along boundary walls
  const midPillarGeo = new THREE.CylinderGeometry(0.25, 0.3, pillarHeight, 8);
  const boundaryMidpoints = [
    { x: 0, z: -halfH - thickness / 2 },          // north center
    { x: 0, z: halfH + thickness / 2 },           // south center
    { x: -halfW - thickness / 2, z: 0 },          // west center
    { x: halfW + thickness / 2, z: 0 },           // east center
    { x: -halfW / 2, z: -halfH - thickness / 2 }, // north quarter
    { x: halfW / 2, z: -halfH - thickness / 2 },
    { x: -halfW / 2, z: halfH + thickness / 2 },  // south quarter
    { x: halfW / 2, z: halfH + thickness / 2 },
    { x: -halfW - thickness / 2, z: -halfH / 2 }, // west quarter
    { x: -halfW - thickness / 2, z: halfH / 2 },
    { x: halfW + thickness / 2, z: -halfH / 2 },  // east quarter
    { x: halfW + thickness / 2, z: halfH / 2 },
  ];
  for (const mp of boundaryMidpoints) {
    const midPillar = new THREE.Mesh(midPillarGeo, pillarMat);
    midPillar.position.set(mp.x, pillarHeight / 2, mp.z);
    midPillar.castShadow = true;
    midPillar.receiveShadow = true;
    group.add(midPillar);
  }

  return { floor, walls, group };
}

export function disposeDungeon(dungeon: DungeonGeometry) {
  dungeon.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
  dungeon.group.removeFromParent();
}
