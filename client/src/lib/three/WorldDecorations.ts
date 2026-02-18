import * as THREE from 'three';
import { getHeightAt, type TerrainData } from './TerrainBuilder';

export interface WorldDecorationsHandle {
  group: THREE.Group;
  dispose(): void;
}

const TREE_COUNT = 80;
const ROCK_COUNT = 100;

export function createWorldDecorations(
  terrain: TerrainData,
  portalPos: THREE.Vector3,
): WorldDecorationsHandle {
  const group = new THREE.Group();
  group.name = 'worldDecorations';

  // --- Trees: instanced canopy + trunk ---
  const canopyGeo = new THREE.ConeGeometry(1.2, 3, 6);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x2d6b1e,
    roughness: 0.85,
    metalness: 0.0,
  });
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;

  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5a3a1a,
    roughness: 0.9,
    metalness: 0.0,
  });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  trunkMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  const half = terrain.size / 2;
  let treeIdx = 0;

  for (let attempt = 0; attempt < TREE_COUNT * 3 && treeIdx < TREE_COUNT; attempt++) {
    const x = (Math.random() - 0.5) * (terrain.size * 0.9);
    const z = (Math.random() - 0.5) * (terrain.size * 0.9);

    // Avoid center (player spawn)
    const distCenter = Math.sqrt(x * x + z * z);
    if (distCenter < 8) continue;

    // Avoid portal area
    const dx = x - portalPos.x;
    const dz = z - portalPos.z;
    if (Math.sqrt(dx * dx + dz * dz) < 10) continue;

    const y = getHeightAt(terrain, x, z);
    const scale = 0.7 + Math.random() * 0.8;
    const rotY = Math.random() * Math.PI * 2;

    // Canopy
    dummy.position.set(x, y + 2.5 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(treeIdx, dummy.matrix);

    // Trunk
    dummy.position.set(x, y + 1 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(treeIdx, dummy.matrix);

    treeIdx++;
  }

  canopyMesh.count = treeIdx;
  trunkMesh.count = treeIdx;
  canopyMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  group.add(canopyMesh);
  group.add(trunkMesh);

  // --- Rocks: instanced icosahedrons ---
  const rockGeo = new THREE.IcosahedronGeometry(0.6, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a6a,
    roughness: 0.95,
    metalness: 0.05,
  });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;

  let rockIdx = 0;
  for (let attempt = 0; attempt < ROCK_COUNT * 3 && rockIdx < ROCK_COUNT; attempt++) {
    const x = (Math.random() - 0.5) * (terrain.size * 0.9);
    const z = (Math.random() - 0.5) * (terrain.size * 0.9);

    // Avoid center
    const distCenter = Math.sqrt(x * x + z * z);
    if (distCenter < 8) continue;

    // Avoid portal
    const dx = x - portalPos.x;
    const dz = z - portalPos.z;
    if (Math.sqrt(dx * dx + dz * dz) < 10) continue;

    const y = getHeightAt(terrain, x, z);
    const scale = 0.3 + Math.random() * 1.0;

    dummy.position.set(x, y + 0.2 * scale, z);
    dummy.scale.set(scale, scale * (0.5 + Math.random() * 0.5), scale);
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI,
    );
    dummy.updateMatrix();
    rockMesh.setMatrixAt(rockIdx, dummy.matrix);
    rockIdx++;
  }

  rockMesh.count = rockIdx;
  rockMesh.instanceMatrix.needsUpdate = true;
  group.add(rockMesh);

  return {
    group,
    dispose() {
      canopyGeo.dispose();
      canopyMat.dispose();
      trunkGeo.dispose();
      trunkMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      group.remove(canopyMesh, trunkMesh, rockMesh);
    },
  };
}
