import * as THREE from 'three';

export interface DungeonLighting {
  ambient: THREE.AmbientLight;
  torch: THREE.PointLight;
  directional: THREE.DirectionalLight;
}

// Zone-specific ambient color overrides — cool desaturated blue-gray tones
const ZONE_AMBIENT: Record<string, { color: number; intensity: number }> = {
  the_gate:      { color: 0x7088a0, intensity: 1.5 },
  tomb_halls:    { color: 0x6080a0, intensity: 1.4 },
  the_mines:     { color: 0x708898, intensity: 1.5 },
  the_web:       { color: 0x5878a0, intensity: 1.3 },
  forge_of_ruin: { color: 0x7890a0, intensity: 1.5 },
  bone_throne:   { color: 0x6078a0, intensity: 1.3 },
  abyss_bridge:  { color: 0x5870a0, intensity: 1.2 },
  black_pit:     { color: 0x506888, intensity: 1.0 },
};

export function createDungeonLighting(scene: THREE.Scene, zone: string): DungeonLighting {
  // Ambient — dim zone-tuned fill
  const zoneAmb = ZONE_AMBIENT[zone] || { color: 0x555566, intensity: 0.4 };
  const ambient = new THREE.AmbientLight(zoneAmb.color, zoneAmb.intensity);
  scene.add(ambient);

  // Directional light — cool overhead, follows player (set in DungeonScene)
  const directional = new THREE.DirectionalLight(0x8899aa, 1.8);
  directional.position.set(0, 30, 0);
  directional.target.position.set(0, 0, 0);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 4096;
  directional.shadow.mapSize.height = 4096;
  directional.shadow.camera.left = -130;
  directional.shadow.camera.right = 130;
  directional.shadow.camera.top = 100;
  directional.shadow.camera.bottom = -100;
  directional.shadow.camera.near = 0.5;
  directional.shadow.camera.far = 120;
  directional.shadow.bias = -0.0005;
  directional.shadow.normalBias = 0.02;
  scene.add(directional);
  scene.add(directional.target);

  // Player torch: warm ember point light — larger radius for bigger map
  const torch = new THREE.PointLight(0xff8833, 8.0, 120, 1.0);
  torch.castShadow = true;
  torch.shadow.mapSize.width = 512;
  torch.shadow.mapSize.height = 512;
  torch.shadow.camera.near = 0.1;
  torch.shadow.camera.far = 50;
  torch.position.set(0, 6, 0);
  scene.add(torch);

  return { ambient, torch, directional };
}

export function updateTorchPosition(lighting: DungeonLighting, x: number, y: number, z: number) {
  lighting.torch.position.set(x, y, z);
}

let flickerTime = 0;
export function flickerTorch(lighting: DungeonLighting, dt: number) {
  flickerTime += dt;
  const flicker = 10.0 + Math.sin(flickerTime * 8) * 0.6 + Math.sin(flickerTime * 13) * 0.4;
  lighting.torch.intensity = flicker;
}

export function updateZoneLighting(lighting: DungeonLighting, zone: string) {
  const zoneAmb = ZONE_AMBIENT[zone];
  if (zoneAmb) {
    lighting.ambient.color.setHex(zoneAmb.color);
    lighting.ambient.intensity = zoneAmb.intensity;
  }
}

export function getZoneFogConfig(zone: string): { color: number; density: number } {
  const FOG_CONFIGS: Record<string, { color: number; density: number }> = {
    the_gate:      { color: 0x0a0e14, density: 0.006 },
    tomb_halls:    { color: 0x0a0e14, density: 0.008 },
    the_mines:     { color: 0x0a0e12, density: 0.010 },
    the_web:       { color: 0x0a0e14, density: 0.012 },
    forge_of_ruin: { color: 0x0c0e14, density: 0.010 },
    bone_throne:   { color: 0x0a0c14, density: 0.012 },
    abyss_bridge:  { color: 0x080c12, density: 0.014 },
    black_pit:     { color: 0x080a10, density: 0.020 },
  };
  return FOG_CONFIGS[zone] || { color: 0x0a0e14, density: 0.010 };
}
