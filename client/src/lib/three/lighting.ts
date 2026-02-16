import * as THREE from 'three';

export interface DungeonLighting {
  ambient: THREE.AmbientLight;
  torch: THREE.PointLight;
  directional: THREE.DirectionalLight;
}

// Zone-specific ambient color overrides
const ZONE_AMBIENT: Record<string, { color: number; intensity: number }> = {
  the_gate:      { color: 0x9a8060, intensity: 1.4 },   // warm amber
  tomb_halls:    { color: 0x708090, intensity: 1.2 },   // cool blue-gray
  the_mines:     { color: 0x9a8050, intensity: 1.3 },   // earthy warm amber
  the_web:       { color: 0x60a060, intensity: 1.1 },   // sickly green tint
  forge_of_ruin: { color: 0xb06030, intensity: 1.4 },   // hot red-orange
  bone_throne:   { color: 0x8060a0, intensity: 1.1 },   // corruption purple
  abyss_bridge:  { color: 0x607090, intensity: 1.0 },   // cold blue
  black_pit:     { color: 0x4a4a5a, intensity: 0.8 },   // dim but visible
};

export function createDungeonLighting(scene: THREE.Scene, zone: string): DungeonLighting {
  // Ambient — warm low fill, zone-tuned
  const zoneAmb = ZONE_AMBIENT[zone] || { color: 0x555566, intensity: 0.6 };
  const ambient = new THREE.AmbientLight(zoneAmb.color, zoneAmb.intensity);
  scene.add(ambient);

  // Directional light from above — bright overhead dungeon illumination
  const directional = new THREE.DirectionalLight(0xaaaacc, 1.5);
  directional.position.set(0, 30, 0);
  directional.target.position.set(0, 0, 0);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 2048;
  directional.shadow.mapSize.height = 2048;
  directional.shadow.camera.left = -75;
  directional.shadow.camera.right = 75;
  directional.shadow.camera.top = 55;
  directional.shadow.camera.bottom = -55;
  directional.shadow.camera.near = 0.5;
  directional.shadow.camera.far = 80;
  scene.add(directional);
  scene.add(directional.target);

  // Player torch: warm ember point light following the player — large radius
  const torch = new THREE.PointLight(0xff8833, 8.0, 100, 1.0);
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
  const flicker = 7.5 + Math.sin(flickerTime * 8) * 0.5 + Math.sin(flickerTime * 13) * 0.3;
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
    the_gate:      { color: 0x0a0a0f, density: 0.008 },
    tomb_halls:    { color: 0x0a0a0f, density: 0.012 },
    the_mines:     { color: 0x0a0a0f, density: 0.014 },
    the_web:       { color: 0x0a0a0f, density: 0.015 },
    forge_of_ruin: { color: 0x0a0a0f, density: 0.014 },
    bone_throne:   { color: 0x0a0a0f, density: 0.015 },
    abyss_bridge:  { color: 0x0a0a0f, density: 0.018 },
    black_pit:     { color: 0x0a0a0f, density: 0.025 },
  };
  return FOG_CONFIGS[zone] || { color: 0x0a0a0f, density: 0.012 };
}
