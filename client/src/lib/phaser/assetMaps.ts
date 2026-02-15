import type { ElementType, Stance, EnemyArchetype } from '../stores/types';

// Maps enemy names (from API) to their sprite image paths
export const ENEMY_SPRITE_MAP: Record<string, string> = {
  'Giant Rat': '/assets/giant-rat.png',
  'Cave Bat': '/assets/cave-bat.png',
  'Plague Rat': '/assets/blighted-rat.png',
  'Skeleton Warrior': '/assets/skeleton-warrior.png',
  'Gremlin Miner': '/assets/gremlin-miner.png',
  'Wandering Ghost': '/assets/wraith.png',
  'Wraith': '/assets/tomb-wraith.png',
  'Cave Troll': '/assets/cave-troll.png',
  'Giant Spider': '/assets/giant-spider.png',
  'Broodmother': '/assets/broodmother.png',
  'Brute Smith': '/assets/brute-smith.png',
  'Ember Colossus': '/assets/ember-colossus.png',
  'Death Knight': '/assets/death-knight.png',
  'The Ashborn': '/assets/the-ashborn.png',
  'Skeletal Dragon': '/assets/skeletal-dragon.png',
  'Skeleton Sentinel': '/assets/skeleton-sentinel.png',
  'Wraith Miner': '/assets/wraith-miner.png',
  'Torchwood': '/assets/torchwood.png',
};

// Per-enemy background overrides (takes priority over zone background)
export const ENEMY_BG_MAP: Record<string, string> = {
  'Sewer Rat': '/assets/sewer-rat-the-drain-tunnels.png',
  'Cave Bat': '/assets/cave-bat-the-upper-cavern.png',
  'Giant Rat': '/assets/giant-rat-the-ruined-storehouse.png',
  'Plague Rat': '/assets/plague-rat-the-toxic-junction.png',
  'Corrupted Hound': '/assets/corrupted-hound-the-kennel-passage.png',
  'Rabid Ghoul': '/assets/rabid-ghoul-the-defiled-crypt.png',
  'Wandering Ghost': '/assets/wandering-ghost-the-forgotten-shrine.png',
  'Tomb Shade': '/assets/tomb-shade-the-sealed-threshold.png',
};

// Zone ID to background image path
export const ZONE_BG_MAP: Record<string, string> = {
  'the_mines': '/assets/zone-the-mines.png',
  'the_web': '/assets/zone-the-web.png',
  'forge_of_ruin': '/assets/zone-forge-of-ruin.png',
  'tomb_halls': '/assets/zone-tomb-halls.png',
  'the_gate': '/assets/zone-the-gate.png',
  'bone_throne': '/assets/zone-bone-throne.png',
  'abyss_bridge': '/assets/zone-abyss-bridge.png',
};

// Fallback emoji when sprite fails to load
export const ENEMY_FALLBACK_EMOJI: Record<string, string> = {
  'Giant Rat': '🐀',
  'Cave Bat': '🦇',
  'Plague Rat': '🐀',
  'Skeleton Warrior': '💀',
  'Gremlin Miner': '👺',
  'Wandering Ghost': '👻',
  'Giant Spider': '🕷️',
  'Broodmother': '🕸️',
  'Brute Smith': '🔨',
  'Ember Colossus': '🔥',
  'Wraith': '👻',
  'Death Knight': '⚔️',
  'The Ashborn': '🔥',
  'Cave Troll': '🧌',
  'Skeletal Dragon': '🐉',
  'Skeleton Sentinel': '💀',
  'Wraith Miner': '👻',
  'Torchwood': '🌲',
};

// Element colors for particle tinting (Phaser hex colors)
export const ELEMENT_COLORS: Record<ElementType, { primary: number; secondary: number }> = {
  fire: { primary: 0xff4500, secondary: 0xff8c00 },
  ice: { primary: 0x00bfff, secondary: 0xe0ffff },
  shadow: { primary: 0x8b5ce6, secondary: 0x4a0080 },
  holy: { primary: 0xffd700, secondary: 0xfffacd },
  none: { primary: 0xffffff, secondary: 0xaaaaaa },
};

// Archetype-specific animation parameters
export const ARCHETYPE_ANIM: Record<EnemyArchetype, { lungeSpeed: number; lungeDistance: number; weight: string }> = {
  brute: { lungeSpeed: 600, lungeDistance: 80, weight: 'heavy' },
  guardian: { lungeSpeed: 500, lungeDistance: 50, weight: 'heavy' },
  assassin: { lungeSpeed: 250, lungeDistance: 120, weight: 'light' },
  caster: { lungeSpeed: 400, lungeDistance: 30, weight: 'light' },
  boss: { lungeSpeed: 500, lungeDistance: 100, weight: 'heavy' },
};

// Stance information for UI
export const STANCE_INFO: Record<Stance, { icon: string; label: string; description: string; atkMod: string; defMod: string; special: string }> = {
  aggressive: {
    icon: '⚔️',
    label: 'Aggressive',
    description: 'All-out offense',
    atkMod: '+35% ATK',
    defMod: '-20% DEF',
    special: '+13% Crit',
  },
  balanced: {
    icon: '⚖️',
    label: 'Balanced',
    description: 'Steady approach',
    atkMod: 'Standard',
    defMod: 'Standard',
    special: 'No modifier',
  },
  defensive: {
    icon: '🛡️',
    label: 'Defensive',
    description: 'Brace for impact',
    atkMod: '-30% ATK',
    defMod: '+40% DEF',
    special: '25% Block',
  },
  evasive: {
    icon: '💨',
    label: 'Evasive',
    description: 'Dodge and counter',
    atkMod: '-10% ATK',
    defMod: '-10% DEF',
    special: '30%+ Dodge',
  },
};

// Element-specific enemy tint (Phaser hex)
export const ELEMENT_TINT: Record<ElementType, number | null> = {
  fire: 0xffccaa,
  ice: 0xaaccff,
  shadow: 0xccaaff,
  holy: 0xffffcc,
  none: null,
};
