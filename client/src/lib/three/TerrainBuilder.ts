import * as THREE from 'three';
import { SimplexNoise } from './SimplexNoise';

export interface TerrainConfig {
  size?: number;
  segments?: number;
  heightScale?: number;
  seed?: number;
}

export interface TerrainData {
  mesh: THREE.Mesh;
  heightMap: Float32Array;
  segments: number;
  size: number;
}

const DEFAULT_SIZE = 200;
const DEFAULT_SEGMENTS = 128;
const DEFAULT_HEIGHT_SCALE = 8;

export function buildTerrain(config: TerrainConfig = {}): TerrainData {
  const size = config.size ?? DEFAULT_SIZE;
  const segments = config.segments ?? DEFAULT_SEGMENTS;
  const heightScale = config.heightScale ?? DEFAULT_HEIGHT_SCALE;
  const seed = config.seed ?? 42;

  const noise = new SimplexNoise(seed);
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2); // lay flat

  const positions = geo.attributes.position;
  const count = positions.count;
  const heightMap = new Float32Array(count);
  const half = size / 2;

  // Vertex colors
  const colors = new Float32Array(count * 3);
  const grassColor = new THREE.Color(0x4a7a3a);
  const rockColor = new THREE.Color(0x6a5a4a);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    // Normalized coords [-1, 1]
    const nx = x / half;
    const nz = z / half;

    // Multi-octave noise for rolling hills
    let h = noise.fbm(x * 0.015, z * 0.015, 4, 2, 0.5) * heightScale;

    // Mountain ridge at far edge (z < -85) with quadratic boost
    if (z < -85) {
      const t = (z + 85) / (-half + 85); // 0 at z=-85, 1 at z=-half
      h += t * t * 25;
    }

    // Flatten center area (player spawn)
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 15) {
      const t = distFromCenter / 15;
      h *= t * t; // smooth falloff to 0 at center
    }

    // Gentle edge lift to keep player in
    const edgeDist = Math.max(Math.abs(nx), Math.abs(nz));
    if (edgeDist > 0.85) {
      const t = (edgeDist - 0.85) / 0.15;
      h += t * t * 6;
    }

    positions.setY(i, h);
    heightMap[i] = h;

    // Vertex color: grass blending to rock at height + noise variation
    const heightFactor = Math.min(1, Math.max(0, h / (heightScale * 1.5)));
    const colorNoise = noise.noise2D(x * 0.05, z * 0.05) * 0.15;
    const blend = Math.min(1, Math.max(0, heightFactor + colorNoise));
    tmpColor.lerpColors(grassColor, rockColor, blend);

    // Add slight variation
    const variation = 1 + noise.noise2D(x * 0.1, z * 0.1) * 0.08;
    tmpColor.r *= variation;
    tmpColor.g *= variation;
    tmpColor.b *= variation;

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';

  return { mesh, heightMap, segments, size };
}

/** Bilinear interpolation to get terrain height at any world (x, z). */
export function getHeightAt(terrain: TerrainData, x: number, z: number): number {
  const { heightMap, segments, size } = terrain;
  const half = size / 2;

  // Convert world coords to grid coords
  const gx = ((x + half) / size) * segments;
  const gz = ((z + half) / size) * segments;

  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;

  const stride = segments + 1;

  // Clamp
  const ix0 = Math.max(0, Math.min(segments, ix));
  const iz0 = Math.max(0, Math.min(segments, iz));
  const ix1 = Math.min(segments, ix0 + 1);
  const iz1 = Math.min(segments, iz0 + 1);

  const h00 = heightMap[iz0 * stride + ix0];
  const h10 = heightMap[iz0 * stride + ix1];
  const h01 = heightMap[iz1 * stride + ix0];
  const h11 = heightMap[iz1 * stride + ix1];

  // Bilinear interpolation
  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fz;
}
