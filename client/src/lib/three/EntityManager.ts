import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { RealtimeEnemyState, RealtimeResourceState } from '../stores/realtimeStore.svelte';
import { arenaToWorld } from './DungeonBuilder';
import { createResourceMaterial, getResourceColor } from './materials';
import { createEnemyMesh } from './CharacterFactory';
import { AnimationController } from './AnimationSystem';
import { GLTFAnimationController } from './GLTFAnimationController';
import { createGLTFEnemySync, isModelCached, preloadEnemyModels } from './GLTFEnemyLoader';
import type { ParticleSystem } from './ParticleSystem';
import type { EnemyArchetype, ElementType, GroundLootItem } from '../stores/types';
import type { AnimationName } from './AnimationSystem';
import type { FogOfWar } from './FogOfWar';
import { worldToArena } from './DungeonBuilder';

/** Common animation interface satisfied by both controller types */
interface EnemyAnimController {
  play(name: AnimationName): void;
  update(dt: number): void;
  isPlaying(name: AnimationName): boolean;
  readonly currentAnimation: AnimationName;
  setMoveSpeed(speed: number): void;
  flashColor(color: number, duration?: number): void;
}

interface EnemyMesh {
  group: THREE.Group;
  hitbox: THREE.Mesh;       // invisible sphere for easier click targeting
  label: CSS2DObject;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  hp: number;
  maxHp: number;
  animation: EnemyAnimController;
  archetype: EnemyArchetype;
  aiState: string;
}

interface ResourceMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  label: CSS2DObject;
  isGathered: boolean;
  fadeAlpha: number;
}

interface GroundLootMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  label: CSS2DObject;
  pickedUp: boolean;
  fadeAlpha: number;
}

function createEnemyLabelElement(name: string): HTMLDivElement {
  const labelDiv = document.createElement('div');
  labelDiv.className = 'enemy-label-3d';

  const nameEl = document.createElement('div');
  nameEl.className = 'enemy-name';
  nameEl.textContent = name;
  labelDiv.appendChild(nameEl);

  const hpBar = document.createElement('div');
  hpBar.className = 'enemy-hp-bar';
  const hpFill = document.createElement('div');
  hpFill.className = 'enemy-hp-fill';
  hpFill.style.width = '100%';
  hpBar.appendChild(hpFill);
  labelDiv.appendChild(hpBar);

  return labelDiv;
}

export class EntityManager {
  private scene: THREE.Scene;
  private enemies: Map<string, EnemyMesh> = new Map();
  private dying: { enemy: EnemyMesh; timer: number; burstDone: boolean }[] = [];
  private resources: Map<string, ResourceMesh> = new Map();
  private lootItems: Map<string, GroundLootMesh> = new Map();
  private css2DRenderer: CSS2DRenderer;
  private torchRadius: number;
  private particles: ParticleSystem | null = null;
  private gltfReady = false;
  private fogOfWar: FogOfWar | null = null;

  // Shared hitbox geometry/material (invisible, for click targeting)
  private hitboxGeo = new THREE.SphereGeometry(1.8, 8, 6);
  private hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

  // Target circle that shows under the currently targeted enemy
  private targetCircle: THREE.Mesh;
  private targetCircleId: string | null = null;

  private static RARITY_COLORS: Record<string, number> = {
    common: 0xaaaaaa,
    uncommon: 0x2ecc71,
    rare: 0x3498db,
    legendary: 0xf39c12,
    cursed: 0x9b59b6,
  };

  constructor(scene: THREE.Scene, container: HTMLElement, particleSystem?: ParticleSystem) {
    this.scene = scene;
    this.torchRadius = 26; // Same as light distance
    this.particles = particleSystem ?? null;

    // Pre-load GLTF enemy models in background
    preloadEnemyModels()
      .then(() => {
        this.gltfReady = true;
        console.log('[EntityManager] GLTF enemy models loaded');
      })
      .catch((err) => {
        console.warn('[EntityManager] GLTF load failed, falling back to procedural:', err);
      });

    // Target circle (red ring on ground under targeted enemy)
    const targetRingGeo = new THREE.RingGeometry(1.2, 1.5, 32);
    targetRingGeo.rotateX(-Math.PI / 2);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.targetCircle = new THREE.Mesh(targetRingGeo, targetRingMat);
    this.targetCircle.position.y = 0.05;
    this.targetCircle.visible = false;
    this.targetCircle.renderOrder = 1;
    scene.add(this.targetCircle);

    // CSS2D renderer for floating labels
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2DRenderer.domElement.style.position = 'absolute';
    this.css2DRenderer.domElement.style.top = '0';
    this.css2DRenderer.domElement.style.left = '0';
    this.css2DRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.css2DRenderer.domElement);
  }

  setFogOfWar(fow: FogOfWar) {
    this.fogOfWar = fow;
  }

  updateEnemies(enemyStates: RealtimeEnemyState[], playerWorldPos: THREE.Vector3) {
    const activeIds = new Set<string>();

    for (const state of enemyStates) {
      activeIds.add(state.id);
      const world = arenaToWorld(state.x, state.y);

      let enemy = this.enemies.get(state.id);
      if (!enemy) {
        enemy = this.createEnemy(state);
        this.enemies.set(state.id, enemy);
      }

      // Update target position
      enemy.targetPos.set(world.x, 0, world.z);

      // Detect HP change for hit animation
      if (state.hp < enemy.hp && enemy.hp > 0) {
        enemy.animation.play('hit');
      }

      enemy.hp = state.hp;
      enemy.maxHp = state.maxHp;

      // Detect AI state changes for animations
      if (state.aiState !== enemy.aiState) {
        if (state.aiState === 'attack' && enemy.aiState !== 'attack') {
          // Enemy started attacking
          const isCaster = state.archetype === 'caster';
          enemy.animation.play(isCaster ? 'cast' : 'attack_melee');
        } else if (state.aiState === 'chase' && enemy.aiState !== 'chase') {
          enemy.animation.play('walk');
        } else if (state.aiState === 'patrol' && enemy.aiState !== 'patrol') {
          enemy.animation.play('idle');
        }
        enemy.aiState = state.aiState;
      }

      // Update label
      this.updateEnemyLabel(enemy, state);

      // Fog of war visibility check
      if (this.fogOfWar) {
        enemy.group.visible = this.fogOfWar.isRevealed(state.x, state.y);
      } else {
        enemy.group.visible = true;
      }
    }

    // Move dead enemies to dying list so their death animation keeps updating
    for (const [id, enemy] of this.enemies) {
      if (!activeIds.has(id)) {
        enemy.animation.play('death');
        // Zero out HP bar before hiding to prevent leftover sliver
        enemy.hp = 0;
        const fill = enemy.label.element.querySelector('.enemy-hp-fill') as HTMLElement;
        if (fill) fill.style.width = '0%';
        // Hide the HP label immediately
        enemy.label.element.style.display = 'none';
        this.dying.push({ enemy, timer: 0, burstDone: false });
        this.enemies.delete(id);
      }
    }
  }

  updateResources(resourceStates: RealtimeResourceState[], playerWorldPos: THREE.Vector3) {
    const activeIds = new Set<string>();

    for (const state of resourceStates) {
      activeIds.add(state.id);

      let resource = this.resources.get(state.id);
      if (!resource) {
        resource = this.createResource(state);
        this.resources.set(state.id, resource);
      }

      // Handle gathering fade
      if (state.isGathered && !resource.isGathered) {
        resource.isGathered = true;
      }

      // Fog of war + gathered visibility
      const fowVisible = this.fogOfWar ? this.fogOfWar.isRevealed(state.x, state.y) : true;
      resource.group.visible = !state.isGathered && fowVisible;
    }

    // Remove resources no longer in state
    for (const [id, resource] of this.resources) {
      if (!activeIds.has(id)) {
        this.disposeResource(resource);
        this.resources.delete(id);
      }
    }
  }

  updateGroundLoot(lootStates: GroundLootItem[], playerWorldPos: THREE.Vector3) {
    const activeIds = new Set<string>();

    for (const state of lootStates) {
      if (state.pickedUp) continue;
      activeIds.add(state.id);

      let loot = this.lootItems.get(state.id);
      if (!loot) {
        loot = this.createLootItem(state);
        this.lootItems.set(state.id, loot);
      }

      // Fog of war visibility check for loot
      if (this.fogOfWar) {
        loot.group.visible = this.fogOfWar.isRevealed(state.x, state.y);
      } else {
        loot.group.visible = true;
      }
    }

    // Remove picked-up or gone loot
    for (const [id, loot] of this.lootItems) {
      if (!activeIds.has(id)) {
        loot.pickedUp = true;
      }
    }
  }

  private createLootItem(state: GroundLootItem): GroundLootMesh {
    const group = new THREE.Group();
    const world = arenaToWorld(state.x, state.y);

    const isHealing = !!(state as any).isHealing;
    const color = isHealing ? 0x00ff88 : (EntityManager.RARITY_COLORS[state.rarity] || 0xaaaaaa);
    const radius = isHealing ? 0.25 : 0.18;

    // Small glowing sphere (larger + greener for healing)
    const geo = new THREE.SphereGeometry(radius, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isHealing ? 1.0 : 0.6,
      transparent: true,
      opacity: 1.0,
    });
    const body = new THREE.Mesh(geo, mat);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);

    // Brighter glow
    const glow = new THREE.PointLight(color, 0.8, 2.5);
    glow.position.set(0, 0.3, 0);
    group.add(glow);

    // Label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'loot-label-3d';
    labelDiv.textContent = state.itemName;
    labelDiv.style.color = `#${color.toString(16).padStart(6, '0')}`;
    labelDiv.style.fontSize = '11px';
    labelDiv.style.fontFamily = "'Cinzel', serif";
    labelDiv.style.textShadow = '0 1px 3px rgba(0,0,0,0.9)';
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 0.7, 0);
    group.add(label);

    group.position.set(world.x, 0, world.z);
    this.scene.add(group);

    return { group, body, label, pickedUp: false, fadeAlpha: 1.0 };
  }

  private disposeLootItem(loot: GroundLootMesh) {
    loot.body.geometry.dispose();
    (loot.body.material as THREE.Material).dispose();
    loot.label.element.remove();
    loot.group.removeFromParent();
  }

  // Pre-allocated temp vectors to avoid GC pressure in render loop
  private _prevPos = new THREE.Vector3();
  private _dir = new THREE.Vector3();

  // Lerp positions each frame
  update(dt: number, camera: THREE.PerspectiveCamera) {
    const lerpFactor = Math.min(1, dt * 20);

    for (const enemy of this.enemies.values()) {
      // Movement
      this._prevPos.copy(enemy.currentPos);
      enemy.currentPos.lerp(enemy.targetPos, lerpFactor);
      enemy.group.position.copy(enemy.currentPos);

      // Face movement direction (or face camera if stationary)
      const moveDist = enemy.currentPos.distanceTo(this._prevPos);
      if (moveDist > 0.01) {
        this._dir.subVectors(enemy.targetPos, enemy.currentPos);
        if (this._dir.length() > 0.01) {
          enemy.group.rotation.y = Math.atan2(this._dir.x, this._dir.z);
        }
      }

      // Update move speed for animation
      const moveSpeed = moveDist / Math.max(dt, 0.001);
      enemy.animation.setMoveSpeed(Math.min(moveSpeed / 2, 1));

      // Update animation
      enemy.animation.update(dt);
    }

    // Update dying enemies (play death animation, then dispose)
    const DEATH_DURATION = 3.0; // seconds — body lingers before disposal
    this.dying = this.dying.filter((entry) => {
      entry.timer += dt;
      entry.enemy.animation.update(dt);

      // Emit particle burst at the collapse phase (~0.4s in)
      if (!entry.burstDone && entry.timer > 0.4 && this.particles) {
        entry.burstDone = true;
        const pos = entry.enemy.group.position;
        this.particles.emitBurst(
          new THREE.Vector3(pos.x, 1.0, pos.z),
          0xff4400, 20, 1.5,
        );
      }

      if (entry.timer >= DEATH_DURATION) {
        this.disposeEnemy(entry.enemy);
        return false;
      }
      return true;
    });

    // Animate resources (gentle bob)
    const time = performance.now() * 0.001;
    for (const resource of this.resources.values()) {
      if (resource.isGathered) {
        resource.fadeAlpha = Math.max(0, resource.fadeAlpha - dt * 2);
        if (resource.body.material instanceof THREE.MeshStandardMaterial) {
          resource.body.material.opacity = resource.fadeAlpha;
        }
        if (resource.fadeAlpha <= 0) {
          resource.group.visible = false;
        }
      } else {
        resource.body.position.y = 0.5 + Math.sin(time * 2 + resource.group.id) * 0.1;
        resource.body.rotation.y += dt * 0.5;
      }
    }

    // Animate ground loot (bob + rotate + fade on pickup)
    for (const [id, loot] of this.lootItems) {
      if (loot.pickedUp) {
        loot.fadeAlpha = Math.max(0, loot.fadeAlpha - dt * 3);
        if (loot.body.material instanceof THREE.MeshStandardMaterial) {
          loot.body.material.opacity = loot.fadeAlpha;
        }
        loot.label.element.style.opacity = String(loot.fadeAlpha);
        if (loot.fadeAlpha <= 0) {
          this.disposeLootItem(loot);
          this.lootItems.delete(id);
        }
      } else {
        loot.body.position.y = 0.3 + Math.sin(time * 3 + loot.group.id) * 0.08;
        loot.body.rotation.y += dt * 1.5;
      }
    }

    // Update target circle position & pulse
    if (this.targetCircleId) {
      const target = this.enemies.get(this.targetCircleId);
      if (target && target.group.visible) {
        this.targetCircle.visible = true;
        this.targetCircle.position.set(target.currentPos.x, 0.05, target.currentPos.z);
        // Gentle pulse
        const pulse = 1.0 + Math.sin(time * 4) * 0.08;
        this.targetCircle.scale.setScalar(pulse);
        // Rotate slowly
        this.targetCircle.rotation.y += dt * 0.5;
      } else {
        this.targetCircle.visible = false;
      }
    } else {
      this.targetCircle.visible = false;
    }

    // Render CSS2D labels
    this.css2DRenderer.render(this.scene, camera);
  }

  private createEnemy(state: RealtimeEnemyState): EnemyMesh {
    const world = arenaToWorld(state.x, state.y);
    const archetype = state.archetype as EnemyArchetype;

    // Outer wrapper for world positioning — animation never touches this
    const wrapper = new THREE.Group();
    wrapper.name = `enemy_wrapper_${state.id}`;
    wrapper.position.set(world.x, 0, world.z);

    let animation: EnemyAnimController;

    // Invisible hitbox sphere for click targeting (larger than visual mesh)
    const hitbox = new THREE.Mesh(this.hitboxGeo, this.hitboxMat);
    hitbox.position.y = 1.0; // center at torso height
    wrapper.add(hitbox);

    // Use GLTF model if loaded, otherwise fall back to procedural
    if (this.gltfReady && isModelCached(archetype)) {
      const instance = createGLTFEnemySync(archetype);
      wrapper.add(instance.group);

      // GLTF label sits higher because models are taller with scale
      const labelDiv = createEnemyLabelElement(state.name);
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, 3.2, 0);
      wrapper.add(label);

      animation = new GLTFAnimationController(instance.group, instance.mixer, instance.clips);
      animation.play('idle');

      this.scene.add(wrapper);

      return {
        group: wrapper,
        hitbox,
        label,
        targetPos: new THREE.Vector3(world.x, 0, world.z),
        currentPos: new THREE.Vector3(world.x, 0, world.z),
        hp: state.hp,
        maxHp: state.maxHp,
        animation,
        archetype,
        aiState: state.aiState,
      };
    }

    // Fallback: procedural mesh
    const inner = createEnemyMesh(archetype, state.element as ElementType);
    inner.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    wrapper.add(inner);

    const labelDiv = createEnemyLabelElement(state.name);
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 2.5, 0);
    wrapper.add(label);

    this.scene.add(wrapper);

    animation = new AnimationController(inner, {
      type: 'enemy',
      archetype,
    });
    animation.play('idle');

    return {
      group: wrapper,
      hitbox,
      label,
      targetPos: new THREE.Vector3(world.x, 0, world.z),
      currentPos: new THREE.Vector3(world.x, 0, world.z),
      hp: state.hp,
      maxHp: state.maxHp,
      animation,
      archetype,
      aiState: state.aiState,
    };
  }

  private updateEnemyLabel(enemy: EnemyMesh, state: RealtimeEnemyState) {
    const fill = enemy.label.element.querySelector('.enemy-hp-fill') as HTMLElement;
    if (fill) {
      const pct = Math.max(0, (state.hp / state.maxHp) * 100);
      fill.style.width = `${pct}%`;
      fill.style.background = pct > 50 ? '#ff3333' : pct > 25 ? '#ff6600' : '#ff0000';
    }
  }

  private createResource(state: RealtimeResourceState): ResourceMesh {
    const group = new THREE.Group();
    const world = arenaToWorld(state.x, state.y);

    // Crystal/orb mesh
    const geo = new THREE.OctahedronGeometry(0.3, 1);
    const mat = createResourceMaterial(state.resourceId);
    const body = new THREE.Mesh(geo, mat);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // Glow point light
    const { color } = getResourceColor(state.resourceId);
    const glow = new THREE.PointLight(color, 0.5, 3);
    glow.position.set(0, 0.5, 0);
    group.add(glow);

    // Name label (safe DOM, textContent only)
    const labelDiv = document.createElement('div');
    labelDiv.className = 'resource-label-3d';
    labelDiv.textContent = state.name;
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 1.0, 0);
    group.add(label);

    group.position.set(world.x, 0, world.z);
    this.scene.add(group);

    return { group, body, label, isGathered: false, fadeAlpha: 1.0 };
  }

  private disposeEnemy(enemy: EnemyMesh) {
    enemy.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    enemy.label.element.remove();
    enemy.group.removeFromParent();
  }

  private disposeResource(resource: ResourceMesh) {
    resource.body.geometry.dispose();
    (resource.body.material as THREE.Material).dispose();
    resource.label.element.remove();
    resource.group.removeFromParent();
  }

  /** Set which enemy is currently targeted (shows red circle). */
  setTargetedEnemy(id: string | null) {
    this.targetCircleId = id;
  }

  /** Raycast against enemy hitbox spheres. Returns closest hit. */
  raycastEnemy(raycaster: THREE.Raycaster): { id: string; position: THREE.Vector3 } | null {
    const hitboxes: THREE.Mesh[] = [];
    const meshToId = new Map<THREE.Mesh, string>();

    for (const [id, enemy] of this.enemies) {
      if (!enemy.group.visible) continue;
      enemy.hitbox.updateWorldMatrix(true, false);
      hitboxes.push(enemy.hitbox);
      meshToId.set(enemy.hitbox, id);
    }

    const hits = raycaster.intersectObjects(hitboxes, false);
    if (hits.length > 0) {
      const id = meshToId.get(hits[0].object as THREE.Mesh);
      if (id) {
        const enemy = this.enemies.get(id)!;
        return { id, position: enemy.currentPos.clone() };
      }
    }
    return null;
  }

  /** Get the current world position of an enemy by id, or null if gone. */
  getEnemyPosition(id: string): THREE.Vector3 | null {
    const enemy = this.enemies.get(id);
    return enemy ? enemy.currentPos.clone() : null;
  }

  resize(width: number, height: number) {
    this.css2DRenderer.setSize(width, height);
  }

  dispose() {
    for (const enemy of this.enemies.values()) this.disposeEnemy(enemy);
    for (const { enemy } of this.dying) this.disposeEnemy(enemy);
    for (const resource of this.resources.values()) this.disposeResource(resource);
    for (const loot of this.lootItems.values()) this.disposeLootItem(loot);
    this.enemies.clear();
    this.dying = [];
    this.resources.clear();
    this.lootItems.clear();
    this.css2DRenderer.domElement.remove();

    // Dispose shared hitbox + target circle resources
    this.hitboxGeo.dispose();
    this.hitboxMat.dispose();
    (this.targetCircle.geometry as THREE.BufferGeometry).dispose();
    (this.targetCircle.material as THREE.Material).dispose();
    this.targetCircle.removeFromParent();
  }
}
