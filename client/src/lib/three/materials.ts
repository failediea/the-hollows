import * as THREE from 'three';

export interface ZoneTheme {
  wallColor: number;
  wallEmissive: number;
  floorColor: number;
  floorEmissive: number;
  ambientColor: number;
  fogColor: number;
}

// The Hollows palette — dark fantasy with warm ember/bone/gold accents
// Key tokens: void-black #0a0a0f, deep-black #12121a, stone-gray #1a1a24,
//   ember-orange #ff6b35, flame-red #ff3333, gold #ffd700, bone-white #e8dcc4
const ZONE_THEMES: Record<string, ZoneTheme> = {
  the_gate: {
    wallColor: 0x9a8060,    // warm golden sandstone
    wallEmissive: 0x2a1e10,
    floorColor: 0x6a5a48,   // dark warm stone
    floorEmissive: 0x1a1408,
    ambientColor: 0x342a20,
    fogColor: 0x0a0a0f,
  },
  tomb_halls: {
    wallColor: 0x7a7080,    // cool blue-gray stone
    wallEmissive: 0x141420,
    floorColor: 0x4a4450,   // dark cool stone floor
    floorEmissive: 0x0c0c14,
    ambientColor: 0x2a2430,
    fogColor: 0x0a0a0f,
  },
  the_mines: {
    wallColor: 0x9a7840,    // rich earthy amber rock
    wallEmissive: 0x2a1e08,
    floorColor: 0x6a5430,   // packed amber dirt
    floorEmissive: 0x1a1406,
    ambientColor: 0x382818,
    fogColor: 0x0a0a0f,
  },
  the_web: {
    wallColor: 0x5a8a5a,    // vivid sickly green stone
    wallEmissive: 0x0e220e,
    floorColor: 0x384838,   // dark green stone
    floorEmissive: 0x0a180a,
    ambientColor: 0x1e2a1e,
    fogColor: 0x0a0a0f,
  },
  forge_of_ruin: {
    wallColor: 0xaa5830,    // hot orange-red volcanic stone
    wallEmissive: 0x331808,
    floorColor: 0x7a3820,   // charred ground
    floorEmissive: 0x1a0e04,
    ambientColor: 0x3a1c0a,
    fogColor: 0x0a0a0f,
  },
  bone_throne: {
    wallColor: 0x8a58b0,    // deep vibrant purple
    wallEmissive: 0x200e38,
    floorColor: 0x503870,   // deep purple stone
    floorEmissive: 0x100820,
    ambientColor: 0x201838,
    fogColor: 0x0a0a0f,
  },
  abyss_bridge: {
    wallColor: 0x5a6a7a,    // cold steel blue
    wallEmissive: 0x0e1420,
    floorColor: 0x3a4454,   // dark steel floor
    floorEmissive: 0x080c14,
    ambientColor: 0x14141c,
    fogColor: 0x0a0a0f,
  },
  black_pit: {
    wallColor: 0x4a4a58,    // deep obsidian with faint void glow
    wallEmissive: 0x0e0a14,
    floorColor: 0x302e3a,   // abyssal floor
    floorEmissive: 0x08060c,
    ambientColor: 0x0e0e14,
    fogColor: 0x0a0a0f,
  },
};

const DEFAULT_THEME = ZONE_THEMES.tomb_halls;

export function getZoneTheme(zone: string): ZoneTheme {
  return ZONE_THEMES[zone] || DEFAULT_THEME;
}

export function createWallMaterial(zone: string): THREE.MeshStandardMaterial {
  const theme = getZoneTheme(zone);
  return new THREE.MeshStandardMaterial({
    color: theme.wallColor,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.4,
    roughness: 0.85,
    metalness: 0.05,
  });
}

export function createFloorMaterial(zone: string): THREE.MeshStandardMaterial {
  const theme = getZoneTheme(zone);
  return new THREE.MeshStandardMaterial({
    color: theme.floorColor,
    emissive: theme.floorEmissive,
    emissiveIntensity: 0.3,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

export function createPillarMaterial(zone: string): THREE.MeshStandardMaterial {
  const theme = getZoneTheme(zone);
  // Slightly lighter than wall, more metalness for polished stone pillars
  const lighterColor = (theme.wallColor & 0xfefefe) + 0x101010;
  return new THREE.MeshStandardMaterial({
    color: lighterColor,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.35,
    roughness: 0.7,
    metalness: 0.15,
  });
}

export function createTorchBracketMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x4a3a2a,
    emissive: 0x1a0e04,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0.6,
  });
}

export function createRubbleMaterial(zone: string): THREE.MeshStandardMaterial {
  const theme = getZoneTheme(zone);
  // Darker, rougher variant of wall material
  const darkerColor = Math.max((theme.wallColor >> 1) & 0x7f7f7f, 0x1a1a1a);
  return new THREE.MeshStandardMaterial({
    color: darkerColor,
    emissive: theme.wallEmissive,
    emissiveIntensity: 0.15,
    roughness: 0.95,
    metalness: 0.0,
  });
}

export function createBoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xd4c8a8,
    emissive: 0x1a1408,
    emissiveIntensity: 0.2,
    roughness: 0.7,
    metalness: 0.05,
  });
}

export function createBannerMaterial(accentColor: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.15,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

// Archetype colors — warm dark-fantasy palette
const ARCHETYPE_COLORS: Record<string, number> = {
  brute: 0xa05028,     // warmer rust
  guardian: 0x6a7a6a,   // lighter stone gray-green
  assassin: 0x3a6a3a,   // more saturated forest green
  caster: 0x7a4a7a,     // more vivid mystic purple
  boss: 0xcc4422,       // brighter ember-red
};

// Element emissive glow colors
const ELEMENT_EMISSIVE: Record<string, number> = {
  fire: 0x661a00,
  ice: 0x002266,
  shadow: 0x220044,
  holy: 0x444400,
  none: 0x141414,
};

export function createEnemyMaterial(archetype: string, element: string): THREE.MeshStandardMaterial {
  const base = ARCHETYPE_COLORS[archetype] || 0x666666;
  const glow = ELEMENT_EMISSIVE[element] || 0x0a0a0a;
  return new THREE.MeshStandardMaterial({
    color: base,
    emissive: glow,
    emissiveIntensity: 0.5,
    roughness: 0.6,
    metalness: 0.2,
  });
}

// Resource style colors matching ArenaScene.getResourceStyle
const MINING_IDS = ['torchwood', 'iron_scraps', 'dark_iron', 'cursed_steel', 'grave_iron'];
const ORGANIC_IDS = ['herbs', 'spider_silk', 'shadow_thread', 'venom_sac'];
const TREASURE_IDS = ['bone_dust', 'ancient_coins', 'gems', 'ember_core', 'starsilver_ore'];

export function getResourceColor(resourceId: string): { color: number; emissive: number } {
  if (MINING_IDS.includes(resourceId)) return { color: 0x8b7355, emissive: 0x221a0e };
  if (ORGANIC_IDS.includes(resourceId)) return { color: 0x44aa55, emissive: 0x0e2a14 };
  if (TREASURE_IDS.includes(resourceId)) return { color: 0xddaa33, emissive: 0x2a220a };
  return { color: 0x9955ee, emissive: 0x1a0e2a };
}

export function createResourceMaterial(resourceId: string): THREE.MeshStandardMaterial {
  const { color, emissive } = getResourceColor(resourceId);
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.4,
    transparent: true,
    opacity: 0.9,
  });
}

export function createFogConfig(zone: string): { color: number; density: number } {
  const theme = getZoneTheme(zone);
  const FOG_DENSITIES: Record<string, number> = {
    the_gate: 0.02,
    tomb_halls: 0.035,
    the_mines: 0.04,
    the_web: 0.045,
    forge_of_ruin: 0.04,
    bone_throne: 0.045,
    abyss_bridge: 0.05,
    black_pit: 0.08,
  };
  return {
    color: theme.fogColor,
    density: FOG_DENSITIES[zone] || 0.035,
  };
}
