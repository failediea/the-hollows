// PBR materials for procedural dungeon generation via @gltf-transform/core
// Maps The Hollows zone types to metallic-roughness PBR material sets

import { Document, Material } from '@gltf-transform/core';
import type { ZoneType } from './types.js';

export interface ZoneMaterials {
  floor: Material;
  wall: Material;
  ceiling: Material;
  trim: Material;
  pillar: Material;
  doorFrame: Material;
  torchBracket: Material;
  // Zone-specific
  propPrimary: Material;    // main prop material (bone, crystal, marble, brick, oak)
  propSecondary: Material;  // accent prop material (dried blood, wet stone, gold, slime, scorched)
  propEmissive: Material;   // glowing elements (torch flame, crystal glow, stained glass, bioluminescence, forge heat)
}

/** Convert a hex integer (0xRRGGBB) to [r, g, b] floats in 0..1 */
function hexToRGB(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

/** Scale an RGB tuple by a scalar (for emissive intensity baking) */
function scaleRGB(rgb: [number, number, number], s: number): [number, number, number] {
  return [rgb[0] * s, rgb[1] * s, rgb[2] * s];
}

/** Helper: create a material with standard PBR settings */
function mat(
  doc: Document,
  name: string,
  opts: {
    color: number;
    roughness: number;
    metalness: number;
    emissive?: number;
    emissiveIntensity?: number;
    alpha?: number;
  },
): Material {
  const m = doc.createMaterial(name)
    .setBaseColorFactor([...hexToRGB(opts.color), opts.alpha ?? 1.0])
    .setRoughnessFactor(opts.roughness)
    .setMetallicFactor(opts.metalness);

  if (opts.emissive !== undefined) {
    const intensity = opts.emissiveIntensity ?? 1.0;
    m.setEmissiveFactor(scaleRGB(hexToRGB(opts.emissive), intensity));
  }

  if (opts.alpha !== undefined && opts.alpha < 1.0) {
    m.setAlphaMode('BLEND');
  }

  return m;
}

// ---------------------------------------------------------------------------
// Zone material definitions
// ---------------------------------------------------------------------------

function createCryptMaterials(doc: Document): ZoneMaterials {
  return {
    wall: mat(doc, 'crypt_wall', {
      color: 0x2a2e38, roughness: 0.85, metalness: 0.05,
      emissive: 0x0a0c12, emissiveIntensity: 0.6,
    }),
    floor: mat(doc, 'crypt_floor', {
      color: 0x1e2228, roughness: 0.95, metalness: 0.0,
      emissive: 0x080a0e, emissiveIntensity: 0.4,
    }),
    ceiling: mat(doc, 'crypt_ceiling', {
      color: 0x222830, roughness: 0.9, metalness: 0.05,
      emissive: 0x080a0e, emissiveIntensity: 0.3,
    }),
    trim: mat(doc, 'crypt_trim', {
      color: 0x202430, roughness: 0.9, metalness: 0.08,
      emissive: 0x0a0c12, emissiveIntensity: 0.15,
    }),
    pillar: mat(doc, 'crypt_pillar', {
      color: 0x3a3e48, roughness: 0.7, metalness: 0.15,
      emissive: 0x0a0c12, emissiveIntensity: 0.35,
    }),
    doorFrame: mat(doc, 'crypt_doorFrame', {
      color: 0x4a3a2a, roughness: 0.5, metalness: 0.5,
      emissive: 0x1a0e04, emissiveIntensity: 0.2,
    }),
    torchBracket: mat(doc, 'crypt_torchBracket', {
      color: 0x4a3a2a, roughness: 0.5, metalness: 0.6,
      emissive: 0x1a0e04, emissiveIntensity: 0.3,
    }),
    // Bone props — warmest material in palette
    propPrimary: mat(doc, 'crypt_bone', {
      color: 0xd4c8a8, roughness: 0.7, metalness: 0.05,
      emissive: 0x1a1408, emissiveIntensity: 0.2,
    }),
    // Dried blood accent
    propSecondary: mat(doc, 'crypt_driedBlood', {
      color: 0x3a1a14, roughness: 0.85, metalness: 0.0,
      emissive: 0x0e0604, emissiveIntensity: 0.15,
    }),
    // Torch flame emissive
    propEmissive: mat(doc, 'crypt_torchFlame', {
      color: 0xff8833, roughness: 0.3, metalness: 0.0,
      emissive: 0xff6b20, emissiveIntensity: 2.0,
      alpha: 0.9,
    }),
  };
}

function createCavernMaterials(doc: Document): ZoneMaterials {
  return {
    wall: mat(doc, 'cavern_wall', {
      color: 0x383840, roughness: 0.95, metalness: 0.05,
      emissive: 0x0a0c10, emissiveIntensity: 0.5,
    }),
    floor: mat(doc, 'cavern_floor', {
      color: 0x2e3038, roughness: 0.95, metalness: 0.0,
      emissive: 0x080a0e, emissiveIntensity: 0.35,
    }),
    ceiling: mat(doc, 'cavern_ceiling', {
      color: 0x30343c, roughness: 0.95, metalness: 0.05,
      emissive: 0x080a0e, emissiveIntensity: 0.3,
    }),
    trim: mat(doc, 'cavern_trim', {
      color: 0x2e3238, roughness: 0.9, metalness: 0.08,
      emissive: 0x0a0c10, emissiveIntensity: 0.15,
    }),
    pillar: mat(doc, 'cavern_pillar', {
      color: 0x484c54, roughness: 0.8, metalness: 0.1,
      emissive: 0x0a0c10, emissiveIntensity: 0.35,
    }),
    doorFrame: mat(doc, 'cavern_doorFrame', {
      color: 0x404448, roughness: 0.85, metalness: 0.1,
      emissive: 0x080a0e, emissiveIntensity: 0.2,
    }),
    torchBracket: mat(doc, 'cavern_torchBracket', {
      color: 0x4a3a2a, roughness: 0.5, metalness: 0.6,
      emissive: 0x1a0e04, emissiveIntensity: 0.3,
    }),
    // Crystal props — glassy blue
    propPrimary: mat(doc, 'cavern_crystal', {
      color: 0x4488ff, roughness: 0.2, metalness: 0.5,
      emissive: 0x1144aa, emissiveIntensity: 0.6,
      alpha: 0.85,
    }),
    // Wet stone accent — low roughness for wet sheen
    propSecondary: mat(doc, 'cavern_wetStone', {
      color: 0x262c30, roughness: 0.6, metalness: 0.1,
      emissive: 0x080a0e, emissiveIntensity: 0.2,
    }),
    // Crystal glow emissive
    propEmissive: mat(doc, 'cavern_crystalGlow', {
      color: 0x4488ff, roughness: 0.15, metalness: 0.5,
      emissive: 0x2266cc, emissiveIntensity: 1.5,
      alpha: 0.85,
    }),
  };
}

function createCathedralMaterials(doc: Document): ZoneMaterials {
  return {
    wall: mat(doc, 'cathedral_wall', {
      color: 0x606068, roughness: 0.4, metalness: 0.1,
      emissive: 0x0c0e14, emissiveIntensity: 0.5,
    }),
    floor: mat(doc, 'cathedral_floor', {
      color: 0x505058, roughness: 0.35, metalness: 0.1,
      emissive: 0x080a0e, emissiveIntensity: 0.4,
    }),
    ceiling: mat(doc, 'cathedral_ceiling', {
      color: 0x585860, roughness: 0.45, metalness: 0.1,
      emissive: 0x0a0c10, emissiveIntensity: 0.35,
    }),
    // Gold trim — high metalness
    trim: mat(doc, 'cathedral_trim', {
      color: 0xaa8833, roughness: 0.3, metalness: 0.9,
      emissive: 0x221a08, emissiveIntensity: 0.3,
    }),
    pillar: mat(doc, 'cathedral_pillar', {
      color: 0x6a6a72, roughness: 0.35, metalness: 0.12,
      emissive: 0x0c0e14, emissiveIntensity: 0.35,
    }),
    doorFrame: mat(doc, 'cathedral_doorFrame', {
      color: 0x3a2a1e, roughness: 0.9, metalness: 0.0,
      emissive: 0x0e0804, emissiveIntensity: 0.15,
    }),
    torchBracket: mat(doc, 'cathedral_torchBracket', {
      color: 0xaa8833, roughness: 0.35, metalness: 0.85,
      emissive: 0x221a08, emissiveIntensity: 0.25,
    }),
    // Dark marble props
    propPrimary: mat(doc, 'cathedral_marble', {
      color: 0x707078, roughness: 0.3, metalness: 0.1,
      emissive: 0x0e1014, emissiveIntensity: 0.3,
    }),
    // Gold accent
    propSecondary: mat(doc, 'cathedral_goldAccent', {
      color: 0xaa8833, roughness: 0.25, metalness: 0.9,
      emissive: 0x2a220a, emissiveIntensity: 0.35,
    }),
    // Stained glass emissive — warm multi-color glow
    propEmissive: mat(doc, 'cathedral_stainedGlass', {
      color: 0xcc8844, roughness: 0.2, metalness: 0.05,
      emissive: 0xaa6622, emissiveIntensity: 1.2,
      alpha: 0.75,
    }),
  };
}

function createSewerMaterials(doc: Document): ZoneMaterials {
  return {
    wall: mat(doc, 'sewer_wall', {
      color: 0x5a3830, roughness: 0.85, metalness: 0.05,
      emissive: 0x0c0806, emissiveIntensity: 0.4,
    }),
    floor: mat(doc, 'sewer_floor', {
      color: 0x4a2e28, roughness: 0.9, metalness: 0.0,
      emissive: 0x0a0806, emissiveIntensity: 0.3,
    }),
    ceiling: mat(doc, 'sewer_ceiling', {
      color: 0x523430, roughness: 0.85, metalness: 0.05,
      emissive: 0x0a0806, emissiveIntensity: 0.3,
    }),
    // Corroded metal trim
    trim: mat(doc, 'sewer_trim', {
      color: 0x3a3a40, roughness: 0.65, metalness: 0.4,
      emissive: 0x080808, emissiveIntensity: 0.15,
    }),
    pillar: mat(doc, 'sewer_pillar', {
      color: 0x644038, roughness: 0.8, metalness: 0.08,
      emissive: 0x0c0806, emissiveIntensity: 0.3,
    }),
    doorFrame: mat(doc, 'sewer_doorFrame', {
      color: 0x3a3a40, roughness: 0.6, metalness: 0.4,
      emissive: 0x080808, emissiveIntensity: 0.1,
    }),
    torchBracket: mat(doc, 'sewer_torchBracket', {
      color: 0x3a3a40, roughness: 0.6, metalness: 0.45,
      emissive: 0x1a0e04, emissiveIntensity: 0.25,
    }),
    // Brick props
    propPrimary: mat(doc, 'sewer_brick', {
      color: 0x5a3830, roughness: 0.85, metalness: 0.05,
      emissive: 0x0c0806, emissiveIntensity: 0.2,
    }),
    // Slime accent — low roughness, slight emissive
    propSecondary: mat(doc, 'sewer_slime', {
      color: 0x334a22, roughness: 0.2, metalness: 0.0,
      emissive: 0x1a2a10, emissiveIntensity: 0.6,
    }),
    // Bioluminescence — sickly green glow
    propEmissive: mat(doc, 'sewer_bioluminescence', {
      color: 0x44662a, roughness: 0.25, metalness: 0.0,
      emissive: 0x336622, emissiveIntensity: 1.5,
      alpha: 0.85,
    }),
  };
}

function createFortressMaterials(doc: Document): ZoneMaterials {
  return {
    wall: mat(doc, 'fortress_wall', {
      color: 0x404850, roughness: 0.8, metalness: 0.05,
      emissive: 0x0c0e10, emissiveIntensity: 0.5,
    }),
    floor: mat(doc, 'fortress_floor', {
      color: 0x363e46, roughness: 0.85, metalness: 0.0,
      emissive: 0x080a0e, emissiveIntensity: 0.35,
    }),
    ceiling: mat(doc, 'fortress_ceiling', {
      color: 0x3c444c, roughness: 0.82, metalness: 0.05,
      emissive: 0x0a0c0e, emissiveIntensity: 0.3,
    }),
    // Steel trim — high metalness
    trim: mat(doc, 'fortress_trim', {
      color: 0x5a5a62, roughness: 0.4, metalness: 0.7,
      emissive: 0x101014, emissiveIntensity: 0.2,
    }),
    pillar: mat(doc, 'fortress_pillar', {
      color: 0x505860, roughness: 0.75, metalness: 0.1,
      emissive: 0x0c0e10, emissiveIntensity: 0.35,
    }),
    doorFrame: mat(doc, 'fortress_doorFrame', {
      color: 0x5a5a62, roughness: 0.45, metalness: 0.65,
      emissive: 0x101014, emissiveIntensity: 0.15,
    }),
    torchBracket: mat(doc, 'fortress_torchBracket', {
      color: 0x5a5a62, roughness: 0.4, metalness: 0.7,
      emissive: 0x1a0e04, emissiveIntensity: 0.3,
    }),
    // Oak wood props
    propPrimary: mat(doc, 'fortress_oak', {
      color: 0x4a3520, roughness: 0.85, metalness: 0.0,
      emissive: 0x0e0804, emissiveIntensity: 0.15,
    }),
    // Scorched stone accent — warm dark emissive
    propSecondary: mat(doc, 'fortress_scorchedStone', {
      color: 0x2a2220, roughness: 0.9, metalness: 0.05,
      emissive: 0x1a0c04, emissiveIntensity: 0.4,
    }),
    // Forge heat emissive — deep ember glow
    propEmissive: mat(doc, 'fortress_forgeHeat', {
      color: 0xcc6622, roughness: 0.3, metalness: 0.1,
      emissive: 0xcc4411, emissiveIntensity: 1.8,
      alpha: 0.9,
    }),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ZONE_CREATORS: Record<ZoneType, (doc: Document) => ZoneMaterials> = {
  crypt: createCryptMaterials,
  cavern: createCavernMaterials,
  cathedral: createCathedralMaterials,
  sewer: createSewerMaterials,
  fortress: createFortressMaterials,
};

export function createZoneMaterials(doc: Document, zone: ZoneType): ZoneMaterials {
  return ZONE_CREATORS[zone](doc);
}
