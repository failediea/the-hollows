/**
 * LPC Sprite configuration for enemies.
 * Maps mob IDs to sprite sheets and animation definitions.
 */

export type FacingDir = 'up' | 'left' | 'down' | 'right';

export interface AnimDef {
  row: number;
  frames: number;
  frameRate?: number;
}

export interface DirectionalAnimDef {
  up: AnimDef;
  left: AnimDef;
  down: AnimDef;
  right: AnimDef;
}

export interface SpriteSheetConfig {
  key: string;           // Phaser texture key
  path: string;          // URL path (relative to /combat/)
  frameWidth: number;
  frameHeight: number;
  // Directional animations
  animations: {
    idle?: DirectionalAnimDef;
    walk?: DirectionalAnimDef;
    attack?: DirectionalAnimDef;
    hurt?: AnimDef;  // hurt is usually not directional
    die?: AnimDef;
  };
  humanoid?: boolean;
  scale?: number;
}

// LPC humanoid spritesheet layout (832x1344 = 13 cols × 21 rows @ 64×64)
// Row 0-3: spellcast (up, left, down, right) - 7 frames
// Row 4-7: thrust (up, left, down, right) - 8 frames  
// Row 8-11: walk (up, left, down, right) - 9 frames
// Row 12-15: slash (up, left, down, right) - 6 frames
// Row 16-19: shoot (up, left, down, right) - 13 frames
// Row 20: hurt - 6 frames

function dirAnim(baseRow: number, frames: number, frameRate: number): DirectionalAnimDef {
  return {
    up:    { row: baseRow,     frames, frameRate },
    left:  { row: baseRow + 1, frames, frameRate },
    down:  { row: baseRow + 2, frames, frameRate },
    right: { row: baseRow + 3, frames, frameRate },
  };
}

const HUMANOID_ANIMS = {
  idle: dirAnim(8, 1, 1),        // Walk row, 1 frame = standing
  walk: dirAnim(8, 9, 10),       // Walk rows 8-11
  attack: dirAnim(12, 6, 12),    // Slash rows 12-15
  hurt: { row: 20, frames: 6, frameRate: 10 } as AnimDef,
};

// Monster spritesheet layout (from bluecarrot16 LPC Monsters):
// Row 0: idle/walk up
// Row 1: idle/walk left
// Row 2: idle/walk down  
// Row 3: idle/walk right

function monsterDirAnim(frames: number, frameRate: number): DirectionalAnimDef {
  return {
    up:    { row: 0, frames, frameRate },
    left:  { row: 1, frames, frameRate },
    down:  { row: 2, frames, frameRate },
    right: { row: 3, frames, frameRate },
  };
}

// Player character sprite (Led series - 128x256, 32x32 frames, 4 cols × 8 rows)
// Row 0: walk down (4f), Row 1: idle down (2f)
// Row 2: walk left (4f), Row 3: idle left (2f)
// Row 4: walk right (4f), Row 5: idle right (2f)
// Row 6: walk up (4f), Row 7: idle up (2f)
// LPC humanoid player anims (same layout as enemy humanoids: 832x1344, 64x64)
const PLAYER_LPC_ANIMS = {
  idle: dirAnim(8, 1, 1),
  walk: dirAnim(8, 9, 10),
  attack: dirAnim(12, 6, 12),
  hurt: { row: 20, frames: 6, frameRate: 10 } as AnimDef,
};

export const PLAYER_SPRITE_CONFIGS: SpriteSheetConfig[] = [
  {
    key: 'player_dark_knight', path: 'sprites/player_dark_knight.png?v=2',
    frameWidth: 64, frameHeight: 64, humanoid: true, scale: 0.9,
    animations: PLAYER_LPC_ANIMS,
  },
  {
    key: 'player_rogue', path: 'sprites/player_rogue.png',
    frameWidth: 64, frameHeight: 64, humanoid: true, scale: 1.2,
    animations: PLAYER_LPC_ANIMS,
  },
  {
    key: 'player_chain_warrior', path: 'sprites/player_chain_warrior.png',
    frameWidth: 64, frameHeight: 64, humanoid: true, scale: 1.2,
    animations: PLAYER_LPC_ANIMS,
  },
  {
    key: 'player_warrior', path: 'sprites/player_warrior.png',
    frameWidth: 32, frameHeight: 32, scale: 2.2,
    animations: {
      walk: { down: { row: 0, frames: 4, frameRate: 8 }, left: { row: 2, frames: 4, frameRate: 8 }, right: { row: 4, frames: 4, frameRate: 8 }, up: { row: 6, frames: 4, frameRate: 8 } },
      idle: { down: { row: 1, frames: 2, frameRate: 3 }, left: { row: 3, frames: 2, frameRate: 3 }, right: { row: 5, frames: 2, frameRate: 3 }, up: { row: 7, frames: 2, frameRate: 3 } },
    },
  },
  {
    key: 'player_LedA', path: 'sprites/LedA.png',
    frameWidth: 32, frameHeight: 32, scale: 2.5,
    animations: {
      walk: { down: { row: 0, frames: 4, frameRate: 8 }, left: { row: 2, frames: 4, frameRate: 8 }, right: { row: 4, frames: 4, frameRate: 8 }, up: { row: 6, frames: 4, frameRate: 8 } },
      idle: { down: { row: 1, frames: 2, frameRate: 3 }, left: { row: 3, frames: 2, frameRate: 3 }, right: { row: 5, frames: 2, frameRate: 3 }, up: { row: 7, frames: 2, frameRate: 3 } },
    },
  },
  {
    key: 'player_LedB', path: 'sprites/LedB.png',
    frameWidth: 32, frameHeight: 32, scale: 1.8,
    animations: {
      walk: { down: { row: 0, frames: 4, frameRate: 8 }, left: { row: 2, frames: 4, frameRate: 8 }, right: { row: 4, frames: 4, frameRate: 8 }, up: { row: 6, frames: 4, frameRate: 8 } },
      idle: { down: { row: 1, frames: 2, frameRate: 3 }, left: { row: 3, frames: 2, frameRate: 3 }, right: { row: 5, frames: 2, frameRate: 3 }, up: { row: 7, frames: 2, frameRate: 3 } },
    },
  },
  {
    key: 'player_LedC', path: 'sprites/LedC.png',
    frameWidth: 32, frameHeight: 32, scale: 1.8,
    animations: {
      walk: { down: { row: 0, frames: 4, frameRate: 8 }, left: { row: 2, frames: 4, frameRate: 8 }, right: { row: 4, frames: 4, frameRate: 8 }, up: { row: 6, frames: 4, frameRate: 8 } },
      idle: { down: { row: 1, frames: 2, frameRate: 3 }, left: { row: 3, frames: 2, frameRate: 3 }, right: { row: 5, frames: 2, frameRate: 3 }, up: { row: 7, frames: 2, frameRate: 3 } },
    },
  },
  {
    key: 'player_LedD', path: 'sprites/LedD.png',
    frameWidth: 32, frameHeight: 32, scale: 1.8,
    animations: {
      walk: { down: { row: 0, frames: 4, frameRate: 8 }, left: { row: 2, frames: 4, frameRate: 8 }, right: { row: 4, frames: 4, frameRate: 8 }, up: { row: 6, frames: 4, frameRate: 8 } },
      idle: { down: { row: 1, frames: 2, frameRate: 3 }, left: { row: 3, frames: 2, frameRate: 3 }, right: { row: 5, frames: 2, frameRate: 3 }, up: { row: 7, frames: 2, frameRate: 3 } },
    },
  },
];

export const SPRITE_CONFIGS: Record<string, SpriteSheetConfig> = {
  // === Humanoid enemies (full LPC spritesheets) ===
  skeleton: {
    key: 'spr_skeleton',
    path: 'sprites/skeleton.png',
    frameWidth: 64,
    frameHeight: 64,
    humanoid: true,
    animations: HUMANOID_ANIMS,
    scale: 1.2,
  },
  zombie: {
    key: 'spr_zombie',
    path: 'sprites/zombie.png',
    frameWidth: 64,
    frameHeight: 64,
    humanoid: true,
    animations: HUMANOID_ANIMS,
    scale: 1.2,
  },

  // === Monster enemies (non-humanoid) ===
  bat: {
    key: 'spr_bat',
    path: 'sprites/bat.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(7, 8),
      walk: monsterDirAnim(7, 8),
    },
    scale: 0.9,
  },
  ghost: {
    key: 'spr_ghost',
    path: 'sprites/ghost.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(6, 6),
      walk: monsterDirAnim(6, 8),
    },
    scale: 1.1,
  },
  snake: {
    key: 'spr_snake',
    path: 'sprites/snake.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(7, 6),
      walk: monsterDirAnim(7, 8),
    },
    scale: 1.0,
  },
  slime: {
    key: 'spr_slime',
    path: 'sprites/slime.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(4, 4),
      walk: monsterDirAnim(4, 6),
    },
    scale: 1.0,
  },
  spider: {
    key: 'spr_spider',
    path: 'sprites/spider.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(4, 6),
      walk: monsterDirAnim(4, 8),
      die: { row: 4, frames: 3, frameRate: 6 } as AnimDef,
    },
    scale: 1.1,
  },
  big_worm: {
    key: 'spr_big_worm',
    path: 'sprites/big_worm.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(6, 6),
      walk: monsterDirAnim(6, 8),
    },
    scale: 1.0,
  },
  eyeball: {
    key: 'spr_eyeball',
    path: 'sprites/eyeball.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: monsterDirAnim(7, 6),
      walk: monsterDirAnim(7, 8),
    },
    scale: 1.0,
  },
};

// Map mob IDs from the game to sprite config keys
// Enemies without a direct sprite will use programmatic fallback
export const MOB_SPRITE_MAP: Record<string, string> = {
  // Zone 1: The Gate
  rat: 'snake',           // No rat sprite, use snake as stand-in
  bat: 'bat',
  plague_rat: 'snake',    // No rat sprite, use snake

  // Zone 2: Tomb Halls 
  skeleton: 'skeleton',
  wight: 'zombie',        // Wight → zombie sprite (undead)
  tomb_guardian: 'skeleton',
  bone_archer: 'skeleton',
  cursed_knight: 'zombie',
  wandering_ghost: 'ghost',

  // Zone 3: The Mines
  gremlin: 'slime',       // No gremlin sprite, use slime
  gremlin_chief: 'slime',
  cave_troll: 'big_worm', // No troll, use big worm
  gem_golem: 'eyeball',   // Placeholder

  // Zone 4: The Web
  giant_spider: 'spider',
  broodmother: 'spider',
  web_stalker: 'spider',
  venom_spitter: 'spider',
  silk_weaver: 'spider',
  deep_crawler: 'big_worm',

  // Zone 5: Forge of Ruin
  brute_smith: 'skeleton',
  brute_warlord: 'skeleton',
  fire_elemental: 'ghost', // Elemental → ghost-like
  molten_golem: 'eyeball',
  dark_smith: 'zombie',

  // Zone 6: Bone Throne
  wraith: 'ghost',
  death_knight: 'zombie',
  necromancer: 'zombie',
  bone_dragon: 'big_worm', // Placeholder
  soul_reaver: 'ghost',

  // Zone 7: The Abyss
  ashborn: 'ghost',        // Final boss placeholder

  // Default shade
  shade: 'ghost',
};

/**
 * Get sprite config for a mob ID. Returns undefined if no sprite available.
 */
export function getSpriteConfig(mobId: string): SpriteSheetConfig | undefined {
  const spriteKey = MOB_SPRITE_MAP[mobId];
  if (!spriteKey) return undefined;
  return SPRITE_CONFIGS[spriteKey];
}

/**
 * Get all unique sprite configs that need to be loaded.
 */
export function getAllSpriteConfigs(): SpriteSheetConfig[] {
  const seen = new Set<string>();
  const configs: SpriteSheetConfig[] = [];
  for (const config of Object.values(SPRITE_CONFIGS)) {
    if (!seen.has(config.key)) {
      seen.add(config.key);
      configs.push(config);
    }
  }
  return configs;
}
