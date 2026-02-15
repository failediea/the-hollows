/**
 * Treasure Class loot system
 * 
 * Flow: Kill → NoDrop check → TC roll → Base item → Quality waterfall
 * Each kill is independent, no pity timer
 */

import Database from 'better-sqlite3';
import { secureRandom } from './crypto-rng.js';

// ============ TYPES ============

export interface TreasureClass {
  id: string;
  name: string;
  level: number; // TC level determines what can drop
  entries: TCEntry[];
  noDrop: number; // Weight for nothing dropping (higher = less drops)
  picks: number; // Number of rolls (bosses get more)
}

export interface TCEntry {
  type: 'item' | 'tc'; // Direct item or sub-TC reference
  ref: string; // Item code or TC id
  weight: number; // Relative weight for selection
}

export interface LootDrop {
  itemCode: string;
  itemName: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
  originalRarity: string; // Base item rarity before quality roll
  upgraded: boolean; // Whether quality was upgraded
}

// ============ QUALITY WATERFALL ============
// When a base item drops, roll quality in order: Legendary → Rare → Uncommon → Common
// Each check has a base chance modified by monster level and player luck

const QUALITY_CHANCES = {
  legendary: 0.005, // 0.5% base
  cursed: 0.01,     // 1% base (special cursed items)
  rare: 0.05,       // 5% base
  uncommon: 0.20,   // 20% base
  // common: remainder
};

// Monster level multiplier for quality chances
// Higher level monsters = better quality odds
function getQualityMultiplier(monsterLevel: number): number {
  return 1.0 + (monsterLevel - 1) * 0.15; // +15% per level above 1
}

function rollQuality(
  _baseRarity: string,
  monsterLevel: number,
  playerLuck: number,
  isBoss: boolean
): string {
  const mult = getQualityMultiplier(monsterLevel);
  const luckBonus = 1.0 + playerLuck * 0.02; // +2% per luck point
  const bossBonus = isBoss ? 2.0 : 1.0; // Bosses double quality chances

  // Waterfall: check from best to worst
  const roll = secureRandom();
  
  let cumulative = 0;
  cumulative += QUALITY_CHANCES.legendary * mult * luckBonus * bossBonus;
  if (roll < cumulative) return 'legendary';
  
  cumulative += QUALITY_CHANCES.cursed * mult * luckBonus * bossBonus;
  if (roll < cumulative) return 'cursed';
  
  cumulative += QUALITY_CHANCES.rare * mult * luckBonus * bossBonus;
  if (roll < cumulative) return 'rare';
  
  cumulative += QUALITY_CHANCES.uncommon * mult * luckBonus * bossBonus;
  if (roll < cumulative) return 'uncommon';
  
  return 'common';
}

// ============ TREASURE CLASSES ============
// Hierarchical TC tree — monsters reference a TC, which can contain items or sub-TCs

const TREASURE_CLASSES: Record<string, TreasureClass> = {
  // === TIER 1: Gate zone (level 1-3) ===
  'tc_junk': {
    id: 'tc_junk', name: 'Junk', level: 1, picks: 1, noDrop: 3,
    entries: [
      { type: 'item', ref: 'torchwood', weight: 5 },
      { type: 'item', ref: 'herbs', weight: 4 },
      { type: 'item', ref: 'iron_scraps', weight: 3 },
      { type: 'item', ref: 'rat_pelt', weight: 3 },
      { type: 'item', ref: 'bat_wing', weight: 2 },
    ],
  },
  'tc_gate': {
    id: 'tc_gate', name: 'Gate Drops', level: 1, picks: 1, noDrop: 4,
    entries: [
      { type: 'tc', ref: 'tc_junk', weight: 6 },
      { type: 'item', ref: 'rusty_sword', weight: 1 },
      { type: 'item', ref: 'leather_armor', weight: 1 },
      { type: 'item', ref: 'health_potion', weight: 2 },
    ],
  },

  // === TIER 2: Tomb Halls / Mines (level 3-6) ===
  'tc_tomb_materials': {
    id: 'tc_tomb_materials', name: 'Tomb Materials', level: 2, picks: 1, noDrop: 2,
    entries: [
      { type: 'item', ref: 'bone_dust', weight: 5 },
      { type: 'item', ref: 'ancient_coins', weight: 3 },
      { type: 'item', ref: 'grave_iron', weight: 2 },
      { type: 'item', ref: 'soul_shard', weight: 1 },
    ],
  },
  'tc_tomb': {
    id: 'tc_tomb', name: 'Tomb Drops', level: 2, picks: 1, noDrop: 3,
    entries: [
      { type: 'tc', ref: 'tc_tomb_materials', weight: 5 },
      { type: 'tc', ref: 'tc_junk', weight: 2 },
      { type: 'item', ref: 'iron_sword', weight: 1 },
      { type: 'item', ref: 'cursed_helm', weight: 1 },
      { type: 'item', ref: 'health_potion', weight: 2 },
    ],
  },
  'tc_mine_materials': {
    id: 'tc_mine_materials', name: 'Mine Materials', level: 2, picks: 1, noDrop: 2,
    entries: [
      { type: 'item', ref: 'starsilver_ore', weight: 3 },
      { type: 'item', ref: 'dark_iron', weight: 3 },
      { type: 'item', ref: 'gems', weight: 1 },
      { type: 'item', ref: 'iron_scraps', weight: 4 },
    ],
  },
  'tc_mines': {
    id: 'tc_mines', name: 'Mine Drops', level: 2, picks: 1, noDrop: 3,
    entries: [
      { type: 'tc', ref: 'tc_mine_materials', weight: 5 },
      { type: 'tc', ref: 'tc_junk', weight: 2 },
      { type: 'item', ref: 'rusty_pickaxe', weight: 1 },
      { type: 'item', ref: 'iron_hammer', weight: 1 },
      { type: 'item', ref: 'health_potion', weight: 2 },
    ],
  },

  // === TIER 3: Web / Forge (level 6-10) ===
  'tc_web_materials': {
    id: 'tc_web_materials', name: 'Web Materials', level: 3, picks: 1, noDrop: 2,
    entries: [
      { type: 'item', ref: 'spider_silk', weight: 4 },
      { type: 'item', ref: 'venom_sac', weight: 3 },
      { type: 'item', ref: 'shadow_thread', weight: 2 },
    ],
  },
  'tc_web': {
    id: 'tc_web', name: 'Web Drops', level: 3, picks: 1, noDrop: 3,
    entries: [
      { type: 'tc', ref: 'tc_web_materials', weight: 5 },
      { type: 'tc', ref: 'tc_tomb_materials', weight: 2 },
      { type: 'item', ref: 'spider_silk_cloak', weight: 1 },
      { type: 'item', ref: 'ring_of_luck', weight: 1 },
      { type: 'item', ref: 'greater_health_potion', weight: 1 },
    ],
  },
  'tc_forge_materials': {
    id: 'tc_forge_materials', name: 'Forge Materials', level: 3, picks: 1, noDrop: 2,
    entries: [
      { type: 'item', ref: 'cursed_steel', weight: 3 },
      { type: 'item', ref: 'ember_core', weight: 2 },
      { type: 'item', ref: 'runic_fragments', weight: 2 },
      { type: 'item', ref: 'dark_iron', weight: 3 },
    ],
  },
  'tc_forge': {
    id: 'tc_forge', name: 'Forge Drops', level: 3, picks: 1, noDrop: 3,
    entries: [
      { type: 'tc', ref: 'tc_forge_materials', weight: 5 },
      { type: 'tc', ref: 'tc_mine_materials', weight: 2 },
      { type: 'item', ref: 'iron_plate', weight: 1 },
      { type: 'item', ref: 'warlord_axe', weight: 1 },
      { type: 'item', ref: 'greater_health_potion', weight: 1 },
    ],
  },

  // === TIER 4: Bone Throne (level 9-15) ===
  'tc_bone': {
    id: 'tc_bone', name: 'Bone Throne Drops', level: 4, picks: 1, noDrop: 3,
    entries: [
      { type: 'item', ref: 'soul_shard', weight: 3 },
      { type: 'item', ref: 'dark_essence', weight: 2 },
      { type: 'item', ref: 'necrotic_tome', weight: 1 },
      { type: 'item', ref: 'cursed_steel', weight: 2 },
      { type: 'tc', ref: 'tc_forge_materials', weight: 2 },
      { type: 'item', ref: 'bone_cleaver', weight: 1 },
      { type: 'item', ref: 'wight_shroud', weight: 1 },
      { type: 'item', ref: 'death_blade', weight: 1 },
    ],
  },

  // === TIER 5: Abyss Bridge (level 10+) ===
  'tc_abyss': {
    id: 'tc_abyss', name: 'Abyss Drops', level: 5, picks: 1, noDrop: 3,
    entries: [
      { type: 'tc', ref: 'tc_bone', weight: 3 },
      { type: 'item', ref: 'flame_essence', weight: 2 },
      { type: 'item', ref: 'flame_crown', weight: 1 },
      { type: 'item', ref: 'ring_of_the_deep', weight: 1 },
      { type: 'item', ref: 'necromancer_grimoire', weight: 1 },
      { type: 'item', ref: 'corruption_cleanse', weight: 2 },
    ],
  },

  // === BOSS TCs (multiple picks, lower noDrop) ===
  'tc_gate_boss': {
    id: 'tc_gate_boss', name: 'Gate Boss', level: 2, picks: 2, noDrop: 1,
    entries: [
      { type: 'tc', ref: 'tc_gate', weight: 3 },
      { type: 'item', ref: 'iron_sword', weight: 2 },
      { type: 'item', ref: 'leather_armor', weight: 2 },
      { type: 'item', ref: 'health_potion', weight: 3 },
    ],
  },
  'tc_mid_boss': {
    id: 'tc_mid_boss', name: 'Mid Boss', level: 3, picks: 2, noDrop: 1,
    entries: [
      { type: 'tc', ref: 'tc_tomb', weight: 2 },
      { type: 'tc', ref: 'tc_web', weight: 2 },
      { type: 'item', ref: 'greater_health_potion', weight: 2 },
      { type: 'item', ref: 'iron_plate', weight: 1 },
      { type: 'item', ref: 'gremlin_crown', weight: 1 },
    ],
  },
  'tc_high_boss': {
    id: 'tc_high_boss', name: 'High Boss', level: 4, picks: 3, noDrop: 1,
    entries: [
      { type: 'tc', ref: 'tc_bone', weight: 3 },
      { type: 'tc', ref: 'tc_abyss', weight: 2 },
      { type: 'item', ref: 'death_blade', weight: 1 },
      { type: 'item', ref: 'necromancer_grimoire', weight: 1 },
      { type: 'item', ref: 'crown_of_madness', weight: 1 },
    ],
  },
  'tc_ashborn': {
    id: 'tc_ashborn', name: 'The Ashborn', level: 5, picks: 4, noDrop: 0,
    entries: [
      { type: 'item', ref: 'ashborn_heart', weight: 3 },
      { type: 'item', ref: 'flame_crown', weight: 2 },
      { type: 'item', ref: 'ancient_power', weight: 1 },
      { type: 'item', ref: 'ashborn_fang', weight: 2 },
      { type: 'tc', ref: 'tc_abyss', weight: 2 },
    ],
  },

  // === CRAFT PLAN TCs (rare drops from specific zones) ===
  'tc_plans': {
    id: 'tc_plans', name: 'Crafting Plans', level: 3, picks: 1, noDrop: 90,
    entries: [
      { type: 'item', ref: 'plan_webspinner_staff', weight: 1 },
      { type: 'item', ref: 'plan_cursed_greatsword', weight: 1 },
      { type: 'item', ref: 'plan_troll_hide_armor', weight: 1 },
      { type: 'item', ref: 'plan_ashborn_scale_mail', weight: 1 },
    ],
  },
};

// ============ MOB → TC MAPPING ============
// Maps mob IDs to their treasure class

const MOB_TC_MAP: Record<string, string> = {
  // Gate
  'rat': 'tc_gate',
  'bat': 'tc_gate',
  'plague_rat': 'tc_gate',
  'wandering_ghost': 'tc_gate',
  // Tomb Halls
  'skeleton': 'tc_tomb',
  'wight': 'tc_tomb',
  'tomb_guardian': 'tc_tomb',
  'tomb_wraith': 'tc_tomb',
  'tomb_spider': 'tc_tomb',
  // Mines
  'gremlin': 'tc_mines',
  'troll': 'tc_mines',
  'mine_crawler': 'tc_mines',
  'fire_elemental': 'tc_mines',
  'mine_boss': 'tc_mines',
  // Web
  'spider': 'tc_web',
  'broodmother': 'tc_web',
  'web_lurker': 'tc_web',
  'silk_weaver': 'tc_web',
  'web_guardian': 'tc_web',
  // Forge
  'brute_smith': 'tc_forge',
  'ember_colossus': 'tc_forge',
  'forge_golem': 'tc_forge',
  'flame_wraith': 'tc_forge',
  'forge_master': 'tc_forge',
  // Bone Throne
  'death_knight': 'tc_bone',
  'lich': 'tc_bone',
  'skeletal_dragon': 'tc_bone',
  'bone_colossus': 'tc_bone',
  'bone_lord': 'tc_bone',
  // Abyss
  'abyss_wraith': 'tc_abyss',
  'void_stalker': 'tc_abyss',
  'shadow_lord': 'tc_abyss',
  'abyssal_horror': 'tc_abyss',
  'ashborn': 'tc_ashborn',
};

// Danger level → TC fallback (for mobs not in the map)
const ZONE_TC_FALLBACK: Record<number, string> = {
  0: 'tc_gate',
  1: 'tc_gate',
  2: 'tc_tomb',
  3: 'tc_web',
  4: 'tc_bone',
  5: 'tc_abyss',
};

// ============ CORE LOOT GENERATION ============

/**
 * Roll a single pick on a treasure class
 */
function rollTC(tcId: string, depth: number = 0): string | null {
  if (depth > 10) return null; // Prevent infinite loops

  const tc = TREASURE_CLASSES[tcId];
  if (!tc) return null;

  // Calculate total weight including noDrop
  const totalWeight = tc.entries.reduce((sum, e) => sum + e.weight, 0) + tc.noDrop;
  
  // Roll
  let roll = secureRandom() * totalWeight;

  // NoDrop check first
  if (roll < tc.noDrop) return null;
  roll -= tc.noDrop;

  // Walk entries
  for (const entry of tc.entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      if (entry.type === 'tc') {
        return rollTC(entry.ref, depth + 1); // Recurse into sub-TC
      } else {
        return entry.ref; // Direct item
      }
    }
  }

  return null;
}

/**
 * Generate loot drops for a killed monster
 * 
 * @param db - Database for item lookups
 * @param mobId - Monster ID
 * @param mobName - Monster name (for boss detection)
 * @param zoneDangerLevel - Zone danger level (TC fallback)
 * @param playerLuck - Player's luck stat
 * @param isBoss - Whether this is a boss/gate-boss
 * @returns Array of LootDrop
 */
export function generateLoot(
  db: Database.Database,
  mobId: string,
  _mobName: string,
  zoneDangerLevel: number,
  playerLuck: number = 3,
  isBoss: boolean = false,
): LootDrop[] {
  // Determine TC
  const tcId = MOB_TC_MAP[mobId] || ZONE_TC_FALLBACK[zoneDangerLevel] || 'tc_gate';
  const tc = TREASURE_CLASSES[tcId];
  if (!tc) return [];

  const drops: LootDrop[] = [];
  const picks = isBoss ? Math.max(tc.picks, 2) : tc.picks;

  // Roll each pick independently
  for (let i = 0; i < picks; i++) {
    const itemCode = rollTC(tcId);
    if (!itemCode) continue; // NoDrop result

    // Look up item in DB
    const item = db.prepare('SELECT code, name, rarity FROM items WHERE code = ?').get(itemCode) as
      { code: string; name: string; rarity: string } | undefined;
    
    if (!item) continue; // Item not in DB

    // Quality waterfall: chance to upgrade rarity
    const monsterLevel = tc.level;
    const rolledQuality = rollQuality(item.rarity, monsterLevel, playerLuck, isBoss);
    
    // Only upgrade, never downgrade
    const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];
    const baseIdx = rarityOrder.indexOf(item.rarity);
    const rolledIdx = rarityOrder.indexOf(rolledQuality);
    const finalRarity = rolledIdx > baseIdx ? rolledQuality : item.rarity;

    drops.push({
      itemCode: item.code,
      itemName: item.name,
      rarity: finalRarity as any,
      originalRarity: item.rarity,
      upgraded: finalRarity !== item.rarity,
    });
  }

  // Bonus: craft plan roll (independent, ~1% effective chance from high zones)
  if (zoneDangerLevel >= 3) {
    const planItem = rollTC('tc_plans');
    if (planItem) {
      const planRow = db.prepare('SELECT code, name, rarity FROM items WHERE code = ?').get(planItem) as
        { code: string; name: string; rarity: string } | undefined;
      if (planRow) {
        drops.push({
          itemCode: planRow.code,
          itemName: planRow.name,
          rarity: planRow.rarity as any,
          originalRarity: planRow.rarity,
          upgraded: false,
        });
      }
    }
  }

  return drops;
}

/**
 * Get TC info for debugging/display
 */
export function getTCInfo(mobId: string, zoneDangerLevel: number): { tcName: string; picks: number; noDrop: number } | null {
  const tcId = MOB_TC_MAP[mobId] || ZONE_TC_FALLBACK[zoneDangerLevel] || 'tc_gate';
  const tc = TREASURE_CLASSES[tcId];
  if (!tc) return null;
  return { tcName: tc.name, picks: tc.picks, noDrop: tc.noDrop };
}
