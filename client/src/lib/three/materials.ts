import * as THREE from 'three';

export interface ZoneTheme {
  wallColor: number;
  wallEmissive: number;
  floorColor: number;
  floorEmissive: number;
  ambientColor: number;
  fogColor: number;
}

// The Hollows palette — cool desaturated blue-grays with subtle warm dirt accents
// VFX (fire, lightning, magic) provide the only saturated color in the scene
// Fog fades to cool cyan-blue for depth
const ZONE_THEMES: Record<string, ZoneTheme> = {
  the_gate: {
    wallColor: 0x323840,    // steel-slate with hint of warmth
    wallEmissive: 0x0c0e14,
    floorColor: 0x222830,   // dark charcoal-blue
    floorEmissive: 0x080a0e,
    ambientColor: 0x1a2028,
    fogColor: 0x0a0e14,
  },
  tomb_halls: {
    wallColor: 0x2a2e38,    // cool steel-slate
    wallEmissive: 0x0a0c12,
    floorColor: 0x1a1d24,   // dark charcoal-blue
    floorEmissive: 0x080a0e,
    ambientColor: 0x181c24,
    fogColor: 0x0a0e14,
  },
  the_mines: {
    wallColor: 0x303438,    // slate with subtle warm grime
    wallEmissive: 0x0c0e10,
    floorColor: 0x1e2228,   // dark slate with dirt accent
    floorEmissive: 0x0a0c0e,
    ambientColor: 0x1c2026,
    fogColor: 0x0a0e12,
  },
  the_web: {
    wallColor: 0x282e34,    // cooler blue-slate
    wallEmissive: 0x0a0e12,
    floorColor: 0x1c2228,   // deep blue-charcoal
    floorEmissive: 0x080c10,
    ambientColor: 0x182024,
    fogColor: 0x0a0e14,
  },
  forge_of_ruin: {
    wallColor: 0x343840,    // warm-tinged steel slate (grime)
    wallEmissive: 0x0e1014,
    floorColor: 0x252a32,   // slate with warm undertone
    floorEmissive: 0x0a0c10,
    ambientColor: 0x1e2228,
    fogColor: 0x0c0e14,
  },
  bone_throne: {
    wallColor: 0x2c3038,    // cool dark slate
    wallEmissive: 0x0a0c14,
    floorColor: 0x1c2028,   // deep charcoal-blue
    floorEmissive: 0x080a10,
    ambientColor: 0x181c26,
    fogColor: 0x0a0c14,
  },
  abyss_bridge: {
    wallColor: 0x262c34,    // darker steel-blue
    wallEmissive: 0x0a0c10,
    floorColor: 0x1a2028,   // deep dark slate
    floorEmissive: 0x080a0e,
    ambientColor: 0x141a22,
    fogColor: 0x080c12,
  },
  black_pit: {
    wallColor: 0x222830,    // darkest slate
    wallEmissive: 0x080a0e,
    floorColor: 0x161a22,   // near-black blue
    floorEmissive: 0x06080c,
    ambientColor: 0x101418,
    fogColor: 0x080a10,
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
    emissiveIntensity: 0.6,
    roughness: 0.85,
    metalness: 0.05,
  });
}

export function createFloorMaterial(zone: string): THREE.MeshStandardMaterial {
  const theme = getZoneTheme(zone);
  return new THREE.MeshStandardMaterial({
    color: theme.floorColor,
    emissive: theme.floorEmissive,
    emissiveIntensity: 0.4,
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
    the_gate: 0.012,
    tomb_halls: 0.018,
    the_mines: 0.022,
    the_web: 0.025,
    forge_of_ruin: 0.022,
    bone_throne: 0.025,
    abyss_bridge: 0.028,
    black_pit: 0.04,
  };
  return {
    color: theme.fogColor,
    density: FOG_DENSITIES[zone] || 0.035,
  };
}
