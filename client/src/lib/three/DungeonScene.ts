import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { realtimeStore } from '../stores/realtimeStore.svelte';
import { buildDungeon, disposeDungeon, arenaToWorld, worldToArena, type DungeonGeometry } from './DungeonBuilder';
import { createPixelBlockRenderer, type PixelBlockHandle } from './PixelBlockRenderer';
import { loadDungeonProps, type DungeonPropsHandle } from './DungeonProps';
import { PlayerController } from './PlayerController';
import { EntityManager } from './EntityManager';
import { createDungeonLighting, updateTorchPosition, flickerTorch, updateZoneLighting, getZoneFogConfig, type DungeonLighting } from './lighting';
import { getZoneTheme } from './materials';
import { ProjectileManager } from './ProjectileManager';
import { ParticleSystem } from './ParticleSystem';
import { DamageNumberManager } from './DamageNumbers';
import { AnimationController } from './AnimationSystem';
import type { AnimationName } from './AnimationSystem';
import { createPlayerMesh, createSentinelPlayerMesh } from './CharacterFactory';
import { preloadEnemyModels } from './GLTFEnemyLoader';
import { preloadPlayerModels } from './GLTFPlayerLoader';
import { preloadSentinelModel, hasSentinelModel } from './SentinelLoader';
import { GLTFAnimationController, SENTINEL_ANIM_MAP } from './GLTFAnimationController';
import { CLASS_DEFS } from './ClassDefs';
import { FogOfWar } from './FogOfWar';
import { preloadWallAsset, getLoadedWallAsset } from './WallAssetLoader';
import type { PlayerClass } from '../stores/types';

/** Common animation interface for both procedural and GLTF controllers */
interface PlayerAnimController {
  play(name: AnimationName): void;
  update(dt: number): void;
  isPlaying(name: AnimationName): boolean;
  readonly currentAnimation: AnimationName;
  setMoveSpeed(speed: number): void;
  flashColor(color: number, duration?: number): void;
}

export interface DungeonSceneCallbacks {
  onPointerLockChange?: (locked: boolean) => void;
}

// Fog of war reveal radius in arena pixels (~2 grid squares = ~15 world units)
const FOW_REVEAL_RADIUS = 150;

// ---------- DungeonScene ----------

export class DungeonScene {
  private renderer: THREE.WebGLRenderer;
  private css2DRenderer: CSS2DRenderer;
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
  private playerAnimation: PlayerAnimController | null = null;
  private fogOfWar: FogOfWar | null = null;
  private pixelBlocks: PixelBlockHandle | null = null;

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
  private dungeonProps: DungeonPropsHandle | null = null;
  private playerClass: PlayerClass;
  private lastPlayerHp = -1;
  private lastPlayerAttacking = false;
  private playerFacingAngle = 0; // smooth rotation angle (radians)

  // Exit portal mesh
  private exitGroup: THREE.Group | null = null;
  private exitLight: THREE.PointLight | null = null;
  private exitArenaPos: { x: number; y: number } | null = null;

  // Click decal
  private clickDecal: THREE.Mesh | null = null;
  private clickDecalOpacity = 0;
  private clickDecalFading = false;

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
    this.renderer.toneMappingExposure = 2.2;
    container.appendChild(this.renderer.domElement);

    // CSS2D renderer for damage numbers (overlays WebGL canvas)
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2DRenderer.domElement.style.position = 'absolute';
    this.css2DRenderer.domElement.style.top = '0';
    this.css2DRenderer.domElement.style.left = '0';
    this.css2DRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.css2DRenderer.domElement);

    // Scene with fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c12);
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

    // Entity manager (with particle system for death bursts)
    this.entityManager = new EntityManager(this.scene, container, this.particleSystem);

    // Wire entity manager into player controller for right-click targeting
    this.playerController.setEntityManager(this.entityManager);

    // Set auto-chase stop distance from class attack range
    const classDef = CLASS_DEFS[this.playerClass];
    if (classDef) {
      this.playerController.setAttackRange(classDef.attackRange);
    }

    // Projectile manager (with particle system for trails/impacts)
    this.projectileManager = new ProjectileManager(this.scene, this.particleSystem);

    // Damage numbers
    this.damageNumbers = new DamageNumberManager(this.scene);

    // Resize handler
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    // Click-to-move decal
    this.createClickDecal();

    // Start render loop immediately (shows dungeon while models load)
    this.animate();

    // Preload all GLTF models (player + enemy + wall + sentinel), then create player avatar and subscribe
    Promise.all([
      preloadPlayerModels().catch((err) => console.warn('[DungeonScene] Player GLTF preload failed, using fallback:', err)),
      preloadEnemyModels().catch((err) => console.warn('[DungeonScene] Enemy GLTF preload failed, using fallback:', err)),
      preloadWallAsset().catch((err) => console.warn('[DungeonScene] Wall GLB preload failed, using procedural walls:', err)),
      preloadSentinelModel().catch((err) => console.warn('[DungeonScene] Sentinel GLTF preload failed, using fallback:', err)),
    ]).finally(() => {
      if (this.disposed) return;
      this.createPlayerAvatar();
      this.unsubscribe = realtimeStore.subscribe((state) => {
        this.handleStateUpdate(state);
      });
    });
  }

  private createClickDecal() {
    const geo = new THREE.RingGeometry(0.2, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.visible = false;
    this.scene.add(mesh);
    this.clickDecal = mesh;
  }

  private createExitPortal(arenaX: number, arenaY: number) {
    this.exitArenaPos = { x: arenaX, y: arenaY };

    // Clean up existing
    if (this.exitGroup) {
      this.scene.remove(this.exitGroup);
      this.exitGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    if (this.exitLight) {
      this.scene.remove(this.exitLight);
      this.exitLight.dispose();
    }

    const world = arenaToWorld(arenaX, arenaY);
    const group = new THREE.Group();
    group.position.set(world.x, 0, world.z);

    // Floor ring
    const ringGeo = new THREE.RingGeometry(1.2, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    // Inner ring
    const innerGeo = new THREE.RingGeometry(0.4, 0.8, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x88ffdd,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.04;
    group.add(inner);

    // Vertical beam
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.8, 5, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 2.5;
    group.add(beam);

    this.scene.add(group);
    this.exitGroup = group;

    // Point light
    const light = new THREE.PointLight(0x00ffaa, 5, 20);
    light.position.set(world.x, 3, world.z);
    this.scene.add(light);
    this.exitLight = light;
  }

  private createPlayerAvatar() {
    // Outer group for world positioning — animation never touches this
    const wrapper = new THREE.Group();
    wrapper.name = 'playerWrapper';
    wrapper.frustumCulled = false;

    // Try sentinel GLTF model (with skeletal animations)
    const sentinelResult = this.playerClass === 'sentinel' ? createSentinelPlayerMesh() : null;

    if (sentinelResult) {
      const { group: inner, instance } = sentinelResult;
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
      this.playerMesh = wrapper;

      // GLTF animation controller with sentinel-specific animation map
      this.playerAnimation = new GLTFAnimationController(
        instance.group,
        instance.mixer,
        instance.clips,
        SENTINEL_ANIM_MAP,
      );
      this.playerAnimation.play('idle');
    } else {
      // Fallback: procedural mesh + procedural animation controller
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
      this.playerMesh = wrapper;

      this.playerAnimation = new AnimationController(inner, {
        type: 'player',
        playerClass: this.playerClass,
      });
      this.playerAnimation.play('idle');
    }

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
      if (this.dungeonProps) { this.dungeonProps.dispose(); this.dungeonProps = null; }
      if (this.fogOfWar) { this.fogOfWar.dispose(); this.fogOfWar = null; }
      if (this.pixelBlocks) { this.pixelBlocks.dispose(); this.scene.remove(this.pixelBlocks.group); this.pixelBlocks = null; }

      const wallAsset = getLoadedWallAsset() || undefined;

      if (state.blockStyle && state.wallGrid) {
        // Pixel block mode: skip floor + interior walls (pixel blocks handle those)
        this.dungeon = buildDungeon(state.arena, zone, wallAsset, { skipFloor: true, skipInteriorWalls: true });
        this.scene.add(this.dungeon.group);

        // Create pixel block renderer
        this.pixelBlocks = createPixelBlockRenderer();
        this.scene.add(this.pixelBlocks.group);
        this.pixelBlocks.rebuild(state.wallGrid, state.gridW, state.gridH, state.arena.width, state.arena.height, state.blockStyle);
        // Skip DungeonProps — pixel blocks handle environment
      } else {
        // Classic rendering
        this.dungeon = buildDungeon(state.arena, zone, wallAsset);
        this.scene.add(this.dungeon.group);

        // Load GLTF environment props asynchronously
        const arenaSnapshot = state.arena;
        loadDungeonProps(arenaSnapshot, zone).then((handle) => {
          if (this.disposed) { handle.dispose(); return; }
          this.dungeonProps = handle;
          this.scene.add(handle.group);
        });
      }

      // Create fog of war
      this.fogOfWar = new FogOfWar(state.arena.width, state.arena.height);
      this.scene.add(this.fogOfWar.overlay);

      // Expose FoW grid to store for minimap
      realtimeStore.setFowGrid(this.fogOfWar.grid, this.fogOfWar.gridW);

      // Pass FoW to entity manager
      this.entityManager.setFogOfWar(this.fogOfWar);

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

      // Clean up old exit portal before zone change
      if (this.exitGroup) {
        this.exitGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
        this.scene.remove(this.exitGroup);
        this.exitGroup = null;
      }
      if (this.exitLight) {
        this.scene.remove(this.exitLight);
        this.exitLight.dispose();
        this.exitLight = null;
      }
      this.exitArenaPos = null;

      // Create exit portal if position exists
      if (state.arena.exitPosition) {
        this.createExitPortal(state.arena.exitPosition.x, state.arena.exitPosition.y);
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

    // Fog of war — reveal around player each state update
    if (this.fogOfWar) {
      this.fogOfWar.reveal(state.player.x, state.player.y, FOW_REVEAL_RADIUS);
    }

    // Player facing is now computed smoothly in animate() from movement + target

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

    // Update ground loot
    this.entityManager.updateGroundLoot(state.groundLoot || [], playerWorld);

    // Update projectiles
    this.projectileManager.updateFromState(state.projectiles || []);

    // Consume events for damage numbers on enemies
    // Skip player-targeted damage/heal — those are handled by HP change detection above
    const events = realtimeStore.consumeEvents();
    for (const evt of events) {
      if ((evt.type === 'damage' || evt.type === 'crit') && evt.x !== undefined && evt.y !== undefined && evt.value) {
        if (evt.targetId === 'player') continue; // handled by HP change detection
        const evtWorld = arenaToWorld(evt.x, evt.y);
        const dmgType = evt.type === 'crit' ? 'crit' as const
          : (evt as any).element === 'fire' ? 'fire' as const
          : (evt as any).element === 'ice' ? 'ice' as const
          : (evt as any).element === 'shadow' ? 'shadow' as const
          : 'damage' as const;
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, evt.value, dmgType);
      } else if (evt.type === 'heal' && evt.x !== undefined && evt.y !== undefined && evt.value) {
        if (evt.targetId === 'player') continue; // handled by HP change detection
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, evt.value, 'heal');
      } else if (evt.type === 'dodge' && evt.x !== undefined && evt.y !== undefined) {
        // dodge/block only happen to player but still show via event (no HP change path)
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, 0, 'dodge');
      } else if (evt.type === 'block' && evt.x !== undefined && evt.y !== undefined) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        this.damageNumbers.spawn(evtWorld.x, 2.0, evtWorld.z, 0, 'block');
      } else if (evt.type === 'kill_reward' && evt.x !== undefined && evt.y !== undefined) {
        const evtWorld = arenaToWorld(evt.x, evt.y);
        // Split the text "+15 XP  +8g" into XP number
        const xpMatch = evt.text?.match(/\+(\d+) XP/);
        if (xpMatch) {
          this.damageNumbers.spawn(evtWorld.x, 2.5, evtWorld.z, parseInt(xpMatch[1]), 'xp');
        }
        const goldMatch = evt.text?.match(/\+(\d+)g/);
        if (goldMatch) {
          this.damageNumbers.spawn(evtWorld.x + 0.3, 2.2, evtWorld.z, parseInt(goldMatch[1]), 'gold');
        }
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

      // Smooth facing: target enemy > movement direction > keep current
      let targetAngle: number | null = null;
      const targetId = this.playerController.targetedEnemyId;
      if (targetId && this.entityManager) {
        const enemyPos = this.entityManager.getEnemyPosition(targetId);
        if (enemyPos) {
          const dx = enemyPos.x - this.playerCurrentPos.x;
          const dz = enemyPos.z - this.playerCurrentPos.z;
          if (dx * dx + dz * dz > 0.01) {
            targetAngle = Math.atan2(dx, dz);
          }
        }
      }
      if (targetAngle === null && moveDist > 0.01) {
        const dx = this.playerCurrentPos.x - this.prevPlayerPos.x;
        const dz = this.playerCurrentPos.z - this.prevPlayerPos.z;
        if (dx * dx + dz * dz > 0.0001) {
          targetAngle = Math.atan2(dx, dz);
        }
      }
      if (targetAngle !== null) {
        // Shortest-path angle interpolation
        let delta = targetAngle - this.playerFacingAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const lerpSpeed = 12; // radians/sec responsiveness
        this.playerFacingAngle += delta * Math.min(1, dt * lerpSpeed);
      }
      this.playerMesh.rotation.y = this.playerFacingAngle;
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

    // Directional light + shadow follow the player (keeps shadows sharp on larger map)
    this.lighting.directional.target.position.set(
      this.playerCurrentPos.x, 0, this.playerCurrentPos.z,
    );
    this.lighting.directional.position.set(
      this.playerCurrentPos.x, 30, this.playerCurrentPos.z,
    );

    // Sync click-target to store so the HUD overlay can show it
    const targetId = this.playerController.targetedEnemyId;
    realtimeStore.setTargetEnemyId(targetId);
    this.entityManager.setTargetedEnemy(targetId);

    // Update entities (lerp positions, animate resources, enemy animations)
    this.entityManager.update(dt, this.camera);

    // Update projectile visuals
    this.projectileManager.update(dt);

    // Update particle system
    this.particleSystem.update(dt);

    // Update damage numbers
    this.damageNumbers.update(dt);

    // Click decal — show at click target, fade when arrived
    if (this.clickDecal) {
      const target = this.playerController.clickTargetPosition;
      if (target) {
        this.clickDecal.visible = true;
        this.clickDecal.position.set(target.x, 0.02, target.z);
        this.clickDecalFading = false;
        // Gentle pulse
        const pulse = 0.7 + Math.sin(this.clock.elapsedTime * 4) * 0.15;
        (this.clickDecal.material as THREE.MeshBasicMaterial).opacity = pulse;
        this.clickDecalOpacity = pulse;
      } else if (this.clickDecal.visible) {
        // Fade out
        this.clickDecalFading = true;
        this.clickDecalOpacity -= dt * 2;
        if (this.clickDecalOpacity <= 0) {
          this.clickDecalOpacity = 0;
          this.clickDecal.visible = false;
          this.clickDecalFading = false;
        }
        (this.clickDecal.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.clickDecalOpacity);
      }
    }

    // Exit portal rotation + FoW visibility
    if (this.exitGroup) {
      let exitVisible = true;
      if (this.fogOfWar && this.exitArenaPos) {
        exitVisible = this.fogOfWar.isRevealed(this.exitArenaPos.x, this.exitArenaPos.y);
      }
      this.exitGroup.visible = exitVisible;
      if (this.exitLight) this.exitLight.visible = exitVisible;
      if (exitVisible) {
        this.exitGroup.rotation.y += dt * 0.5;
        if (this.exitLight) {
          this.exitLight.intensity = 4 + Math.sin(this.clock.elapsedTime * 2) * 1.5;
        }
      }
    }

    // Upload fog of war texture if dirty
    if (this.fogOfWar) {
      this.fogOfWar.updateTexture();
    }

    // Render
    this.renderer.render(this.scene, this.camera);
    this.css2DRenderer.render(this.scene, this.camera);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css2DRenderer.setSize(w, h);
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
    if (this.dungeonProps) this.dungeonProps.dispose();
    if (this.fogOfWar) this.fogOfWar.dispose();
    if (this.pixelBlocks) { this.pixelBlocks.dispose(); this.scene.remove(this.pixelBlocks.group); }
    if (this.exitGroup) {
      this.exitGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.scene.remove(this.exitGroup);
    }
    if (this.exitLight) { this.scene.remove(this.exitLight); this.exitLight.dispose(); }
    if (this.clickDecal) {
      this.clickDecal.geometry.dispose();
      (this.clickDecal.material as THREE.Material).dispose();
      this.scene.remove(this.clickDecal);
    }

    // Clear FoW reference from store
    realtimeStore.setFowGrid(null, 0);

    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.css2DRenderer.domElement.remove();
  }
}
