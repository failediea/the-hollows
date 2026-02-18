import * as THREE from 'three';
import type { ParticleSystem } from './ParticleSystem';

export interface Portal {
  group: THREE.Group;
  light: THREE.PointLight;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export function createStoneArchway(
  position: THREE.Vector3,
  particleSystem: ParticleSystem,
): Portal {
  const group = new THREE.Group();
  group.position.copy(position);
  group.name = 'stoneArchway';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a5a,
    roughness: 0.85,
    metalness: 0.15,
  });

  // Two stone pillars
  const pillarGeo = new THREE.BoxGeometry(1, 5, 1);

  const leftPillar = new THREE.Mesh(pillarGeo, stoneMat);
  leftPillar.position.set(-2, 2.5, 0);
  leftPillar.castShadow = true;
  group.add(leftPillar);

  const rightPillar = new THREE.Mesh(pillarGeo, stoneMat);
  rightPillar.position.set(2, 2.5, 0);
  rightPillar.castShadow = true;
  group.add(rightPillar);

  // Arch top (half torus)
  const archGeo = new THREE.TorusGeometry(2, 0.5, 8, 16, Math.PI);
  const arch = new THREE.Mesh(archGeo, stoneMat);
  arch.position.set(0, 5, 0);
  arch.rotation.z = Math.PI; // flip so arch goes up
  arch.rotation.y = Math.PI / 2;
  arch.castShadow = true;
  group.add(arch);

  // Rune strips on pillars (emissive green)
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x00ffaa,
    emissive: 0x00ffaa,
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.2,
  });

  const runeGeo = new THREE.BoxGeometry(0.15, 3.5, 0.15);

  const leftRune = new THREE.Mesh(runeGeo, runeMat);
  leftRune.position.set(-2, 2.5, -0.55);
  group.add(leftRune);

  const rightRune = new THREE.Mesh(runeGeo, runeMat);
  rightRune.position.set(2, 2.5, -0.55);
  group.add(rightRune);

  // Inner glow plane (transparent, will pulse)
  const glowGeo = new THREE.PlaneGeometry(3.5, 5);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x00ffaa,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glowPlane = new THREE.Mesh(glowGeo, glowMat);
  glowPlane.position.set(0, 2.5, 0);
  group.add(glowPlane);

  // Point light
  const light = new THREE.PointLight(0x00ffaa, 8, 30);
  light.position.set(position.x, position.y + 3, position.z);

  // Portal particles via ambient emitter around the archway
  const portalBounds = new THREE.Box3(
    new THREE.Vector3(position.x - 2.5, position.y, position.z - 1),
    new THREE.Vector3(position.x + 2.5, position.y + 6, position.z + 1),
  );
  particleSystem.emitAmbient(portalBounds, 0x00ffaa, 1.5);

  return {
    group,
    light,
    update(_dt: number, elapsed: number) {
      // Pulse glow plane opacity
      glowMat.opacity = 0.1 + Math.sin(elapsed * 2) * 0.08;

      // Pulse light intensity
      light.intensity = 6 + Math.sin(elapsed * 1.5) * 2;

      // Pulse rune emissive
      const pulse = 0.6 + Math.sin(elapsed * 3) * 0.3;
      runeMat.emissiveIntensity = pulse;
    },
    dispose() {
      pillarGeo.dispose();
      stoneMat.dispose();
      archGeo.dispose();
      runeGeo.dispose();
      runeMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      light.dispose();
    },
  };
}
