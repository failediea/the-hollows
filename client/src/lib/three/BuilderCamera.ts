import * as THREE from 'three';

export class BuilderCamera {
  camera: THREE.PerspectiveCamera;

  private keys: Record<string, boolean> = {};
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onMouseDownHandler: (e: MouseEvent) => void;
  private onMouseMoveHandler: (e: MouseEvent) => void;
  private onMouseUpHandler: (e: MouseEvent) => void;
  private domElement: HTMLElement;

  // Orbit state
  private target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(30, Math.PI / 3, 0); // radius, phi (60deg down), theta
  private isOrbiting = false;
  private isPanning = false;
  private lastMouse = new THREE.Vector2();

  // Public control
  private _orbitEnabled = true;

  // Limits
  private static readonly RADIUS_MIN = 5;
  private static readonly RADIUS_MAX = 80;
  private static readonly PHI_MIN = 0.1;          // near top
  private static readonly PHI_MAX = Math.PI / 2 - 0.05; // near horizontal
  private static readonly PAN_SPEED = 15;         // world units per second for WASD
  private static readonly ORBIT_SPEED = 0.005;    // radians per pixel
  private static readonly PAN_DRAG_SPEED = 0.02;  // world units per pixel (scaled by radius)

  // Arena bounds for clamping target
  private boundsHalfW = 180;
  private boundsHalfH = 135;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      this.keys[e.code] = true;
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 2;
      this.spherical.radius += (e.deltaY > 0 ? zoomSpeed : -zoomSpeed);
      this.spherical.radius = Math.max(BuilderCamera.RADIUS_MIN, Math.min(BuilderCamera.RADIUS_MAX, this.spherical.radius));
      this.syncCamera();
    };

    this.onMouseDownHandler = (e: MouseEvent) => {
      if (e.button === 0 && this._orbitEnabled) {
        this.isOrbiting = true;
        this.lastMouse.set(e.clientX, e.clientY);
      } else if (e.button === 2) {
        this.isPanning = true;
        this.lastMouse.set(e.clientX, e.clientY);
      }
    };

    this.onMouseMoveHandler = (e: MouseEvent) => {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;

      if (this.isOrbiting) {
        this.spherical.theta -= dx * BuilderCamera.ORBIT_SPEED;
        this.spherical.phi -= dy * BuilderCamera.ORBIT_SPEED;
        this.spherical.phi = Math.max(BuilderCamera.PHI_MIN, Math.min(BuilderCamera.PHI_MAX, this.spherical.phi));
        this.lastMouse.set(e.clientX, e.clientY);
        this.syncCamera();
      }

      if (this.isPanning) {
        // Pan in screen-plane relative to camera facing
        const panScale = this.spherical.radius * BuilderCamera.PAN_DRAG_SPEED;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        this.camera.getWorldDirection(up); // forward dir
        right.crossVectors(up, this.camera.up).normalize();
        // "up" in screen plane = cross of right and forward projected onto XZ
        const screenUp = new THREE.Vector3();
        screenUp.crossVectors(right, new THREE.Vector3(0, 1, 0)).crossVectors(new THREE.Vector3(0, 1, 0), right).normalize();

        this.target.addScaledVector(right, -dx * panScale * 0.05);
        this.target.addScaledVector(screenUp, dy * panScale * 0.05);
        this.clampTarget();
        this.lastMouse.set(e.clientX, e.clientY);
        this.syncCamera();
      }
    };

    this.onMouseUpHandler = (_e: MouseEvent) => {
      this.isOrbiting = false;
      this.isPanning = false;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    domElement.addEventListener('wheel', this.onWheel, { passive: false });
    domElement.addEventListener('mousedown', this.onMouseDownHandler);
    window.addEventListener('mousemove', this.onMouseMoveHandler);
    window.addEventListener('mouseup', this.onMouseUpHandler);

    this.syncCamera();
  }

  set orbitEnabled(v: boolean) {
    this._orbitEnabled = v;
    if (!v) this.isOrbiting = false;
  }

  get orbitEnabled(): boolean {
    return this._orbitEnabled;
  }

  /** True if the camera is currently being dragged (orbit or pan). */
  get isDragging(): boolean {
    return this.isOrbiting || this.isPanning;
  }

  /** Center camera on arena of given pixel dimensions */
  centerOnArena(arenaW: number, arenaH: number) {
    const ARENA_SCALE = 0.1;
    this.boundsHalfW = (arenaW * ARENA_SCALE) / 2;
    this.boundsHalfH = (arenaH * ARENA_SCALE) / 2;
    this.target.set(0, 0, 0);
    this.syncCamera();
  }

  update(dt: number) {
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX = 1;

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      const speed = BuilderCamera.PAN_SPEED * dt;

      // Forward/right relative to camera's theta (yaw around Y axis)
      const forward = new THREE.Vector3(-Math.sin(this.spherical.theta), 0, -Math.cos(this.spherical.theta));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);

      this.target.addScaledVector(forward, (-moveZ / len) * speed);
      this.target.addScaledVector(right, (moveX / len) * speed);
      this.clampTarget();
    }

    this.syncCamera();
  }

  private clampTarget() {
    this.target.x = Math.max(-this.boundsHalfW, Math.min(this.boundsHalfW, this.target.x));
    this.target.z = Math.max(-this.boundsHalfH, Math.min(this.boundsHalfH, this.target.z));
  }

  private syncCamera() {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  /** Current look-at position in world coordinates (x, z). */
  get worldPosition(): { x: number; z: number } {
    return { x: this.target.x, z: this.target.z };
  }

  /** Jump camera to a world position. */
  panTo(worldX: number, worldZ: number) {
    this.target.x = Math.max(-this.boundsHalfW, Math.min(this.boundsHalfW, worldX));
    this.target.z = Math.max(-this.boundsHalfH, Math.min(this.boundsHalfH, worldZ));
    this.syncCamera();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('mousedown', this.onMouseDownHandler);
    window.removeEventListener('mousemove', this.onMouseMoveHandler);
    window.removeEventListener('mouseup', this.onMouseUpHandler);
  }
}
