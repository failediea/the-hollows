import * as THREE from 'three';
import { realtimeStore } from '../stores/realtimeStore.svelte';
import { arenaToWorld, worldToArena } from './DungeonBuilder';
import type { Stance } from '../stores/types';
import type { EntityManager } from './EntityManager';

export interface PlayerControllerState {
  pointerLocked: boolean; // kept for interface compat, always true in top-down
}

export class PlayerController {
  camera: THREE.PerspectiveCamera;

  private keys: Record<string, boolean> = {};
  private inputInterval: ReturnType<typeof setInterval> | null = null;
  private stateCallback: ((state: PlayerControllerState) => void) | null = null;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onContextMenu: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private domElement: HTMLElement;

  // Camera follows player from above
  private static readonly CAM_HEIGHT_DEFAULT = 22;
  private static readonly CAM_HEIGHT_MIN = 10;
  private static readonly CAM_HEIGHT_MAX = 50;
  private static readonly CAM_TILT_RATIO = 14 / 22; // tilt scales with height
  private static readonly CAM_PITCH = -Math.PI / 3; // ~60 degrees down

  private camHeight = PlayerController.CAM_HEIGHT_DEFAULT;

  // Lerped camera target (server-authoritative player position)
  private targetPosition = new THREE.Vector3(0, 0, 0);
  private currentPosition = new THREE.Vector3(0, 0, 0);
  private initialized = false;

  // Dash
  private pendingDash = false;

  // Click-to-move
  private clickTarget: THREE.Vector3 | null = null;
  private static readonly CLICK_ARRIVE_DIST = 0.3; // world units to consider "arrived"
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane

  // Right-click target enemy
  private entityManager: EntityManager | null = null;
  private targetEnemyId: string | null = null;
  private static readonly MELEE_RANGE = 2.5; // world units (~25 arena px)

  // Auto-chase: stop distance in world units (set from class attackRange)
  private chaseStopRange = 4.5; // default ~45 arena px

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Set initial top-down camera orientation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = PlayerController.CAM_PITCH;
    this.camera.rotation.y = 0;
    this.camera.rotation.z = 0;

    this.onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      // Any WASD/arrow key cancels click-to-move
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        this.clickTarget = null;
      }

      // Stance changes via number keys
      if (e.code === 'Digit1') this.sendStanceChange('aggressive');
      if (e.code === 'Digit2') this.sendStanceChange('balanced');
      if (e.code === 'Digit3') this.sendStanceChange('defensive');
      if (e.code === 'Digit4') this.sendStanceChange('evasive');

      // Dash
      if (e.code === 'Space') { e.preventDefault(); this.pendingDash = true; }

      // Abilities
      if (e.code === 'KeyQ') this.sendAbility(0);
      if (e.code === 'KeyE') this.sendAbility(1);
      if (e.code === 'KeyR') this.sendAbility(2);
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    // Left-click: move to point, Right-click: target enemy
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left-click does NOT clear target — only right-click changes target
        this.handleClickMove(e);
      } else if (e.button === 2) {
        this.handleRightClick(e);
      }
    };

    this.onMouseUp = (_e: MouseEvent) => {};

    // Prevent context menu on right-click
    this.onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Zoom in/out with scroll wheel
    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 2;
      this.camHeight += (e.deltaY > 0 ? zoomSpeed : -zoomSpeed);
      this.camHeight = Math.max(PlayerController.CAM_HEIGHT_MIN, Math.min(PlayerController.CAM_HEIGHT_MAX, this.camHeight));
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    domElement.addEventListener('mousedown', this.onMouseDown);
    domElement.addEventListener('mouseup', this.onMouseUp);
    domElement.addEventListener('contextmenu', this.onContextMenu);
    domElement.addEventListener('wheel', this.onWheel, { passive: false });

    // Mark as "locked" immediately for HUD (no pointer lock in top-down)
    setTimeout(() => this.stateCallback?.({ pointerLocked: true }), 100);

    this.startInputLoop();
  }

  onStateChange(cb: (state: PlayerControllerState) => void) {
    this.stateCallback = cb;
  }

  setEntityManager(em: EntityManager) {
    this.entityManager = em;
  }

  /** Set the auto-chase stop distance from the class's attack range (arena px). */
  setAttackRange(arenaRange: number) {
    // Convert arena px to world units (ARENA_SCALE = 0.1) with slight buffer
    this.chaseStopRange = arenaRange * 0.1 * 0.85;
  }

  get targetedEnemyId(): string | null {
    return this.targetEnemyId;
  }

  private startInputLoop() {
    this.inputInterval = setInterval(() => this.sendMovementInput(), 50);
  }

  private handleRightClick(e: MouseEvent) {
    if (!this.entityManager) return;

    const rect = this.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.entityManager.raycastEnemy(this.raycaster);

    if (hit) {
      this.targetEnemyId = hit.id;
      this.clickTarget = null; // cancel click-to-move
    }
    // Right-click on empty space does NOT clear target
  }

  private handleClickMove(e: MouseEvent) {
    const rect = this.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      this.clickTarget = hit;
    }
  }

  private sendMovementInput() {
    // WASD maps directly to world directions (top-down)
    // W = -Z (north), S = +Z (south), A = -X (west), D = +X (east)
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX = 1;

    // Target enemy: clear if dead
    if (this.targetEnemyId && this.entityManager) {
      if (!this.entityManager.getEnemyPosition(this.targetEnemyId)) {
        this.targetEnemyId = null;
      }
    }

    // Auto-chase: if no keyboard input, no click target, and we have a live target, chase it
    if (moveX === 0 && moveZ === 0 && !this.clickTarget && this.targetEnemyId && this.entityManager) {
      const enemyPos = this.entityManager.getEnemyPosition(this.targetEnemyId);
      if (enemyPos) {
        const dx = enemyPos.x - this.currentPosition.x;
        const dz = enemyPos.z - this.currentPosition.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > this.chaseStopRange) {
          // Move toward enemy, stop at attack range
          moveX = dx / dist;
          moveZ = dz / dist;
        }
        // If within range: stop moving, auto-attack is already handled by attacking flag below
      }
    }

    // Click-to-move: if no keyboard input and we have a click target, move toward it
    if (moveX === 0 && moveZ === 0 && this.clickTarget) {
      const dx = this.clickTarget.x - this.currentPosition.x;
      const dz = this.clickTarget.z - this.currentPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < PlayerController.CLICK_ARRIVE_DIST) {
        // Arrived — stop
        this.clickTarget = null;
      } else {
        // Normalize direction
        moveX = dx / dist;
        moveZ = dz / dist;
      }
    }

    // Normalize diagonal for keyboard
    if (this.clickTarget === null && moveX !== 0 && moveZ !== 0) {
      const inv = 1 / Math.SQRT2;
      moveX *= inv;
      moveZ *= inv;
    }

    // Arena: moveX = X axis, moveY = Y axis (screen down = +Z in 3D)
    realtimeStore.sendInput({
      moveX,
      moveY: moveZ,
      attacking: this.targetEnemyId !== null, // only attack when right-click target selected
      abilitySlot: null,
      stanceChange: null,
      gather: this.keys['KeyF'] || false,
      targetId: this.targetEnemyId || undefined,
      dash: this.pendingDash,
    });
    this.pendingDash = false;
  }

  private sendStanceChange(stance: Stance) {
    realtimeStore.sendInput({
      moveX: 0,
      moveY: 0,
      attacking: false,
      abilitySlot: null,
      stanceChange: stance,
    });
  }

  private sendAbility(slot: number) {
    realtimeStore.sendInput({
      moveX: 0,
      moveY: 0,
      attacking: false,
      abilitySlot: slot,
      stanceChange: null,
      targetId: this.targetEnemyId || undefined,
    });
  }

  updateFromServer(arenaX: number, arenaY: number) {
    const world = arenaToWorld(arenaX, arenaY);
    this.targetPosition.set(world.x, 0, world.z);

    if (!this.initialized) {
      this.currentPosition.copy(this.targetPosition);
      this.syncCamera();
      this.initialized = true;
    }
  }

  update(dt: number) {
    const lerpFactor = Math.min(1, dt * 20);
    this.currentPosition.lerp(this.targetPosition, lerpFactor);
    this.syncCamera();
  }

  private syncCamera() {
    const tilt = this.camHeight * PlayerController.CAM_TILT_RATIO;
    this.camera.position.set(
      this.currentPosition.x,
      this.camHeight,
      this.currentPosition.z + tilt,
    );
  }

  /** The interpolated world position (single source of truth for camera + mesh). */
  get worldPosition(): THREE.Vector3 {
    return this.currentPosition;
  }

  /** Expose current click-to-move target for visual feedback (decal). */
  get clickTargetPosition(): THREE.Vector3 | null {
    return this.clickTarget;
  }

  get isLocked(): boolean {
    return true; // Always "active" in top-down mode
  }

  dispose() {
    if (this.inputInterval) clearInterval(this.inputInterval);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
