import * as THREE from 'three';
import { arenaToWorld } from './DungeonBuilder';
import type { RealtimeProjectile } from '../stores/realtimeStore.svelte';
import type { ElementType } from '../stores/types';
import type { ParticleSystem } from './ParticleSystem';

const ELEMENT_COLORS: Record<ElementType, number> = {
  fire: 0xff6b35,
  ice: 0x3b82f6,
  shadow: 0x8b5cf6,
  holy: 0xffd700,
  none: 0xe8dcc4,
};

const VISUAL_COLORS: Record<string, number> = {
  shoot_arrow: 0xe8dcc4,
  piercing_shot: 0xffd700,
  crossbow_bolt: 0xff6b35,
  fan_of_knives: 0xcccccc,
  explosive_bolt: 0xff6b35,
  fireball: 0xff6b35,
  shadow_bolt: 0x8b5cf6,
  ice_spike: 0x3b82f6,
  life_drain: 0x8b5cf6,
  meteor: 0xff3333,
};

interface ProjectileMesh {
  id: string;
  group: THREE.Group;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  trail?: THREE.Mesh;
  age: number;
  element: ElementType;
  visual: string;
}

export class ProjectileManager {
  private scene: THREE.Scene;
  private particles: ParticleSystem | null;
  private active: Map<string, ProjectileMesh> = new Map();
  private effects: THREE.Mesh[] = [];
  // Pre-allocated temp vector to avoid GC pressure in render loop
  private _dir = new THREE.Vector3();

  constructor(scene: THREE.Scene, particleSystem?: ParticleSystem) {
    this.scene = scene;
    this.particles = particleSystem ?? null;
  }

  updateFromState(projectiles: RealtimeProjectile[]) {
    const currentIds = new Set(projectiles.map(p => p.id));

    // Remove projectiles no longer in state — emit impact burst
    for (const [id, pm] of this.active) {
      if (!currentIds.has(id)) {
        if (this.particles) {
          const color = ELEMENT_COLORS[pm.element] ?? 0xffffff;
          this.particles.emitBurst(pm.currentPos, color, 12);
        }
        this.scene.remove(pm.group);
        this.disposeGroup(pm.group);
        this.active.delete(id);
      }
    }

    // Add/update projectiles
    for (const proj of projectiles) {
      const world = arenaToWorld(proj.x, proj.y);
      const worldPos = new THREE.Vector3(world.x, 1.5, world.z);

      if (this.active.has(proj.id)) {
        const pm = this.active.get(proj.id)!;
        pm.targetPos.copy(worldPos);
      } else {
        // Create new projectile mesh
        const group = this.createProjectileMesh(proj);
        group.position.copy(worldPos);
        this.scene.add(group);

        this.active.set(proj.id, {
          id: proj.id,
          group,
          targetPos: worldPos.clone(),
          currentPos: worldPos.clone(),
          age: 0,
          element: proj.element,
          visual: proj.visual,
        });
      }
    }
  }

  private createProjectileMesh(proj: RealtimeProjectile): THREE.Group {
    const group = new THREE.Group();
    const color = VISUAL_COLORS[proj.visual] ?? ELEMENT_COLORS[proj.element] ?? 0xffffff;
    const size = proj.size ?? 1;

    if (proj.visual === 'shoot_arrow' || proj.visual === 'piercing_shot') {
      // Arrow: shaft + tip with PBR materials
      const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5 * size, 4);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: 0x8a7a60,
        metalness: 0.1,
        roughness: 0.7,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tipGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
      const isPiercing = proj.visual === 'piercing_shot';
      const tipMat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.5,
        roughness: 0.3,
        emissive: isPiercing ? 0xffd700 : 0x000000,
        emissiveIntensity: isPiercing ? 0.6 : 0,
      });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = -0.32 * size;
      group.add(tip);
    } else if (proj.visual === 'fireball') {
      // Outer fire sphere
      const outerGeo = new THREE.SphereGeometry(0.15 * size, 10, 8);
      const outerMat = new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        emissive: 0xff6b35,
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.0,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      group.add(outer);

      // Inner hot core
      const innerGeo = new THREE.SphereGeometry(0.08 * size, 8, 6);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        emissive: 0xffcc00,
        emissiveIntensity: 1.0,
        roughness: 0.2,
        metalness: 0.0,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      group.add(inner);
    } else if (proj.visual === 'shadow_bolt') {
      // Dark outer sphere
      const outerGeo = new THREE.SphereGeometry(0.12 * size, 8, 6);
      const outerMat = new THREE.MeshStandardMaterial({
        color: 0x4a2080,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        metalness: 0.1,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      group.add(outer);

      // Inner void
      const innerGeo = new THREE.SphereGeometry(0.06 * size, 6, 4);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x100820,
        emissive: 0x100820,
        emissiveIntensity: 0.2,
        roughness: 0.9,
        metalness: 0.0,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      group.add(inner);
    } else if (proj.visual === 'ice_spike') {
      // Tall crystalline diamond
      const spikeGeo = new THREE.OctahedronGeometry(0.15 * size, 0);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0x2060cc,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.2,
      });
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.scale.set(0.5, 1.5, 0.5);
      group.add(spike);

      // Inner glow
      const innerGeo = new THREE.OctahedronGeometry(0.08 * size, 0);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        emissive: 0x93c5fd,
        emissiveIntensity: 0.9,
        metalness: 0.1,
        roughness: 0.2,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.scale.set(0.5, 1.5, 0.5);
      group.add(inner);
    } else if (proj.visual === 'meteor') {
      // Large fireball meteor
      const meteorGeo = new THREE.SphereGeometry(0.3 * size, 10, 8);
      const meteorMat = new THREE.MeshStandardMaterial({
        color: 0xcc2200,
        emissive: 0xff3333,
        emissiveIntensity: 1.0,
        roughness: 0.4,
        metalness: 0.0,
      });
      const meteor = new THREE.Mesh(meteorGeo, meteorMat);
      group.add(meteor);

      const coreGeo = new THREE.SphereGeometry(0.15 * size, 8, 6);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        emissive: 0xffcc00,
        emissiveIntensity: 1.0,
        roughness: 0.2,
        metalness: 0.0,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      group.position.y = 3; // Start high
    } else if (proj.visual === 'crossbow_bolt') {
      // Small cylinder + cone tip
      const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35 * size, 4);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: 0x8a7a60,
        metalness: 0.2,
        roughness: 0.6,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tipGeo = new THREE.ConeGeometry(0.03, 0.1, 4);
      const tipMat = new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        emissive: 0xff6b35,
        emissiveIntensity: 0.5,
        metalness: 0.4,
        roughness: 0.3,
      });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = -0.22 * size;
      group.add(tip);
    } else if (proj.visual === 'fan_of_knives') {
      // Small metallic blade
      const bladeGeo = new THREE.BoxGeometry(0.03, 0.2, 0.08);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.7,
        roughness: 0.2,
        emissive: 0xcccccc,
        emissiveIntensity: 0.15,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      group.add(blade);
    } else if (proj.visual === 'life_drain') {
      // Purple orb, semi-transparent
      const orbGeo = new THREE.SphereGeometry(0.1 * size, 8, 6);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.7,
        roughness: 0.3,
        metalness: 0.0,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      group.add(orb);

      // Green healing inner core
      const innerGeo = new THREE.SphereGeometry(0.06 * size, 6, 4);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x22ff22,
        emissive: 0x22ff22,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.0,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      group.add(inner);
    } else {
      // Default bolt: sphere with emissive glow
      const boltGeo = new THREE.SphereGeometry(0.1 * size, 8, 6);
      const boltMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.1,
      });
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      group.add(bolt);

      // Smaller inner glow
      const glowGeo = new THREE.SphereGeometry(0.06 * size, 6, 4);
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.6,
        roughness: 0.2,
        metalness: 0.0,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      group.add(glow);
    }

    // Scale up for top-down visibility (camera is 22 units above)
    group.scale.setScalar(3);

    // Add dynamic point light so projectile illuminates the dungeon as it flies
    const glowLight = new THREE.PointLight(color, 2.5, 10);
    glowLight.position.y = 0.2;
    group.add(glowLight);

    return group;
  }

  /** Determine trail particle count per visual type. */
  private trailCount(visual: string): number {
    switch (visual) {
      case 'fireball':
      case 'meteor':
        return 8;
      case 'shadow_bolt':
      case 'ice_spike':
      case 'life_drain':
        return 6;
      case 'crossbow_bolt':
      case 'fan_of_knives':
        return 3;
      default:
        return 4;
    }
  }

  update(dt: number) {
    for (const [, pm] of this.active) {
      pm.age += dt;
      // Lerp toward target
      const lerpFactor = Math.min(1, dt * 20);
      pm.currentPos.lerp(pm.targetPos, lerpFactor);
      pm.group.position.copy(pm.currentPos);

      // Rotate to face travel direction (reuse pre-allocated vector)
      this._dir.subVectors(pm.targetPos, pm.currentPos);
      if (this._dir.length() > 0.01) {
        pm.group.lookAt(pm.targetPos);
      }

      // Meteor: descend toward flight height
      if (pm.visual === 'meteor' && pm.group.position.y > 1.5) {
        pm.group.position.y = Math.max(1.5, pm.group.position.y - dt * 6);
      }

      // Emit trail particles
      if (this.particles) {
        const color = ELEMENT_COLORS[pm.element] ?? 0xffffff;
        this.particles.emitTrail(pm.group.position, color, this.trailCount(pm.visual));
      }
    }

    // Clean up faded effects
    this.effects = this.effects.filter(e => {
      const mat = e.material as THREE.MeshStandardMaterial;
      mat.opacity -= dt * 2;
      e.scale.multiplyScalar(1 + dt * 3);
      if (mat.opacity <= 0) {
        this.scene.remove(e);
        e.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  spawnNovaEffect(arenaX: number, arenaY: number, element: ElementType, radius: number) {
    const world = arenaToWorld(arenaX, arenaY);
    const color = ELEMENT_COLORS[element] ?? 0xffffff;
    const worldRadius = radius * 0.05; // rough arena-to-world scale

    const ringGeo = new THREE.TorusGeometry(worldRadius, 0.08, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.8,
      roughness: 0.3,
      metalness: 0.0,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(world.x, 0.1, world.z);
    this.scene.add(ring);
    this.effects.push(ring);

    // Particle burst at nova center
    if (this.particles) {
      const novaPos = new THREE.Vector3(world.x, 0.5, world.z);
      this.particles.emitBurst(novaPos, color, 20, worldRadius);
    }
  }

  private disposeGroup(group: THREE.Group) {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  dispose() {
    for (const [, pm] of this.active) {
      this.scene.remove(pm.group);
      this.disposeGroup(pm.group);
    }
    this.active.clear();

    for (const e of this.effects) {
      this.scene.remove(e);
      e.geometry.dispose();
      (e.material as THREE.Material).dispose();
    }
    this.effects = [];
  }
}
