import * as THREE from 'three';

const CELL_SIZE = 10; // 10 arena pixels per cell

export class FogOfWar {
  readonly gridW: number;
  readonly gridH: number;
  readonly grid: Uint8Array;
  readonly texture: THREE.DataTexture;
  readonly overlay: THREE.Mesh;

  private dirty = true;
  private lastCellX = -1;
  private lastCellY = -1;

  constructor(arenaWidth: number, arenaHeight: number) {
    this.gridW = Math.ceil(arenaWidth / CELL_SIZE);
    this.gridH = Math.ceil(arenaHeight / CELL_SIZE);
    this.grid = new Uint8Array(this.gridW * this.gridH); // all 0 = unrevealed

    // DataTexture — single channel RED format
    this.texture = new THREE.DataTexture(
      this.grid,
      this.gridW,
      this.gridH,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    // Overlay plane — sits just above floor, covers entire arena
    const ARENA_SCALE = 0.1;
    const planeW = arenaWidth * ARENA_SCALE;
    const planeH = arenaHeight * ARENA_SCALE;
    const geo = new THREE.PlaneGeometry(planeW, planeH);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        fowTexture: { value: this.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D fowTexture;
        varying vec2 vUv;
        void main() {
          // Flip V: PlaneGeometry rotated -PI/2 has UV v=0 at max Z (south),
          // but grid row 0 is arena Y=0 which maps to min Z (north).
          float revealed = texture2D(fowTexture, vec2(vUv.x, 1.0 - vUv.y)).r;
          float darkness = 1.0 - revealed;
          gl_FragColor = vec4(0.0, 0.0, 0.0, darkness);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.overlay = new THREE.Mesh(geo, mat);
    this.overlay.rotation.x = -Math.PI / 2;
    this.overlay.position.y = 0.02; // just above floor
    this.overlay.renderOrder = 1;
  }

  /** Mark cells within radius of (arenaX, arenaY) as revealed */
  reveal(arenaX: number, arenaY: number, radius: number) {
    const cellX = Math.floor(arenaX / CELL_SIZE);
    const cellY = Math.floor(arenaY / CELL_SIZE);

    // Skip if player hasn't moved to a new cell
    if (cellX === this.lastCellX && cellY === this.lastCellY) return;
    this.lastCellX = cellX;
    this.lastCellY = cellY;

    const cellRadius = Math.ceil(radius / CELL_SIZE);
    let changed = false;

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const gx = cellX + dx;
        const gy = cellY + dy;
        if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) continue;

        // Circular radius check
        const distSq = (dx * CELL_SIZE) ** 2 + (dy * CELL_SIZE) ** 2;
        if (distSq > radius * radius) continue;

        const idx = gy * this.gridW + gx;
        if (this.grid[idx] === 0) {
          this.grid[idx] = 255;
          changed = true;
        }
      }
    }

    if (changed) {
      this.dirty = true;
    }
  }

  /** Check if an arena position has been revealed */
  isRevealed(arenaX: number, arenaY: number): boolean {
    const gx = Math.floor(arenaX / CELL_SIZE);
    const gy = Math.floor(arenaY / CELL_SIZE);
    if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) return false;
    return this.grid[gy * this.gridW + gx] > 0;
  }

  /** Upload texture to GPU if dirty */
  updateTexture() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose() {
    this.texture.dispose();
    this.overlay.geometry.dispose();
    (this.overlay.material as THREE.ShaderMaterial).dispose();
    this.overlay.removeFromParent();
  }
}
