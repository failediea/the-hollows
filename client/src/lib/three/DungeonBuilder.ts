import * as THREE from 'three';
import type { ArenaData } from '../stores/realtimeStore.svelte';
import { createWallMaterial, createFloorMaterial, getZoneTheme } from './materials';
import type { WallAsset } from './WallAssetLoader';

// Arena pixel → Three.js unit mapping: 1 arena px = 0.1 Three.js units
// Arena Y -> Three.js Z (Y-up in Three.js)
export const ARENA_SCALE = 0.1;
export const GRID_CELL = 20;
const BASE_WALL_HEIGHT = 3;

// Dynamic arena center — updated by buildDungeon() to support any arena size
let arenaCenterX = 400;
let arenaCenterY = 300;

export interface DungeonGeometry {
  floor: THREE.Mesh | null;
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

/**
 * Build the dungeon geometry from arena data.
 * @param arena - Arena dimensions and wall rectangles
 * @param zone - Zone ID for theming
 * @param wallAsset - Optional wall mesh asset loaded from wall.glb (geometry + material + dimensions)
 * @param options - Skip floor/interior walls when pixel block rendering handles them
 */
export function buildDungeon(
  arena: ArenaData,
  zone: string,
  wallAsset?: WallAsset,
  options?: { skipFloor?: boolean; skipInteriorWalls?: boolean },
): DungeonGeometry {
  // Update centering for this arena size
  arenaCenterX = arena.width / 2;
  arenaCenterY = arena.height / 2;

  const group = new THREE.Group();
  const theme = getZoneTheme(zone);
  const arenaW = arena.width * ARENA_SCALE;
  const arenaH = arena.height * ARENA_SCALE;

  // Floor
  let floor: THREE.Mesh | null = null;
  const halfW = arenaW / 2;
  const halfH = arenaH / 2;

  if (!options?.skipFloor) {
    const floorGeo = new THREE.PlaneGeometry(arenaW, arenaH);
    const floorMat = createFloorMaterial(zone);
    floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; // Lay flat
    floor.position.y = 0;
    floor.receiveShadow = true;
    group.add(floor);

    // Floor grid detail — subtle cool dark lines for worn stone tile look
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x0e1118,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const TILE_SPACING = 7;
    const LINE_THICKNESS = 0.02;

    for (let z = -halfH + TILE_SPACING; z < halfH; z += TILE_SPACING) {
      const lineGeo = new THREE.BoxGeometry(arenaW, LINE_THICKNESS, LINE_THICKNESS);
      const lineMesh = new THREE.Mesh(lineGeo, gridMat);
      lineMesh.position.set(0, 0.005, z);
      lineMesh.receiveShadow = true;
      group.add(lineMesh);
    }
    for (let x = -halfW + TILE_SPACING; x < halfW; x += TILE_SPACING) {
      const lineGeo = new THREE.BoxGeometry(LINE_THICKNESS, LINE_THICKNESS, arenaH);
      const lineMesh = new THREE.Mesh(lineGeo, gridMat);
      lineMesh.position.set(x, 0.005, 0);
      lineMesh.receiveShadow = true;
      group.add(lineMesh);
    }
  }

  // Prepare wall material — either GLB model material with zone tint, or procedural fallback
  const hasGlbWall = !!wallAsset;
  let wallMat: THREE.MeshStandardMaterial;
  if (hasGlbWall) {
    wallMat = wallAsset!.material.clone();
    // Subtle zone tint via color multiply (texture provides base color, tint shifts hue)
    const tint = new THREE.Color(theme.wallColor);
    tint.lerp(new THREE.Color(0xffffff), 0.7);
    wallMat.color = tint;
    wallMat.emissive = new THREE.Color(theme.wallEmissive);
    wallMat.emissiveIntensity = 0.3;
    // Render both sides — GLB normals may face away from top-down camera
    wallMat.side = THREE.DoubleSide;
  } else {
    wallMat = createWallMaterial(zone);
  }

  // Wall base trim material
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
  const TRIM_OVERHANG = 0.06;

  // Wall cap material
  const capColor = Math.max((theme.wallColor & 0xff0000) - 0x100000, 0)
    | Math.max((theme.wallColor & 0x00ff00) - 0x001000, 0)
    | Math.max((theme.wallColor & 0x0000ff) - 0x000010, 0);
  const capMat = new THREE.MeshStandardMaterial({
    color: capColor,
    roughness: 0.95,
    metalness: 0.05,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.1,
  });
  const CAP_HEIGHT = 0.08;

  // Seam material (only used in procedural fallback)
  const seamMat = !hasGlbWall ? new THREE.MeshStandardMaterial({
    color: 0x0a0c12,
    roughness: 0.95,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }) : null;
  const SEAM_THICKNESS = 0.02;
  const SEAM_DEPTH = 0.02;

  // Interior walls from arena data
  const walls: THREE.Mesh[] = [];

  if (!options?.skipInteriorWalls)
  for (const wall of arena.walls) {
    const w = wall.w * ARENA_SCALE;
    const h = wall.h * ARENA_SCALE;
    const pos = arenaToWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);

    const seed = wall.x * 13 + wall.y * 7;
    const wallH = 2.7 + (seed % 7) / 10;

    let wallMesh: THREE.Mesh;
    if (hasGlbWall) {
      // Use the actual 3D wall model geometry, scaled to fit this wall segment
      wallMesh = new THREE.Mesh(wallAsset!.geometry, wallMat);
      wallMesh.scale.set(
        w / wallAsset!.width,
        wallH / wallAsset!.height,
        h / wallAsset!.depth,
      );
      // The model is centered at origin; position at wall center, offset Y by half height
      wallMesh.position.set(pos.x, wallH / 2, pos.z);
    } else {
      const wallGeo = new THREE.BoxGeometry(w, wallH, h);
      wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(pos.x, wallH / 2, pos.z);
    }
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    walls.push(wallMesh);
    group.add(wallMesh);

    // Solid top face — GLB models may lack top geometry, so add a plane visible from above
    if (hasGlbWall) {
      const topGeo = new THREE.PlaneGeometry(w, h);
      const topMesh = new THREE.Mesh(topGeo, wallMat);
      topMesh.rotation.x = -Math.PI / 2; // lay flat, face up
      topMesh.position.set(pos.x, wallH, pos.z);
      topMesh.receiveShadow = true;
      group.add(topMesh);
    }

    // Wall cap (decorative trim edge)
    const capGeo = new THREE.BoxGeometry(w + 0.04, CAP_HEIGHT, h + 0.04);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(pos.x, wallH + CAP_HEIGHT / 2, pos.z);
    capMesh.castShadow = true;
    group.add(capMesh);

    // Wall base trim
    const trimGeo = new THREE.BoxGeometry(w + TRIM_OVERHANG * 2, TRIM_HEIGHT, h + TRIM_OVERHANG * 2);
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.set(pos.x, TRIM_HEIGHT / 2, pos.z);
    trimMesh.receiveShadow = true;
    group.add(trimMesh);

    // Procedural seam lines + inset panels — only when no GLB model
    if (!hasGlbWall) {
      if (w >= 1.5 || h >= 1.5) {
        if (w >= 1.5) {
          for (let sy = 0.8; sy < wallH - 0.3; sy += 0.8) {
            const hGeo = new THREE.BoxGeometry(w, SEAM_THICKNESS, SEAM_DEPTH);
            const hf = new THREE.Mesh(hGeo, seamMat!);
            hf.position.set(pos.x, sy, pos.z + h / 2 + SEAM_DEPTH / 2);
            group.add(hf);
            const hb = new THREE.Mesh(hGeo, seamMat!);
            hb.position.set(pos.x, sy, pos.z - h / 2 - SEAM_DEPTH / 2);
            group.add(hb);
          }
          for (let vx = -w / 2 + 1.5; vx < w / 2; vx += 1.5) {
            const vGeo = new THREE.BoxGeometry(SEAM_THICKNESS, wallH, SEAM_DEPTH);
            const vf = new THREE.Mesh(vGeo, seamMat!);
            vf.position.set(pos.x + vx, wallH / 2, pos.z + h / 2 + SEAM_DEPTH / 2);
            group.add(vf);
            const vb = new THREE.Mesh(vGeo, seamMat!);
            vb.position.set(pos.x + vx, wallH / 2, pos.z - h / 2 - SEAM_DEPTH / 2);
            group.add(vb);
          }
        }
        if (h >= 1.5) {
          for (let sy = 0.8; sy < wallH - 0.3; sy += 0.8) {
            const hGeo = new THREE.BoxGeometry(SEAM_DEPTH, SEAM_THICKNESS, h);
            const hr = new THREE.Mesh(hGeo, seamMat!);
            hr.position.set(pos.x + w / 2 + SEAM_DEPTH / 2, sy, pos.z);
            group.add(hr);
            const hl = new THREE.Mesh(hGeo, seamMat!);
            hl.position.set(pos.x - w / 2 - SEAM_DEPTH / 2, sy, pos.z);
            group.add(hl);
          }
          for (let vz = -h / 2 + 1.5; vz < h / 2; vz += 1.5) {
            const vGeo = new THREE.BoxGeometry(SEAM_DEPTH, wallH, SEAM_THICKNESS);
            const vr = new THREE.Mesh(vGeo, seamMat!);
            vr.position.set(pos.x + w / 2 + SEAM_DEPTH / 2, wallH / 2, pos.z + vz);
            group.add(vr);
            const vl = new THREE.Mesh(vGeo, seamMat!);
            vl.position.set(pos.x - w / 2 - SEAM_DEPTH / 2, wallH / 2, pos.z + vz);
            group.add(vl);
          }
        }
      }

      // Inset panels
      if (w > 3 || h > 3) {
        const insetDepth = 0.06;
        const insetInset = 0.3;
        const insetMat = new THREE.MeshStandardMaterial({
          color: (theme.wallColor & 0xfefefe) >> 1,
          roughness: 0.92,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        if (w > 3) {
          const panelW = w - insetInset * 2;
          const panelH2 = wallH - insetInset * 2;
          if (panelW > 0.5 && panelH2 > 0.5) {
            const panelGeo = new THREE.BoxGeometry(panelW, panelH2, insetDepth);
            const pf = new THREE.Mesh(panelGeo, insetMat);
            pf.position.set(pos.x, wallH / 2, pos.z + h / 2 - insetDepth / 2);
            group.add(pf);
            const pb = new THREE.Mesh(panelGeo, insetMat);
            pb.position.set(pos.x, wallH / 2, pos.z - h / 2 + insetDepth / 2);
            group.add(pb);
          }
        }
        if (h > 3) {
          const panelD = h - insetInset * 2;
          const panelH2 = wallH - insetInset * 2;
          if (panelD > 0.5 && panelH2 > 0.5) {
            const panelGeo = new THREE.BoxGeometry(insetDepth, panelH2, panelD);
            const pr = new THREE.Mesh(panelGeo, insetMat);
            pr.position.set(pos.x + w / 2 - insetDepth / 2, wallH / 2, pos.z);
            group.add(pr);
            const pl = new THREE.Mesh(panelGeo, insetMat);
            pl.position.set(pos.x - w / 2 + insetDepth / 2, wallH / 2, pos.z);
            group.add(pl);
          }
        }
      }
    }
  }

  // Boundary walls (arena edges)
  const thickness = 0.5;
  const boundaryMat = wallMat.clone();

  // Helper to create a boundary wall (GLB model scaled or BoxGeometry fallback)
  function makeBoundaryWall(bw: number, bh: number, bd: number, px: number, py: number, pz: number): THREE.Mesh {
    let bMesh: THREE.Mesh;
    if (hasGlbWall) {
      bMesh = new THREE.Mesh(wallAsset!.geometry, boundaryMat);
      bMesh.scale.set(bw / wallAsset!.width, bh / wallAsset!.height, bd / wallAsset!.depth);
    } else {
      bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), boundaryMat);
    }
    bMesh.position.set(px, py, pz);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;

    // Add top face for GLB walls (model may lack top geometry)
    if (hasGlbWall) {
      const topGeo = new THREE.PlaneGeometry(bw, bd);
      const topMesh = new THREE.Mesh(topGeo, boundaryMat);
      topMesh.rotation.x = -Math.PI / 2;
      topMesh.position.set(px, bh, pz);
      topMesh.receiveShadow = true;
      group.add(topMesh);
    }

    return bMesh;
  }

  const nsW = arenaW + thickness * 2;
  const northWall = makeBoundaryWall(nsW, BASE_WALL_HEIGHT, thickness, 0, BASE_WALL_HEIGHT / 2, -halfH - thickness / 2);
  group.add(northWall);
  walls.push(northWall);

  const southWall = makeBoundaryWall(nsW, BASE_WALL_HEIGHT, thickness, 0, BASE_WALL_HEIGHT / 2, halfH + thickness / 2);
  group.add(southWall);
  walls.push(southWall);

  const ewD = arenaH + thickness * 2;
  const eastWall = makeBoundaryWall(thickness, BASE_WALL_HEIGHT, ewD, halfW + thickness / 2, BASE_WALL_HEIGHT / 2, 0);
  group.add(eastWall);
  walls.push(eastWall);

  const westWall = makeBoundaryWall(thickness, BASE_WALL_HEIGHT, ewD, -halfW - thickness / 2, BASE_WALL_HEIGHT / 2, 0);
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
  const pillarHeight = BASE_WALL_HEIGHT + 0.2;
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
  const torchSpacing = 16;
  const torchBracketGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15);
  const torchBracketMat = new THREE.MeshStandardMaterial({
    color: 0x4a3a2a, roughness: 0.5, metalness: 0.6,
  });
  const torchFlameGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const torchFlameMat = new THREE.MeshStandardMaterial({
    color: 0xff8833, emissive: 0xff6b20, emissiveIntensity: 2.0,
    transparent: true, opacity: 0.9,
  });

  let torchIndex = 0;
  for (let x = -halfW + torchSpacing; x < halfW; x += torchSpacing) {
    const nBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    nBracket.position.set(x, 2.0, -halfH + 0.3);
    group.add(nBracket);
    const nFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    nFlame.position.set(x, 2.3, -halfH + 0.3);
    group.add(nFlame);

    const sBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    sBracket.position.set(x, 2.0, halfH - 0.3);
    group.add(sBracket);
    const sFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    sFlame.position.set(x, 2.3, halfH - 0.3);
    group.add(sFlame);

    if (torchIndex % 3 === 0) {
      const nLight = new THREE.PointLight(0xff8833, 3.5, 16, 1.5);
      nLight.position.set(x, 2.4, -halfH + 0.5);
      group.add(nLight);
      const sLight = new THREE.PointLight(0xff8833, 3.5, 16, 1.5);
      sLight.position.set(x, 2.4, halfH - 0.5);
      group.add(sLight);
    }
    torchIndex++;
  }
  torchIndex = 0;
  for (let z = -halfH + torchSpacing; z < halfH; z += torchSpacing) {
    const wBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    wBracket.position.set(-halfW + 0.3, 2.0, z);
    group.add(wBracket);
    const wFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    wFlame.position.set(-halfW + 0.3, 2.3, z);
    group.add(wFlame);

    const eBracket = new THREE.Mesh(torchBracketGeo, torchBracketMat);
    eBracket.position.set(halfW - 0.3, 2.0, z);
    group.add(eBracket);
    const eFlame = new THREE.Mesh(torchFlameGeo, torchFlameMat);
    eFlame.position.set(halfW - 0.3, 2.3, z);
    group.add(eFlame);

    if (torchIndex % 3 === 0) {
      const wLight = new THREE.PointLight(0xff8833, 3.5, 16, 1.5);
      wLight.position.set(-halfW + 0.5, 2.4, z);
      group.add(wLight);
      const eLight = new THREE.PointLight(0xff8833, 3.5, 16, 1.5);
      eLight.position.set(halfW - 0.5, 2.4, z);
      group.add(eLight);
    }
    torchIndex++;
  }

  if (!options?.skipInteriorWalls) {
    // 2. Decorative pillars at corners of larger interior walls
    const decorPillarGeo = new THREE.CylinderGeometry(0.2, 0.25, BASE_WALL_HEIGHT + 0.1, 6);
    for (const wall of arena.walls) {
      const w = wall.w * ARENA_SCALE;
      const h = wall.h * ARENA_SCALE;
      if (w < 3 && h < 3) continue;

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
        p.position.set(c.x, (BASE_WALL_HEIGHT + 0.1) / 2, c.z);
        p.castShadow = true;
        group.add(p);
      }
    }

    // 3. Floor accent tiles
    const accentMat = new THREE.MeshStandardMaterial({
      color: theme.wallColor,
      emissive: theme.wallEmissive,
      emissiveIntensity: 0.5,
      roughness: 0.8,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const accentGeo = new THREE.BoxGeometry(1.5, 0.02, 1.5);
    const ACCENT_SPACING = 20;
    for (let ax = -halfW + ACCENT_SPACING; ax < halfW; ax += ACCENT_SPACING) {
      for (let az = -halfH + ACCENT_SPACING; az < halfH; az += ACCENT_SPACING) {
        const tile = new THREE.Mesh(accentGeo, accentMat);
        tile.position.set(ax, 0.01, az);
        tile.receiveShadow = true;
        tile.rotation.y = Math.PI / 4;
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
    const bonePositions = [
      { x: 0.15, z: 0.2 }, { x: 0.35, z: 0.7 }, { x: 0.65, z: 0.3 },
      { x: 0.8, z: 0.75 }, { x: 0.25, z: 0.85 }, { x: 0.7, z: 0.15 },
      { x: 0.5, z: 0.55 }, { x: 0.1, z: 0.5 }, { x: 0.9, z: 0.5 },
    ];
    for (const bp of bonePositions) {
      const bx = (bp.x - 0.5) * arenaW;
      const bz = (bp.z - 0.5) * arenaH;
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
  }

  // 7. Mid-point pillars along boundary walls
  const midPillarGeo = new THREE.CylinderGeometry(0.25, 0.3, pillarHeight, 8);
  const boundaryMidpoints = [
    { x: 0, z: -halfH - thickness / 2 },
    { x: 0, z: halfH + thickness / 2 },
    { x: -halfW - thickness / 2, z: 0 },
    { x: halfW + thickness / 2, z: 0 },
    { x: -halfW / 2, z: -halfH - thickness / 2 },
    { x: halfW / 2, z: -halfH - thickness / 2 },
    { x: -halfW / 2, z: halfH + thickness / 2 },
    { x: halfW / 2, z: halfH + thickness / 2 },
    { x: -halfW - thickness / 2, z: -halfH / 2 },
    { x: -halfW - thickness / 2, z: halfH / 2 },
    { x: halfW + thickness / 2, z: -halfH / 2 },
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
