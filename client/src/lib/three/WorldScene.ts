import * as THREE from 'three';
import { buildTerrain, getHeightAt, type TerrainData } from './TerrainBuilder';
import { createWorldDecorations, type WorldDecorationsHandle } from './WorldDecorations';
import { createStoneArchway, type Portal } from './PortalBuilder';
import { ParticleSystem } from './ParticleSystem';
import { AnimationController } from './AnimationSystem';
import type { AnimationName } from './AnimationSystem';
import { createPlayerMesh, createSentinelPlayerMesh } from './CharacterFactory';
import { preloadPlayerModels } from './GLTFPlayerLoader';
import { preloadSentinelModel, hasSentinelModel } from './SentinelLoader';
import { GLTFAnimationController, SENTINEL_ANIM_MAP } from './GLTFAnimationController';
import { CLASS_DEFS } from './ClassDefs';
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

export interface WorldSceneCallbacks {
  onDungeonEnter?: () => void;
}

// Portal interaction distance (world units)
const PORTAL_INTERACT_DIST = 8;

// Camera defaults
const CAM_HEIGHT_DEFAULT = 22;
const CAM_HEIGHT_MIN = 10;
const CAM_HEIGHT_MAX = 50;
const CAM_PITCH = -Math.PI / 3; // ~60 degrees down
const CAM_TILT_RATIO = 14 / 22;

// Movement speed (world units/sec)
const MOVE_SPEED = 12;

export class WorldScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;

  private terrain: TerrainData | null = null;
  private decorations: WorldDecorationsHandle | null = null;
  private portal: Portal | null = null;
  private particleSystem: ParticleSystem;
  private playerAnimation: PlayerAnimController | null = null;

  private playerMesh: THREE.Group | null = null;
  private playerPos = new THREE.Vector3(0, 0, 0);
  private prevPlayerPos = new THREE.Vector3(0, 0, 0);
  private playerFacingAngle = 0;

  private camHeight = CAM_HEIGHT_DEFAULT;
  private portalWorldPos = new THREE.Vector3(0, 0, -80);
  private _isNearPortal = false;

  private keys: Record<string, boolean> = {};
  private clickTarget: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();

  private animationId: number | null = null;
  private clock = new THREE.Clock();
  private disposed = false;
  private callbacks: WorldSceneCallbacks;
  private playerClass: PlayerClass;

  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onResizeBound: () => void;

  constructor(container: HTMLElement, callbacks: WorldSceneCallbacks, playerClass: PlayerClass) {
    this.container = container;
    this.callbacks = callbacks;
    this.playerClass = playerClass;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.8;
    container.appendChild(this.renderer.domElement);

    // Scene with sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.FogExp2(0xc8d8e8, 0.003);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = CAM_PITCH;

    // Lighting — bright outdoor
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x4a7a3a, 1.2);
    this.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0x8899bb, 2.0);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.5);
    dirLight.position.set(30, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    // Particle system
    this.particleSystem = new ParticleSystem(this.scene, 2000);

    // Build terrain
    this.terrain = buildTerrain({ size: 200, segments: 128, heightScale: 8, seed: 42 });
    this.scene.add(this.terrain.mesh);

    // Portal position on terrain
    const portalY = getHeightAt(this.terrain, 0, -80);
    this.portalWorldPos.set(0, portalY, -80);

    // Decorations
    this.decorations = createWorldDecorations(this.terrain, this.portalWorldPos);
    this.scene.add(this.decorations.group);

    // Stone archway portal
    this.portal = createStoneArchway(this.portalWorldPos, this.particleSystem);
    this.scene.add(this.portal.group);
    this.scene.add(this.portal.light);

    // Set player at center of terrain
    const spawnY = getHeightAt(this.terrain, 0, 0);
    this.playerPos.set(0, spawnY, 0);
    this.prevPlayerPos.copy(this.playerPos);
    this.syncCamera();

    // Input handlers
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onKeyUpBound = this.onKeyUp.bind(this);
    this.onMouseDownBound = this.onMouseDown.bind(this);
    this.onWheelBound = this.onWheel.bind(this);
    this.onResizeBound = this.onResize.bind(this);

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    container.addEventListener('mousedown', this.onMouseDownBound);
    container.addEventListener('wheel', this.onWheelBound, { passive: false });
    window.addEventListener('resize', this.onResizeBound);

    // Start render loop
    this.animate();

    // Preload models, then create player avatar
    Promise.all([
      preloadPlayerModels().catch(() => {}),
      preloadSentinelModel().catch(() => {}),
    ]).finally(() => {
      if (this.disposed) return;
      this.createPlayerAvatar();
    });
  }

  get isNearPortal(): boolean {
    return this._isNearPortal;
  }

  private createPlayerAvatar() {
    const wrapper = new THREE.Group();
    wrapper.name = 'playerWrapper';
    wrapper.frustumCulled = false;

    // Try sentinel GLTF model
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

      this.playerAnimation = new GLTFAnimationController(
        instance.group,
        instance.mixer,
        instance.clips,
        SENTINEL_ANIM_MAP,
      );
      this.playerAnimation.play('idle');
    } else {
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

    // Class aura particles
    const auraColors: Record<string, number> = {
      pyromancer: 0xff6b35,
      void_weaver: 0x8b5cf6,
      shade: 0x4ade80,
    };
    if (auraColors[this.playerClass]) {
      this.particleSystem.emitAura(wrapper, auraColors[this.playerClass], 0.6);
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keys[e.code] = true;

    // Cancel click-to-move on WASD
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      this.clickTarget = null;
    }

    // E key: interact with portal
    if (e.code === 'KeyE' && this._isNearPortal) {
      this.callbacks.onDungeonEnter?.();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys[e.code] = false;
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    // Raycast against terrain mesh
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.terrain) {
      const hits = this.raycaster.intersectObject(this.terrain.mesh);
      if (hits.length > 0) {
        this.clickTarget = hits[0].point.clone();
      }
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomSpeed = 2;
    this.camHeight += (e.deltaY > 0 ? zoomSpeed : -zoomSpeed);
    this.camHeight = Math.max(CAM_HEIGHT_MIN, Math.min(CAM_HEIGHT_MAX, this.camHeight));
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private syncCamera() {
    const tilt = this.camHeight * CAM_TILT_RATIO;
    this.camera.position.set(
      this.playerPos.x,
      this.camHeight + this.playerPos.y,
      this.playerPos.z + tilt,
    );
  }

  private animate() {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.prevPlayerPos.copy(this.playerPos);

    // Movement input
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX = 1;

    // Click-to-move
    if (moveX === 0 && moveZ === 0 && this.clickTarget) {
      const dx = this.clickTarget.x - this.playerPos.x;
      const dz = this.clickTarget.z - this.playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.5) {
        this.clickTarget = null;
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
      }
    }

    // Normalize diagonal
    if (moveX !== 0 && moveZ !== 0) {
      const inv = 1 / Math.SQRT2;
      moveX *= inv;
      moveZ *= inv;
    }

    // Apply movement
    if (moveX !== 0 || moveZ !== 0) {
      this.playerPos.x += moveX * MOVE_SPEED * dt;
      this.playerPos.z += moveZ * MOVE_SPEED * dt;

      // Clamp to terrain bounds (leave some margin)
      const bound = (this.terrain?.size ?? 200) / 2 - 5;
      this.playerPos.x = Math.max(-bound, Math.min(bound, this.playerPos.x));
      this.playerPos.z = Math.max(-bound, Math.min(bound, this.playerPos.z));

      // Follow terrain height
      if (this.terrain) {
        this.playerPos.y = getHeightAt(this.terrain, this.playerPos.x, this.playerPos.z);
      }
    }

    // Update player mesh position
    if (this.playerMesh) {
      this.playerMesh.position.copy(this.playerPos);

      // Movement detection for walk animation
      const moveDist = this.playerPos.distanceTo(this.prevPlayerPos);
      const moveSpeed = moveDist / Math.max(dt, 0.001);

      if (this.playerAnimation) {
        this.playerAnimation.setMoveSpeed(Math.min(moveSpeed / 3, 1));
        if (moveSpeed > 0.5 &&
            !this.playerAnimation.isPlaying('attack_melee') &&
            !this.playerAnimation.isPlaying('attack_ranged') &&
            !this.playerAnimation.isPlaying('cast')) {
          if (this.playerAnimation.currentAnimation === 'idle') {
            this.playerAnimation.play('walk');
          }
        } else if (moveSpeed < 0.2 && this.playerAnimation.currentAnimation === 'walk') {
          this.playerAnimation.play('idle');
        }
      }

      // Smooth facing from movement direction
      if (moveDist > 0.01) {
        const dx = this.playerPos.x - this.prevPlayerPos.x;
        const dz = this.playerPos.z - this.prevPlayerPos.z;
        if (dx * dx + dz * dz > 0.0001) {
          const targetAngle = Math.atan2(dx, dz);
          let delta = targetAngle - this.playerFacingAngle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          this.playerFacingAngle += delta * Math.min(1, dt * 12);
        }
      }
      this.playerMesh.rotation.y = this.playerFacingAngle;
    }

    // Update animation
    if (this.playerAnimation) {
      this.playerAnimation.update(dt);
    }

    // Portal proximity check
    const dx = this.playerPos.x - this.portalWorldPos.x;
    const dz = this.playerPos.z - this.portalWorldPos.z;
    this._isNearPortal = Math.sqrt(dx * dx + dz * dz) < PORTAL_INTERACT_DIST;

    // Update portal effects
    if (this.portal) {
      this.portal.update(dt, elapsed);
    }

    // Update particles
    this.particleSystem.update(dt);

    // Camera follow
    this.syncCamera();

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.container.removeEventListener('mousedown', this.onMouseDownBound);
    this.container.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('resize', this.onResizeBound);

    this.particleSystem.dispose();
    if (this.decorations) this.decorations.dispose();
    if (this.portal) this.portal.dispose();

    if (this.terrain) {
      this.terrain.mesh.geometry.dispose();
      (this.terrain.mesh.material as THREE.Material).dispose();
    }

    if (this.playerMesh) {
      this.playerMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else (child.material as THREE.Material).dispose();
        }
      });
    }

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
