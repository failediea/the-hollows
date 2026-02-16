import * as THREE from 'three';
import { realtimeStore } from '../stores/realtimeStore.svelte';
import { buildDungeon, disposeDungeon, arenaToWorld, type DungeonGeometry } from './DungeonBuilder';
import { PlayerController } from './PlayerController';
import { EntityManager } from './EntityManager';
import { createDungeonLighting, updateTorchPosition, flickerTorch, updateZoneLighting, getZoneFogConfig, type DungeonLighting } from './lighting';
import { getZoneTheme } from './materials';
import { ProjectileManager } from './ProjectileManager';
import { ParticleSystem } from './ParticleSystem';
import { DamageNumberManager } from './DamageNumbers';
import { AnimationController } from './AnimationSystem';
import { createPlayerMesh } from './CharacterFactory';
import { CLASS_DEFS } from './ClassDefs';
import type { PlayerClass } from '../stores/types';

export interface DungeonSceneCallbacks {
  onPointerLockChange?: (locked: boolean) => void;
}

// ---------- DungeonScene ----------

export class DungeonScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;

  private dungeon: DungeonGeometry | null = null;
  private playerController: PlayerController;
  private entityManager: EntityManager;
  private lighting: DungeonLighting;
  private projectileManager: ProjectileManager;
  private particleSystem: ParticleSystem;
  private damageNumbers: DamageNumberManager;
  private playerAnimation: AnimationController | null = null;

  // Player avatar mesh (visible from top-down)
  private playerMesh: THREE.Group | null = null;
  private playerTargetPos = new THREE.Vector3();
  private playerCurrentPos = new THREE.Vector3();
  private prevPlayerPos = new THREE.Vector3();

  private unsubscribe: (() => void) | null = null;
  private animationId: number | null = null;
  private clock = new THREE.Clock();
  private currentZone = '';
  private disposed = false;
  private playerClass: PlayerClass;
  private lastPlayerHp = -1;
  private lastPlayerAttacking = false;

  constructor(container: HTMLElement, callbacks?: DungeonSceneCallbacks, playerClass?: PlayerClass) {
    this.container = container;
    this.playerClass = playerClass || 'reaver';

    // Renderer — PBR + shadows + tone mapping
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.8;
    container.appendChild(this.renderer.domElement);

    // Scene with fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    const fogConfig = getZoneFogConfig('tomb_halls');
    this.scene.fog = new THREE.FogExp2(fogConfig.color, fogConfig.density);

    // Camera — top-down perspective
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 22, 14);

    // Lighting (default zone, updated when zone data arrives)
    this.lighting = createDungeonLighting(this.scene, 'tomb_halls');

    // Particle system (before ProjectileManager — it depends on this)
    this.particleSystem = new ParticleSystem(this.scene, 3000);

    // Player controller (top-down, no pointer lock)
    this.playerController = new PlayerController(this.camera, this.renderer.domElement);
    this.playerController.onStateChange((state) => {
      callbacks?.onPointerLockChange?.(state.pointerLocked);
    });

    // Entity manager
    this.entityManager = new EntityManager(this.scene, container);

    // Wire entity manager into player controller for right-click targeting
    this.playerController.setEntityManager(this.entityManager);

    // Projectile manager (with particle system for trails/impacts)
    this.projectileManager = new ProjectileManager(this.scene, this.particleSystem);

    // Damage numbers
    this.damageNumbers = new DamageNumberManager(this.scene);

    // Create player avatar
    this.createPlayerAvatar();

    // Subscribe to realtime state
    this.unsubscribe = realtimeStore.subscribe((state) => {
      this.handleStateUpdate(state);
    });

    // Resize handler
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    // Start render loop
    this.animate();
  }

  private createPlayerAvatar() {
    // Outer group for world positioning — animation never touches this
    const wrapper = new THREE.Group();
    wrapper.name = 'playerWrapper';
    wrapper.frustumCulled = false;

    // Inner group: the actual character mesh — animation controller owns this
    const inner = createPlayerMesh(this.playerClass);
    inner.castShadow = true;
    inner.frustumCulled = false;
    inner.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.frustumCulled = false;
      }
    });
    wrapper.add(inner);
    this.scene.add(wrapper);
    this.playerMesh = wrapper; // DungeonScene positions this in the world

    // Animation controller operates on the INNER group (local space only)
    this.playerAnimation = new AnimationController(inner, {
      type: 'player',
      playerClass: this.playerClass,
    });
    this.playerAnimation.play('idle');

    // Start class aura particle effect
    const auraColors: Record<string, number> = {
      pyromancer: 0xff6b35,
      void_weaver: 0x8b5cf6,
      shade: 0x4ade80,
    };
    if (auraColors[this.playerClass]) {
      this.particleSystem.emitAura(wrapper, auraColors[this.playerClass], 0.6);
    }
  }

  private handleStateUpdate(state: any) {
    if (!state.arena || !state.player) return;

    // Build/rebuild dungeon if zone changed
    const zone = state.zone || 'tomb_halls';
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      if (this.dungeon) disposeDungeon(this.dungeon);
      this.dungeon = buildDungeon(state.arena, zone);
      this.scene.add(this.dungeon.group);

      // Update lighting for zone
      updateZoneLighting(this.lighting, zone);
      const theme = getZoneTheme(zone);
      this.scene.background = new THREE.Color(theme.fogColor);

      // Update fog for zone
      const fogConfig = getZoneFogConfig(zone);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(fogConfig.color);
        this.scene.fog.density = fogConfig.density;
      }

      // Start ambient dust particles in the dungeon
      const arenaW = state.arena.width * 0.1;
      const arenaH = state.arena.height * 0.1;
      const bounds = new THREE.Box3(
        new THREE.Vector3(-arenaW / 2, 0, -arenaH / 2),
        new THREE.Vector3(arenaW / 2, 4, arenaH / 2),
      );
      this.particleSystem.emitAmbient(bounds, 0x886644, 0.3);
    }

    // Update player position (camera + mesh share this single lerped position)
    this.playerController.updateFromServer(state.player.x, state.player.y);
    const world = arenaToWorld(state.player.x, state.player.y);

    // Player facing → mesh rotation
    if (this.playerMesh) {
      const facingMap: Record<string, number> = {
        up: 0,
        right: -Math.PI / 2,
        down: Math.PI,
        left: Math.PI / 2,
      };
      this.playerMesh.rotation.y = facingMap[state.player.facing] ?? 0;
    }

    // Detect player attacks for animation
    if (state.player.attackCooldown > 0 && !this.lastPlayerAttacking && this.playerAnimation) {
      const isCaster = ['pyromancer', 'void_weaver'].includes(this.playerClass);
      const isRanged = ['warden', 'corsair'].includes(this.playerClass);
      if (isCaster) {
        this.playerAnimation.play('cast');
      } else if (isRanged) {
        this.playerAnimation.play('attack_ranged');
      } else {
        this.playerAnimation.play('attack_melee');
      }
    }
    this.lastPlayerAttacking = state.player.attackCooldown > 0;

    // Detect HP changes for damage numbers and hit animation
    if (this.lastPlayerHp > 0 && state.player.hp < this.lastPlayerHp) {
      const damage = this.lastPlayerHp - state.player.hp;
      this.damageNumbers.spawn(
        this.playerCurrentPos.x, 2.0, this.playerCurrentPos.z,
        damage, 'damage',
      );
      if (this.playerAnimation) {
        this.playerAnimation.flashColor(0xff0000, 0.2);
      }
    } else if (this.lastPlayerHp > 0 && state.player.hp > this.lastPlayerHp) {
      const heal = state.player.hp - this.lastPlayerHp;
      this.damageNumbers.spawn(
        this.playerCurrentPos.x, 2.0, this.playerCurrentPos.z,
        heal, 'heal',
      );
    }
    this.lastPlayerHp = state.player.hp;

    // Update entities — use player world position for fog of war
    const playerWorld = new THREE.Vector3(world.x, 1.6, world.z);
    this.entityManager.updateEnemies(state.enemies, playerWorld);
    this.entityManager.updateResources(state.resources || [], playerWorld);

    // Update projectiles
    this.projectileManager.updateFromState(state.projectiles || []);

    // Consume events for damage numbers on enemies
    const events = realtimeStore.consumeEvents();
    for (const evt of events) {
      if ((evt.type === 'damage' || evt.type === 'crit') && evt.x !== undefined && evt.y !== undefined && evt.value) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        const dmgType = evt.text?.includes('crit') ? 'crit' as const
          : (evt as any).element === 'fire' ? 'fire' as const
          : (evt as any).element === 'ice' ? 'ice' as const
          : (evt as any).element === 'shadow' ? 'shadow' as const
          : 'damage' as const;
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, evt.value, dmgType);
      } else if (evt.type === 'heal' && evt.x !== undefined && evt.y !== undefined && evt.value) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, evt.value, 'heal');
      } else if (evt.type === 'dodge' && evt.x !== undefined && evt.y !== undefined) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, 0, 'dodge');
      } else if (evt.type === 'block' && evt.x !== undefined && evt.y !== undefined) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, 0, 'block');
      }
    }
  }

  private animate() {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();

    // Update camera follow
    this.playerController.update(dt);

    // Position player mesh from controller (single source of truth — no separate lerp)
    if (this.playerMesh) {
      this.prevPlayerPos.copy(this.playerCurrentPos);
      this.playerCurrentPos.copy(this.playerController.worldPosition);
      this.playerMesh.position.copy(this.playerCurrentPos);

      // Detect movement for walk animation
      const moveDist = this.playerCurrentPos.distanceTo(this.prevPlayerPos);
      const moveSpeed = moveDist / Math.max(dt, 0.001);
      if (this.playerAnimation) {
        this.playerAnimation.setMoveSpeed(Math.min(moveSpeed / 3, 1));
        if (moveSpeed > 0.5 && !this.playerAnimation.isPlaying('attack_melee') &&
            !this.playerAnimation.isPlaying('attack_ranged') &&
            !this.playerAnimation.isPlaying('cast') &&
            !this.playerAnimation.isPlaying('hit')) {
          if (this.playerAnimation.currentAnimation === 'idle') {
            this.playerAnimation.play('walk');
          }
        } else if (moveSpeed < 0.2 && this.playerAnimation.currentAnimation === 'walk') {
          this.playerAnimation.play('idle');
        }
      }
    }

    // Update player animation
    if (this.playerAnimation) {
      this.playerAnimation.update(dt);
    }

    // Torch hovers above the player, above walls (h=3) but below camera (h=22)
    updateTorchPosition(
      this.lighting,
      this.playerCurrentPos.x,
      6,
      this.playerCurrentPos.z,
    );
    flickerTorch(this.lighting, dt);

    // Update entities (lerp positions, animate resources, enemy animations)
    this.entityManager.update(dt, this.camera);

    // Update projectile visuals
    this.projectileManager.update(dt);

    // Update particle system
    this.particleSystem.update(dt);

    // Update damage numbers
    this.damageNumbers.update(dt);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.entityManager.resize(w, h);
  }

  dispose() {
    this.disposed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    if (this.unsubscribe) this.unsubscribe();
    window.removeEventListener('resize', this.onResize);

    this.playerController.dispose();
    this.entityManager.dispose();
    this.projectileManager.dispose();
    this.particleSystem.dispose();
    this.damageNumbers.dispose();
    if (this.dungeon) disposeDungeon(this.dungeon);

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
