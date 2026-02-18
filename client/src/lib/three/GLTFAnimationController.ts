import * as THREE from 'three';
import type { AnimationName } from './AnimationSystem';

// ---------------------------------------------------------------------------
// Map our game animation names → GLTF clip names
// ---------------------------------------------------------------------------

const DEFAULT_ANIM_MAP: Record<AnimationName, string> = {
  idle: 'Idle',
  walk: 'Walk',
  attack_melee: 'Attack',
  attack_ranged: 'Attack',
  cast: 'Attack',
  hit: 'HitRecieve',   // note: typo is in the original GLTF data
  death: 'Death',
};

/** Sentinel-specific animation map (multi-file clips keyed by short name) */
export const SENTINEL_ANIM_MAP: Record<AnimationName, string> = {
  idle: 'Combat_Stance',
  walk: 'Walking',
  attack_melee: 'Punch_Combo',
  attack_ranged: 'Punch_Combo',
  cast: 'Chest_Pound_Taunt',
  hit: 'Basic_Jump',
  death: 'Basic_Jump',
};

/** Extra clip name for walk/run blending (sentinel uses Running for fast walk) */
const SENTINEL_RUN_CLIP = 'Running';

// ---------------------------------------------------------------------------
// GLTFAnimationController — wraps THREE.AnimationMixer to match the
// same public API as the procedural AnimationController.
// ---------------------------------------------------------------------------

export class GLTFAnimationController {
  private mesh: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private clips: Map<string, THREE.AnimationClip>;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private animMap: Record<AnimationName, string>;
  private runClipName: string;

  private _currentAnimation: AnimationName = 'idle';
  private dead = false;
  private moveSpeed = 0;

  // Flash state
  private flashActive = false;
  private flashTimer = 0;
  private flashDur = 0;
  private flashCol = new THREE.Color();
  private originalEmissives = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; intensity: number }>();

  constructor(
    mesh: THREE.Group,
    mixer: THREE.AnimationMixer,
    clips: Map<string, THREE.AnimationClip>,
    animMap?: Record<AnimationName, string>,
  ) {
    this.mesh = mesh;
    this.mixer = mixer;
    this.clips = clips;
    this.animMap = animMap ?? DEFAULT_ANIM_MAP;
    this.runClipName = animMap === SENTINEL_ANIM_MAP ? SENTINEL_RUN_CLIP : 'Run';

    // Pre-create all actions
    for (const [name, clip] of clips) {
      const action = mixer.clipAction(clip);
      this.actions.set(name, action);
    }

    // Determine which clip names are one-shot (attack, hit, death mappings)
    const oneShotAnims: AnimationName[] = ['attack_melee', 'attack_ranged', 'cast', 'hit', 'death'];
    const oneShotClipNames = new Set(oneShotAnims.map((n) => this.animMap[n]));
    for (const clipName of oneShotClipNames) {
      const action = this.actions.get(clipName);
      if (action) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
    }

    // The idle clip name — one-shots return to this
    const idleClipName = this.animMap.idle;
    const deathClipName = this.animMap.death;

    // Listen for finished events to return to idle
    mixer.addEventListener('finished', (e: any) => {
      const finishedClip = e.action.getClip().name;
      if (finishedClip === deathClipName) return; // stay dead
      // Any one-shot that finishes → return to idle
      if (oneShotClipNames.has(finishedClip) && finishedClip !== idleClipName) {
        this.play('idle');
      }
    });
  }

  // -----------------------------------------------------------------------
  // Public API (matches AnimationController interface)
  // -----------------------------------------------------------------------

  play(name: AnimationName): void {
    if (this.dead && name !== 'death') return;
    if (name === this._currentAnimation && name !== 'attack_melee' && name !== 'cast' && name !== 'hit') return;

    const clipName = this.animMap[name];
    const action = this.actions.get(clipName);
    if (!action) return;

    // Cross-fade from current to new
    const prevClipName = this.animMap[this._currentAnimation];
    const prevAction = this.actions.get(prevClipName);

    if (prevAction && prevAction !== action) {
      prevAction.fadeOut(0.2);
    }

    // Reset one-shot animations so they play from the start
    if (name === 'attack_melee' || name === 'attack_ranged' || name === 'cast' || name === 'hit' || name === 'death') {
      action.reset();
    }

    action.fadeIn(0.2);
    action.play();

    this._currentAnimation = name;
    if (name === 'death') this.dead = true;
  }

  update(dt: number): void {
    // Adjust walk/run animation speed based on movement
    if (this._currentAnimation === 'walk') {
      const walkClipName = this.animMap.walk;
      const walkAction = this.actions.get(walkClipName);
      const runAction = this.actions.get(this.runClipName);

      if (runAction && walkAction) {
        // Blend between walk and run based on speed
        if (this.moveSpeed > 0.6) {
          if (!runAction.isRunning()) {
            walkAction.fadeOut(0.3);
            runAction.reset().fadeIn(0.3).play();
          }
        } else if (runAction.isRunning()) {
          runAction.fadeOut(0.3);
          walkAction.reset().fadeIn(0.3).play();
        }
      }
    }

    // Tick the mixer
    this.mixer.update(dt);

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
    this.moveSpeed = Math.max(0, Math.min(1, speed));
  }

  flashColor(color: number, duration = 0.15): void {
    this.flashActive = true;
    this.flashTimer = 0;
    this.flashDur = duration;
    this.flashCol.set(color);

    // Store original emissives
    this.originalEmissives.clear();
    for (const mat of this.getAllMaterials()) {
      this.originalEmissives.set(mat, {
        color: mat.emissive.clone(),
        intensity: mat.emissiveIntensity,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getAllMaterials(): THREE.MeshStandardMaterial[] {
    const mats: THREE.MeshStandardMaterial[] = [];
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        mats.push(child.material);
      }
    });
    return mats;
  }

  private updateFlash(dt: number): void {
    if (!this.flashActive) return;
    this.flashTimer += dt;

    if (this.flashTimer >= this.flashDur) {
      // Restore originals
      for (const [mat, orig] of this.originalEmissives) {
        mat.emissive.copy(orig.color);
        mat.emissiveIntensity = orig.intensity;
      }
      this.flashActive = false;
      this.originalEmissives.clear();
      return;
    }

    const p = this.flashTimer / this.flashDur;
    for (const [mat, orig] of this.originalEmissives) {
      mat.emissive.lerpColors(this.flashCol, orig.color, p);
      mat.emissiveIntensity = THREE.MathUtils.lerp(0.8, orig.intensity, p);
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mesh);
  }
}
