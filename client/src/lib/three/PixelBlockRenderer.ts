import * as THREE from 'three';
import { loadBuilderAsset } from './BuilderAssetCatalog';
import { ARENA_SCALE, GRID_CELL, arenaToWorld } from './DungeonBuilder';

const WORLD_CELL = GRID_CELL * ARENA_SCALE; // 2 world units per grid cell

export interface BlockStyle {
  floorBlock: string;   // e.g. 'pixel_blocks/Stone'
  wallBlock: string;    // e.g. 'pixel_blocks/Bricks_Dark'
  wallHeight: number;   // 1-4 blocks high
  enabled: boolean;
}

export interface PixelBlockHandle {
  group: THREE.Group;
  dispose(): void;
  rebuild(
    wallGrid: Uint8Array,
    gridW: number,
    gridH: number,
    arenaW: number,
    arenaH: number,
    style: BlockStyle,
  ): Promise<void>;
}

/** Extract geometry + material from the first Mesh found in a model Group. */
function extractMeshData(
  model: THREE.Group,
): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  let result: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  model.traverse((child) => {
    if (!result && child instanceof THREE.Mesh) {
      result = {
        geometry: child.geometry,
        material: Array.isArray(child.material) ? child.material[0] : child.material,
      };
    }
  });
  return result;
}

/**
 * Check if a wall cell is adjacent to floor (within 2 cells).
 * wallGrid uses builder convention: 1=wall, 0=floor.
 */
function isNearFloor(
  wallGrid: Uint8Array,
  gridW: number,
  gridH: number,
  gx: number,
  gy: number,
): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
        if (wallGrid[ny * gridW + nx] === 0) return true;
      }
    }
  }
  return false;
}

export function createPixelBlockRenderer(): PixelBlockHandle {
  const group = new THREE.Group();
  let floorMesh: THREE.InstancedMesh | null = null;
  let wallMesh: THREE.InstancedMesh | null = null;
  let buildId = 0;

  function disposeInstanced() {
    if (floorMesh) {
      group.remove(floorMesh);
      floorMesh.geometry.dispose();
      if (floorMesh.material instanceof THREE.Material) floorMesh.material.dispose();
      floorMesh = null;
    }
    if (wallMesh) {
      group.remove(wallMesh);
      wallMesh.geometry.dispose();
      if (wallMesh.material instanceof THREE.Material) wallMesh.material.dispose();
      wallMesh = null;
    }
  }

  async function rebuild(
    wallGrid: Uint8Array,
    gridW: number,
    gridH: number,
    _arenaW: number,
    _arenaH: number,
    style: BlockStyle,
  ): Promise<void> {
    disposeInstanced();
    const currentBuild = ++buildId;

    // Load both block models (cached after first load)
    const [floorResult, wallResult] = await Promise.all([
      loadBuilderAsset(style.floorBlock),
      loadBuilderAsset(style.wallBlock),
    ]);

    // Abort if a newer rebuild was triggered while loading
    if (currentBuild !== buildId) return;

    const floorData = extractMeshData(floorResult.model);
    const wallData = extractMeshData(wallResult.model);
    if (!floorData || !wallData) return;

    // Compute bounding boxes from geometry to determine natural block dimensions
    floorData.geometry.computeBoundingBox();
    wallData.geometry.computeBoundingBox();
    const floorBox = floorData.geometry.boundingBox!;
    const wallBox = wallData.geometry.boundingBox!;

    const floorSize = new THREE.Vector3();
    floorBox.getSize(floorSize);
    const floorCenter = new THREE.Vector3();
    floorBox.getCenter(floorCenter);

    const wallSize = new THREE.Vector3();
    wallBox.getSize(wallSize);
    const wallCenter = new THREE.Vector3();
    wallBox.getCenter(wallCenter);

    // Scale factors: fill exactly one grid cell (WORLD_CELL) on X/Z
    const floorScaleX = WORLD_CELL / floorSize.x;
    const floorScaleY = WORLD_CELL / floorSize.y;
    const floorScaleZ = WORLD_CELL / floorSize.z;

    const wallScaleX = WORLD_CELL / wallSize.x;
    const wallScaleY = WORLD_CELL / wallSize.y;
    const wallScaleZ = WORLD_CELL / wallSize.z;

    // Pre-compute Y positioning offsets
    // Floor: top surface at y=0 → position.y = -geomBox.max.y * scaleY
    const floorYPos = -floorBox.max.y * floorScaleY;
    // Floor: center the block at world (x, z)
    const floorXOff = -floorCenter.x * floorScaleX;
    const floorZOff = -floorCenter.z * floorScaleZ;

    // Wall: bottom of layer 0 at y=0 → position.y = -geomBox.min.y * scaleY + layer * blockH
    const wallYBase = -wallBox.min.y * wallScaleY;
    const wallBlockH = wallSize.y * wallScaleY;
    const wallXOff = -wallCenter.x * wallScaleX;
    const wallZOff = -wallCenter.z * wallScaleZ;

    // Count instances
    let floorCount = 0;
    let wallCellCount = 0;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const val = wallGrid[gy * gridW + gx];
        if (val === 0) {
          floorCount++;
        } else if (isNearFloor(wallGrid, gridW, gridH, gx, gy)) {
          wallCellCount++;
        }
      }
    }
    const totalWallInstances = wallCellCount * style.wallHeight;

    if (floorCount === 0 && totalWallInstances === 0) return;

    // Create instanced meshes
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(); // identity
    const scale = new THREE.Vector3();

    // --- Floor instances ---
    if (floorCount > 0) {
      floorMesh = new THREE.InstancedMesh(floorData.geometry, floorData.material, floorCount);
      floorMesh.receiveShadow = true;

      let idx = 0;
      scale.set(floorScaleX, floorScaleY, floorScaleZ);
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          if (wallGrid[gy * gridW + gx] !== 0) continue;
          const arenaX = gx * GRID_CELL + GRID_CELL / 2;
          const arenaY = gy * GRID_CELL + GRID_CELL / 2;
          const world = arenaToWorld(arenaX, arenaY);
          position.set(world.x + floorXOff, floorYPos, world.z + floorZOff);
          matrix.compose(position, quaternion, scale);
          floorMesh.setMatrixAt(idx++, matrix);
        }
      }
      floorMesh.instanceMatrix.needsUpdate = true;
      group.add(floorMesh);
    }

    // --- Wall instances ---
    if (totalWallInstances > 0) {
      wallMesh = new THREE.InstancedMesh(wallData.geometry, wallData.material, totalWallInstances);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;

      let idx = 0;
      scale.set(wallScaleX, wallScaleY, wallScaleZ);
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          if (wallGrid[gy * gridW + gx] !== 1) continue;
          if (!isNearFloor(wallGrid, gridW, gridH, gx, gy)) continue;

          const arenaX = gx * GRID_CELL + GRID_CELL / 2;
          const arenaY = gy * GRID_CELL + GRID_CELL / 2;
          const world = arenaToWorld(arenaX, arenaY);

          for (let layer = 0; layer < style.wallHeight; layer++) {
            position.set(
              world.x + wallXOff,
              wallYBase + layer * wallBlockH,
              world.z + wallZOff,
            );
            matrix.compose(position, quaternion, scale);
            wallMesh.setMatrixAt(idx++, matrix);
          }
        }
      }
      wallMesh.instanceMatrix.needsUpdate = true;
      group.add(wallMesh);
    }
  }

  return {
    group,
    dispose: disposeInstanced,
    rebuild,
  };
}
