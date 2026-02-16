import * as THREE from 'three';
import type { PlayerClass, EnemyArchetype } from '../stores/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimationName =
  | 'idle'
  | 'walk'
  | 'attack_melee'
  | 'attack_ranged'
  | 'cast'
  | 'hit'
  | 'death';

export interface AnimationConfig {
  type: 'player' | 'enemy';
  playerClass?: PlayerClass;
  archetype?: EnemyArchetype;
}

// ---------------------------------------------------------------------------
// Easing helpers
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Stored original transform for a single part
// ---------------------------------------------------------------------------

interface PartSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

// ---------------------------------------------------------------------------
// Speed / amplitude multipliers per class & archetype
// ---------------------------------------------------------------------------

interface AnimTweak {
  speedMul: number;       // multiplier on animation playback speed
  ampMul: number;         // multiplier on animation amplitudes
  preferredAttack: AnimationName; // which attack animation to use
}

function tweakForConfig(cfg: AnimationConfig): AnimTweak {
  const base: AnimTweak = { speedMul: 1, ampMul: 1, preferredAttack: 'attack_melee' };

  if (cfg.type === 'player' && cfg.playerClass) {
    switch (cfg.playerClass) {
      case 'sentinel':
        base.speedMul = 0.8;
        base.ampMul = 1.2;
        base.preferredAttack = 'attack_melee';
        break;
      case 'reaver':
        base.preferredAttack = 'attack_melee';
        break;
      case 'shade':
        base.speedMul = 1.3;
        base.ampMul = 0.85;
        base.preferredAttack = 'attack_melee';
        break;
      case 'warden':
        base.preferredAttack = 'attack_ranged';
        break;
      case 'corsair':
        base.preferredAttack = 'attack_ranged';
        break;
      case 'pyromancer':
        base.preferredAttack = 'cast';
        break;
      case 'void_weaver':
        base.preferredAttack = 'cast';
        break;
    }
  }

  if (cfg.type === 'enemy' && cfg.archetype) {
    switch (cfg.archetype) {
      case 'brute':
        base.speedMul = 0.67;  // 1/1.5 — slower
        base.ampMul = 1.5;
        break;
      case 'assassin':
        base.speedMul = 1.43;  // 1/0.7 — faster
        base.ampMul = 0.85;
        break;
      case 'guardian':
        base.speedMul = 1;
        base.ampMul = 0.8;
        break;
      case 'caster':
        base.preferredAttack = 'cast';
        break;
      case 'boss':
        base.ampMul = 1.3;
        break;
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// AnimationController
// ---------------------------------------------------------------------------

const NAMED_PARTS = [
  'body', 'head', 'leftArm', 'rightArm', 'weapon', 'shield',
  'staff', 'orb', 'ring', 'legs', 'hood', 'arrow',
] as const;

type PartName = (typeof NAMED_PARTS)[number];

const BLEND_DURATION = 0.15; // seconds for transition blending

export class AnimationController {
  private mesh: THREE.Group;
  private config: AnimationConfig;
  private tweak: AnimTweak;

  // Named parts cache
  private parts = new Map<PartName, THREE.Object3D>();
  private originals = new Map<PartName, PartSnapshot>();
  private groupOriginal: PartSnapshot;

  // Animation state
  private _currentAnimation: AnimationName = 'idle';
  private animationTime = 0;
  private blendRemaining = 0;
  private moveSpeed = 0;

  // Flash state
  private flashActive = false;
  private flashTimer = 0;
  private flashDur = 0;
  private flashCol = new THREE.Color();
  private originalEmissives = new Map<THREE.MeshStandardMaterial, THREE.Color>();

  // Death lock
  private dead = false;

  constructor(mesh: THREE.Group, config: AnimationConfig) {
    this.mesh = mesh;
    this.config = config;
    this.tweak = tweakForConfig(config);

    // Snapshot the group's own transform
    this.groupOriginal = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone(),
    };

    // Discover and snapshot named parts
    for (const name of NAMED_PARTS) {
      const obj = this.findPart(name);
      if (obj) {
        this.parts.set(name, obj);
        this.originals.set(name, {
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  play(name: AnimationName): void {
    if (this.dead && name !== 'death') return; // once dead, stay dead
    if (name === this._currentAnimation) return;
    this._currentAnimation = name;
    this.animationTime = 0;
    this.blendRemaining = BLEND_DURATION;
    if (name === 'death') this.dead = true;
  }

  update(dt: number): void {
    this.animationTime += dt;
    if (this.blendRemaining > 0) this.blendRemaining = Math.max(0, this.blendRemaining - dt);

    // Run the current animation's logic
    switch (this._currentAnimation) {
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'attack_melee':
        this.updateAttackMelee(dt);
        break;
      case 'attack_ranged':
        this.updateAttackRanged(dt);
        break;
      case 'cast':
        this.updateCast(dt);
        break;
      case 'hit':
        this.updateHit(dt);
        break;
      case 'death':
        this.updateDeath(dt);
        break;
    }

    // Flash overlay
    this.updateFlash(dt);
  }

  isPlaying(name: AnimationName): boolean {
    return this._currentAnimation === name;
  }

  get currentAnimation(): AnimationName {
    return this._currentAnimation;
  }

  setMoveSpeed(speed: number): void {
    this.moveSpeed = clamp(speed, 0, 1);
  }

  flashColor(color: number, duration = 0.15): void {
    this.flashActive = true;
    this.flashTimer = 0;
    this.flashDur = duration;
    this.flashCol.set(color);

    // Store original emissives
    this.originalEmissives.clear();
    for (const mat of this.getAllMaterials()) {
      this.originalEmissives.set(mat, mat.emissive.clone());
    }
  }

  // -----------------------------------------------------------------------
  // Part helpers
  // -----------------------------------------------------------------------

  private findPart(name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.mesh.traverse((child) => {
      if (child.name === name && !found) found = child;
    });
    return found;
  }

  private getPart(name: PartName): THREE.Object3D | null {
    return this.parts.get(name) ?? null;
  }

  private getOrig(name: PartName): PartSnapshot | null {
    return this.originals.get(name) ?? null;
  }

  private getAllMaterials(): THREE.MeshStandardMaterial[] {
    const mats: THREE.MeshStandardMaterial[] = [];
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        mats.push(child.material);
      }
    });
    return mats;
  }

  // Reset a single part to its original transform, optionally with a blend factor
  private resetPart(name: PartName, blend = 1): void {
    const part = this.getPart(name);
    const orig = this.getOrig(name);
    if (!part || !orig) return;
    if (blend >= 1) {
      part.position.copy(orig.position);
      part.rotation.copy(orig.rotation);
      part.scale.copy(orig.scale);
    } else {
      part.position.lerp(orig.position, blend);
      part.rotation.x = lerp(part.rotation.x, orig.rotation.x, blend);
      part.rotation.y = lerp(part.rotation.y, orig.rotation.y, blend);
      part.rotation.z = lerp(part.rotation.z, orig.rotation.z, blend);
      part.scale.lerp(orig.scale, blend);
    }
  }

  private resetGroup(blend = 1): void {
    const o = this.groupOriginal;
    if (blend >= 1) {
      this.mesh.position.copy(o.position);
      this.mesh.rotation.copy(o.rotation);
      this.mesh.scale.copy(o.scale);
    } else {
      this.mesh.position.lerp(o.position, blend);
      this.mesh.rotation.x = lerp(this.mesh.rotation.x, o.rotation.x, blend);
      this.mesh.rotation.y = lerp(this.mesh.rotation.y, o.rotation.y, blend);
      this.mesh.rotation.z = lerp(this.mesh.rotation.z, o.rotation.z, blend);
      this.mesh.scale.lerp(o.scale, blend);
    }
  }

  private resetAll(blend = 1): void {
    this.resetGroup(blend);
    for (const name of NAMED_PARTS) {
      this.resetPart(name, blend);
    }
  }

  private amp(v: number): number {
    return v * this.tweak.ampMul;
  }

  // -----------------------------------------------------------------------
  // IDLE
  // -----------------------------------------------------------------------

  private updateIdle(_dt: number): void {
    const t = this.animationTime;

    // Breathing — body scale.y oscillation
    const body = this.getPart('body');
    const bodyOrig = this.getOrig('body');
    if (body && bodyOrig) {
      const breathe = Math.sin((t / 3) * Math.PI * 2);
      body.scale.y = bodyOrig.scale.y * lerp(0.98, 1.02, (breathe + 1) / 2);
      body.position.copy(bodyOrig.position);
      body.rotation.copy(bodyOrig.rotation);
    }

    // Weapon bob
    const weapon = this.getPart('weapon');
    const weaponOrig = this.getOrig('weapon');
    if (weapon && weaponOrig) {
      const bob = Math.sin((t / 2.5) * Math.PI * 2);
      weapon.position.y = weaponOrig.position.y + this.amp(0.02) * bob;
    }

    // Staff bob
    const staff = this.getPart('staff');
    const staffOrig = this.getOrig('staff');
    if (staff && staffOrig) {
      const bob = Math.sin((t / 2.5) * Math.PI * 2);
      staff.position.y = staffOrig.position.y + this.amp(0.02) * bob;
    }

    // Orb float + spin
    const orb = this.getPart('orb');
    const orbOrig = this.getOrig('orb');
    if (orb && orbOrig) {
      const float = Math.sin((t / 2) * Math.PI * 2);
      orb.position.y = orbOrig.position.y + this.amp(0.05) * float;
      orb.rotation.y = orbOrig.rotation.y + t * 0.5;
    }

    // Ring emissive pulse
    const ring = this.getPart('ring');
    if (ring) {
      ring.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.emissive) {
            const pulse = (Math.sin((t / 2) * Math.PI * 2) + 1) / 2;
            child.material.emissiveIntensity = lerp(0.2, 0.4, pulse);
          }
        }
      });
    }

    // Head subtle tilt
    const head = this.getPart('head');
    const headOrig = this.getOrig('head');
    if (head && headOrig) {
      const tilt = Math.sin((t / 4) * Math.PI * 2);
      head.rotation.z = headOrig.rotation.z + this.amp(2 * DEG) * tilt;
    }

    // Reset everything else to originals (arms, legs, etc.)
    for (const name of NAMED_PARTS) {
      if (['body', 'weapon', 'staff', 'orb', 'ring', 'head'].includes(name)) continue;
      this.resetPart(name);
    }
    this.resetGroup();
  }

  // -----------------------------------------------------------------------
  // WALK
  // -----------------------------------------------------------------------

  private updateWalk(_dt: number): void {
    const t = this.animationTime;
    const ms = this.moveSpeed;

    // Body bob
    const body = this.getPart('body');
    const bodyOrig = this.getOrig('body');
    if (body && bodyOrig) {
      const bob = Math.sin((t / 0.4) * Math.PI * 2);
      body.position.y = bodyOrig.position.y + this.amp(0.04) * ms * bob;
      body.scale.copy(bodyOrig.scale);
      body.rotation.copy(bodyOrig.rotation);
    }

    // Arm swings
    const leftArm = this.getPart('leftArm');
    const leftArmOrig = this.getOrig('leftArm');
    if (leftArm && leftArmOrig) {
      const swing = Math.sin((t / 0.4) * Math.PI * 2);
      leftArm.rotation.x = leftArmOrig.rotation.x + this.amp(15 * DEG) * ms * swing;
    }

    const rightArm = this.getPart('rightArm');
    const rightArmOrig = this.getOrig('rightArm');
    if (rightArm && rightArmOrig) {
      const swing = Math.sin((t / 0.4) * Math.PI * 2);
      rightArm.rotation.x = rightArmOrig.rotation.x - this.amp(15 * DEG) * ms * swing; // opposite phase
    }

    // Legs lean forward
    const legs = this.getPart('legs');
    const legsOrig = this.getOrig('legs');
    if (legs && legsOrig) {
      legs.rotation.x = legsOrig.rotation.x - this.amp(5 * DEG) * ms;
    }

    // Weapon/staff follow arm
    const weapon = this.getPart('weapon');
    const weaponOrig = this.getOrig('weapon');
    if (weapon && weaponOrig) {
      const swing = Math.sin((t / 0.4) * Math.PI * 2);
      weapon.rotation.x = weaponOrig.rotation.x - this.amp(10 * DEG) * ms * swing;
    }

    const staff = this.getPart('staff');
    const staffOrig = this.getOrig('staff');
    if (staff && staffOrig) {
      const swing = Math.sin((t / 0.4) * Math.PI * 2);
      staff.rotation.x = staffOrig.rotation.x - this.amp(10 * DEG) * ms * swing;
    }

    // Head stable
    this.resetPart('head');
    this.resetGroup();
  }

  // -----------------------------------------------------------------------
  // ATTACK_MELEE (one-shot, 0.5s)
  // -----------------------------------------------------------------------

  private updateAttackMelee(_dt: number): void {
    const totalDuration = 0.5 / this.tweak.speedMul;
    const t = this.animationTime;
    const progress = clamp(t / totalDuration, 0, 1);

    // Phase boundaries (normalized)
    const p1End = 0.3;   // wind-up
    const p2End = 0.7;   // strike
    // p3 = 0.7-1.0       // recovery

    const rightArm = this.getPart('rightArm');
    const rightArmOrig = this.getOrig('rightArm');
    const weapon = this.getPart('weapon');
    const weaponOrig = this.getOrig('weapon');

    if (progress < p1End) {
      // Phase 1: Wind-up
      const p = easeInOutQuad(progress / p1End);

      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = rightArmOrig.rotation.x + this.amp(40 * DEG) * p;
      }
      if (weapon && weaponOrig) {
        weapon.rotation.x = weaponOrig.rotation.x + this.amp(40 * DEG) * p;
      }

      // Body leans back
      this.mesh.rotation.x = this.groupOriginal.rotation.x + this.amp(5 * DEG) * p;

    } else if (progress < p2End) {
      // Phase 2: Strike
      const localP = (progress - p1End) / (p2End - p1End);
      const p = easeOutCubic(localP);

      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = rightArmOrig.rotation.x + lerp(this.amp(40 * DEG), this.amp(-50 * DEG), p);
      }
      if (weapon && weaponOrig) {
        weapon.rotation.x = weaponOrig.rotation.x + lerp(this.amp(40 * DEG), this.amp(-50 * DEG), p);
      }

      // Body lunges forward
      this.mesh.position.z = this.groupOriginal.position.z - this.amp(0.15) * p;
      this.mesh.rotation.x = lerp(this.groupOriginal.rotation.x + this.amp(5 * DEG), this.groupOriginal.rotation.x, p);

    } else {
      // Phase 3: Recovery
      const localP = (progress - p2End) / (1 - p2End);
      const p = easeInOutQuad(localP);

      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = lerp(rightArmOrig.rotation.x + this.amp(-50 * DEG), rightArmOrig.rotation.x, p);
      }
      if (weapon && weaponOrig) {
        weapon.rotation.x = lerp(weaponOrig.rotation.x + this.amp(-50 * DEG), weaponOrig.rotation.x, p);
      }

      this.mesh.position.z = lerp(this.groupOriginal.position.z - this.amp(0.15), this.groupOriginal.position.z, p);
      this.mesh.rotation.x = this.groupOriginal.rotation.x;
    }

    // Return to idle when done
    if (t >= totalDuration) {
      this.resetAll();
      this._currentAnimation = 'idle';
      this.animationTime = 0;
    }
  }

  // -----------------------------------------------------------------------
  // ATTACK_RANGED (one-shot, 0.4s)
  // -----------------------------------------------------------------------

  private updateAttackRanged(_dt: number): void {
    const totalDuration = 0.4 / this.tweak.speedMul;
    const t = this.animationTime;
    const progress = clamp(t / totalDuration, 0, 1);

    const p1End = 0.375;  // draw
    const p2End = 0.625;  // release

    const leftArm = this.getPart('leftArm');
    const leftArmOrig = this.getOrig('leftArm');
    const rightArm = this.getPart('rightArm');
    const rightArmOrig = this.getOrig('rightArm');

    if (progress < p1End) {
      // Phase 1: Draw
      const p = easeInOutQuad(progress / p1End);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = leftArmOrig.rotation.x - this.amp(20 * DEG) * p;
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = rightArmOrig.rotation.x - this.amp(20 * DEG) * p;
      }
      // Body leans back
      this.mesh.rotation.x = this.groupOriginal.rotation.x + this.amp(5 * DEG) * p;

    } else if (progress < p2End) {
      // Phase 2: Release
      const localP = (progress - p1End) / (p2End - p1End);
      const p = easeOutCubic(localP);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = lerp(leftArmOrig.rotation.x - this.amp(20 * DEG), leftArmOrig.rotation.x + this.amp(10 * DEG), p);
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = lerp(rightArmOrig.rotation.x - this.amp(20 * DEG), rightArmOrig.rotation.x + this.amp(10 * DEG), p);
      }
      // Body leans forward
      this.mesh.rotation.x = lerp(this.groupOriginal.rotation.x + this.amp(5 * DEG), this.groupOriginal.rotation.x - this.amp(3 * DEG), p);

    } else {
      // Phase 3: Recovery
      const localP = (progress - p2End) / (1 - p2End);
      const p = easeInOutQuad(localP);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = lerp(leftArmOrig.rotation.x + this.amp(10 * DEG), leftArmOrig.rotation.x, p);
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = lerp(rightArmOrig.rotation.x + this.amp(10 * DEG), rightArmOrig.rotation.x, p);
      }
      this.mesh.rotation.x = lerp(this.groupOriginal.rotation.x - this.amp(3 * DEG), this.groupOriginal.rotation.x, p);
    }

    if (t >= totalDuration) {
      this.resetAll();
      this._currentAnimation = 'idle';
      this.animationTime = 0;
    }
  }

  // -----------------------------------------------------------------------
  // CAST (one-shot, 0.5s)
  // -----------------------------------------------------------------------

  private updateCast(_dt: number): void {
    const totalDuration = 0.5 / this.tweak.speedMul;
    const t = this.animationTime;
    const progress = clamp(t / totalDuration, 0, 1);

    const p1End = 0.4;   // channel
    const p2End = 0.7;   // release

    const leftArm = this.getPart('leftArm');
    const leftArmOrig = this.getOrig('leftArm');
    const rightArm = this.getPart('rightArm');
    const rightArmOrig = this.getOrig('rightArm');
    const staff = this.getPart('staff');
    const staffOrig = this.getOrig('staff');
    const orb = this.getPart('orb');

    const isMagicClass =
      this.config.playerClass === 'pyromancer' ||
      this.config.playerClass === 'void_weaver' ||
      this.config.archetype === 'caster';

    if (progress < p1End) {
      // Phase 1: Channel
      const p = easeInOutQuad(progress / p1End);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = leftArmOrig.rotation.x - this.amp(35 * DEG) * p;
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = rightArmOrig.rotation.x - this.amp(35 * DEG) * p;
      }
      if (staff && staffOrig) {
        staff.position.y = staffOrig.position.y + this.amp(0.1) * p;
      }

      // Orb glow
      if (orb) {
        orb.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = lerp(0.3, 1.0, p);
            // Pulse for magic classes
            if (isMagicClass) {
              const pulse = Math.sin(t * 12) * 0.2;
              child.material.emissiveIntensity += pulse;
            }
          }
        });
      }

    } else if (progress < p2End) {
      // Phase 2: Release
      const localP = (progress - p1End) / (p2End - p1End);
      const p = easeOutCubic(localP);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = lerp(leftArmOrig.rotation.x - this.amp(35 * DEG), leftArmOrig.rotation.x + this.amp(10 * DEG), p);
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = lerp(rightArmOrig.rotation.x - this.amp(35 * DEG), rightArmOrig.rotation.x + this.amp(10 * DEG), p);
      }
      // Body leans forward
      this.mesh.rotation.x = this.groupOriginal.rotation.x - this.amp(5 * DEG) * p;

      if (staff && staffOrig) {
        staff.position.y = lerp(staffOrig.position.y + this.amp(0.1), staffOrig.position.y, p);
      }

      // Orb flash
      if (orb) {
        orb.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = lerp(1.5, 0.5, p);
          }
        });
      }

    } else {
      // Phase 3: Recovery
      const localP = (progress - p2End) / (1 - p2End);
      const p = easeInOutQuad(localP);

      if (leftArm && leftArmOrig) {
        leftArm.rotation.x = lerp(leftArmOrig.rotation.x + this.amp(10 * DEG), leftArmOrig.rotation.x, p);
      }
      if (rightArm && rightArmOrig) {
        rightArm.rotation.x = lerp(rightArmOrig.rotation.x + this.amp(10 * DEG), rightArmOrig.rotation.x, p);
      }
      this.mesh.rotation.x = lerp(this.groupOriginal.rotation.x - this.amp(5 * DEG), this.groupOriginal.rotation.x, p);

      // Restore orb emissive
      if (orb) {
        orb.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = lerp(0.5, 0.3, p);
          }
        });
      }
    }

    if (t >= totalDuration) {
      this.resetAll();
      this._currentAnimation = 'idle';
      this.animationTime = 0;
    }
  }

  // -----------------------------------------------------------------------
  // HIT (one-shot, 0.3s)
  // -----------------------------------------------------------------------

  private updateHit(_dt: number): void {
    const totalDuration = 0.3;
    const t = this.animationTime;
    const progress = clamp(t / totalDuration, 0, 1);

    const p1End = 0.333; // impact

    if (progress < p1End) {
      // Phase 1: Impact
      const p = easeOutCubic(progress / p1End);

      this.mesh.rotation.x = this.groupOriginal.rotation.x + this.amp(10 * DEG) * p;
      this.mesh.position.z = this.groupOriginal.position.z + this.amp(0.08) * p;

      // Flash red
      for (const mat of this.getAllMaterials()) {
        mat.emissive.set(0xff0000);
        mat.emissiveIntensity = 0.5 * p;
      }

    } else {
      // Phase 2: Recovery
      const localP = (progress - p1End) / (1 - p1End);
      const p = easeInOutQuad(localP);

      this.mesh.rotation.x = lerp(this.groupOriginal.rotation.x + this.amp(10 * DEG), this.groupOriginal.rotation.x, p);
      this.mesh.position.z = lerp(this.groupOriginal.position.z + this.amp(0.08), this.groupOriginal.position.z, p);

      // Fade emissive back
      for (const mat of this.getAllMaterials()) {
        mat.emissiveIntensity = lerp(0.5, 0, p);
      }
    }

    if (t >= totalDuration) {
      // Restore emissives
      for (const mat of this.getAllMaterials()) {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
      this.resetAll();
      this._currentAnimation = 'idle';
      this.animationTime = 0;
    }
  }

  // -----------------------------------------------------------------------
  // DEATH (one-shot, 1.0s, stays in death state)
  // -----------------------------------------------------------------------

  private updateDeath(_dt: number): void {
    const totalDuration = 1.0;
    const t = clamp(this.animationTime, 0, totalDuration);
    const progress = t / totalDuration;

    const p1End = 0.3; // stagger

    if (progress < p1End) {
      // Phase 1: Stagger
      const p = easeOutCubic(progress / p1End);

      this.mesh.rotation.x = this.groupOriginal.rotation.x + this.amp(20 * DEG) * p;

      // Arms go limp
      const leftArm = this.getPart('leftArm');
      const leftArmOrig = this.getOrig('leftArm');
      if (leftArm && leftArmOrig) {
        leftArm.rotation.z = leftArmOrig.rotation.z - this.amp(30 * DEG) * p;
      }

      const rightArm = this.getPart('rightArm');
      const rightArmOrig = this.getOrig('rightArm');
      if (rightArm && rightArmOrig) {
        rightArm.rotation.z = rightArmOrig.rotation.z + this.amp(30 * DEG) * p;
      }

    } else {
      // Phase 2: Collapse
      const localP = (progress - p1End) / (1 - p1End);
      const p = easeInOutQuad(localP);

      // Keep stagger values
      this.mesh.rotation.x = this.groupOriginal.rotation.x + this.amp(20 * DEG);

      const leftArm = this.getPart('leftArm');
      const leftArmOrig = this.getOrig('leftArm');
      if (leftArm && leftArmOrig) {
        leftArm.rotation.z = leftArmOrig.rotation.z - this.amp(30 * DEG);
      }

      const rightArm = this.getPart('rightArm');
      const rightArmOrig = this.getOrig('rightArm');
      if (rightArm && rightArmOrig) {
        rightArm.rotation.z = rightArmOrig.rotation.z + this.amp(30 * DEG);
      }

      // Scale.y shrinks, position.y drops
      this.mesh.scale.y = lerp(this.groupOriginal.scale.y, this.groupOriginal.scale.y * 0.1, p);
      this.mesh.position.y = lerp(this.groupOriginal.position.y, this.groupOriginal.position.y - 0.3, p);

      // Fade opacity
      for (const mat of this.getAllMaterials()) {
        mat.transparent = true;
        mat.opacity = lerp(1, 0, p);
      }
    }

    // Death does NOT return to idle
  }

  // -----------------------------------------------------------------------
  // Flash overlay
  // -----------------------------------------------------------------------

  private updateFlash(dt: number): void {
    if (!this.flashActive) return;
    this.flashTimer += dt;

    if (this.flashTimer >= this.flashDur) {
      // Restore original emissives
      for (const [mat, orig] of this.originalEmissives) {
        mat.emissive.copy(orig);
      }
      this.flashActive = false;
      this.originalEmissives.clear();
      return;
    }

    const p = this.flashTimer / this.flashDur;
    for (const [mat, orig] of this.originalEmissives) {
      mat.emissive.lerpColors(this.flashCol, orig, easeInOutQuad(p));
      mat.emissiveIntensity = lerp(0.6, 0, p);
    }
  }
}
