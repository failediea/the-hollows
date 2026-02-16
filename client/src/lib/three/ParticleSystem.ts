import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _worldPos = new THREE.Vector3();

interface AuraConfig {
  anchor: THREE.Object3D;
  color: THREE.Color;
  radius: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private mesh: THREE.InstancedMesh;
  private maxParticles: number;
  private nextIndex = 0;

  // Parallel arrays for particle state
  private positions: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private lifetimes: Float32Array;
  private maxLifetimes: Float32Array;
  private sizes: Float32Array;
  private gravities: Float32Array;
  private active: Uint8Array;

  private auras: Map<string, AuraConfig> = new Map();
  private auraCounter = 0;

  // Ambient emitter state
  private ambientEmitters: { bounds: THREE.Box3; color: THREE.Color; density: number; accum: number }[] = [];

  constructor(scene: THREE.Scene, maxParticles = 2000) {
    this.scene = scene;
    this.maxParticles = maxParticles;

    // Shared geometry and material
    const geo = new THREE.SphereGeometry(0.03, 4, 4);
    const mat = new THREE.MeshStandardMaterial({
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxParticles * 3),
      3,
    );
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Init all instances to scale 0 (invisible)
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    for (let i = 0; i < maxParticles; i++) {
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.mesh);

    // Allocate parallel arrays
    const n = maxParticles;
    this.positions = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.lifetimes = new Float32Array(n);
    this.maxLifetimes = new Float32Array(n);
    this.sizes = new Float32Array(n);
    this.gravities = new Float32Array(n);
    this.active = new Uint8Array(n);
  }

  /** Allocate the next particle slot (circular buffer). */
  private allocate(): number {
    const idx = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % this.maxParticles;
    return idx;
  }

  private spawn(
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
    lifetime: number, size: number, gravity: number,
  ) {
    const i = this.allocate();
    const i3 = i * 3;
    this.positions[i3] = px;
    this.positions[i3 + 1] = py;
    this.positions[i3 + 2] = pz;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.colors[i3] = r;
    this.colors[i3 + 1] = g;
    this.colors[i3 + 2] = b;
    this.lifetimes[i] = lifetime;
    this.maxLifetimes[i] = lifetime;
    this.sizes[i] = size;
    this.gravities[i] = gravity;
    this.active[i] = 1;
  }

  private static _tmpColor = new THREE.Color();
  private hexToRGB(hex: number): [number, number, number] {
    ParticleSystem._tmpColor.setHex(hex);
    return [ParticleSystem._tmpColor.r, ParticleSystem._tmpColor.g, ParticleSystem._tmpColor.b];
  }

  /** Emit trail particles at position (call each frame for continuous trail). */
  emitTrail(position: THREE.Vector3, color: number, count = 3): void {
    const [r, g, b] = this.hexToRGB(color);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 0.1;
      const oy = (Math.random() - 0.5) * 0.1;
      const oz = (Math.random() - 0.5) * 0.1;
      const vx = (Math.random() - 0.5) * 0.3;
      const vy = Math.random() * 0.5;
      const vz = (Math.random() - 0.5) * 0.3;
      const life = 0.3 + Math.random() * 0.2;
      const size = 0.02 + Math.random() * 0.02;
      this.spawn(
        position.x + ox, position.y + oy, position.z + oz,
        vx, vy, vz,
        r, g, b,
        life, size, -0.5,
      );
    }
  }

  /** Emit a burst of particles outward from position. */
  emitBurst(position: THREE.Vector3, color: number, count = 15, radius = 0.5): void {
    const [r, g, b] = this.hexToRGB(color);
    for (let i = 0; i < count; i++) {
      // Random direction on unit sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (1.0 + Math.random() * 2.0) * radius;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.sin(phi) * Math.sin(theta) * speed;
      const vz = Math.cos(phi) * speed;
      const life = 0.4 + Math.random() * 0.4;
      const size = 0.03 + Math.random() * 0.03;
      this.spawn(
        position.x, position.y, position.z,
        vx, vy, vz,
        r, g, b,
        life, size, -4.0,
      );
    }
  }

  /** Start a persistent aura around an anchor object. Returns aura ID. */
  emitAura(anchor: THREE.Object3D, color: number, radius = 0.8): string {
    const id = `aura_${++this.auraCounter}`;
    const c = new THREE.Color(color);
    this.auras.set(id, { anchor, color: c, radius });
    return id;
  }

  /** Stop an aura by ID. */
  stopAura(auraId: string): void {
    this.auras.delete(auraId);
  }

  /** Emit slow-drifting ambient particles in a volume. */
  emitAmbient(bounds: THREE.Box3, color: number, density = 0.5): void {
    const c = new THREE.Color(color);
    this.ambientEmitters.push({ bounds, color: c, density, accum: 0 });
  }

  /** Update all particles. Call every frame. */
  update(dt: number): void {
    // Process auras — spawn 1-2 particles per aura per frame
    for (const [, aura] of this.auras) {
      aura.anchor.getWorldPosition(_worldPos);
      const spawnCount = 1 + (Math.random() > 0.5 ? 1 : 0);
      for (let s = 0; s < spawnCount; s++) {
        const angle = Math.random() * Math.PI * 2;
        const px = _worldPos.x + Math.cos(angle) * aura.radius;
        const py = _worldPos.y + (Math.random() - 0.5) * 0.3;
        const pz = _worldPos.z + Math.sin(angle) * aura.radius;
        // Tangential velocity + slight upward drift
        const speed = 0.3 + Math.random() * 0.3;
        const vx = -Math.sin(angle) * speed;
        const vy = 0.1 + Math.random() * 0.1;
        const vz = Math.cos(angle) * speed;
        const life = 1.0 + Math.random();
        const size = 0.02 + Math.random() * 0.01;
        this.spawn(px, py, pz, vx, vy, vz, aura.color.r, aura.color.g, aura.color.b, life, size, 0);
      }
    }

    // Process ambient emitters
    for (const amb of this.ambientEmitters) {
      amb.accum += amb.density * dt;
      while (amb.accum >= 1) {
        amb.accum -= 1;
        const min = amb.bounds.min;
        const max = amb.bounds.max;
        const px = min.x + Math.random() * (max.x - min.x);
        const py = min.y + Math.random() * (max.y - min.y);
        const pz = min.z + Math.random() * (max.z - min.z);
        const vx = (Math.random() - 0.5) * 0.1;
        const vy = Math.random() * 0.05;
        const vz = (Math.random() - 0.5) * 0.1;
        const life = 3 + Math.random() * 2;
        const size = 0.01 + Math.random() * 0.01;
        this.spawn(px, py, pz, vx, vy, vz, amb.color.r, amb.color.g, amb.color.b, life, size, 0);
      }
    }

    // Update all particles
    const instanceColor = this.mesh.instanceColor!;
    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.active[i]) continue;

      const i3 = i * 3;

      // Integrate velocity and gravity
      this.velocities[i3 + 1] += this.gravities[i] * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // Decrease lifetime
      this.lifetimes[i] -= dt;

      if (this.lifetimes[i] <= 0) {
        // Deactivate
        this.active[i] = 0;
        _dummy.position.set(0, 0, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      // Scale: lerp from original size to 0 as lifetime approaches 0
      const t = this.lifetimes[i] / this.maxLifetimes[i];
      const s = this.sizes[i] * t;

      _dummy.position.set(
        this.positions[i3],
        this.positions[i3 + 1],
        this.positions[i3 + 2],
      );
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);

      // Set instance color
      instanceColor.setXYZ(i, this.colors[i3], this.colors[i3 + 1], this.colors[i3 + 2]);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;
  }

  /** Clean up all resources. */
  dispose(): void {
    this.auras.clear();
    this.ambientEmitters.length = 0;

    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
