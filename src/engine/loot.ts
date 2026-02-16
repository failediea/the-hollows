/**
 * Loot system — mob drop_table only
 *
 * Flow: Kill → Roll each drop_table entry → Quality waterfall → Drops
 * Bosses get two independent passes on their drop_table
 */

import Database from 'better-sqlite3';
import { secureRandom } from './crypto-rng.js';
import { getMobById } from '../world/zones.js';

// ============ TYPES ============

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

// ============ CRAFT PLANS ============
// Bonus craft plan pool — ~4.3% chance to drop one from danger >= 3 zones

const CRAFT_PLANS = [
  'plan_webspinner_staff',
  'plan_cursed_greatsword',
  'plan_troll_hide_armor',
  'plan_ashborn_scale_mail',
];

const CRAFT_PLAN_DROP_CHANCE = 4 / 94; // ~4.26%, matching old tc_plans weights (4 items / (90 noDrop + 4))

// ============ CORE LOOT GENERATION ============

/**
 * Generate loot drops for a killed monster
 *
 * @param db - Database for item lookups
 * @param mobId - Monster ID
 * @param _mobName - Unused (kept for caller compatibility)
 * @param zoneDangerLevel - Zone danger level
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
  const mobDef = getMobById(mobId);
  if (!mobDef) return [];

  const drops: LootDrop[] = [];
  const passes = isBoss ? 2 : 1;

  const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];

  // Roll drop_table (bosses get 2 independent passes)
  for (let pass = 0; pass < passes; pass++) {
    for (const drop of mobDef.drop_table) {
      if (secureRandom() < drop.chance) {
        const item = db.prepare('SELECT code, name, rarity FROM items WHERE code = ?').get(drop.item) as
          { code: string; name: string; rarity: string } | undefined;
        if (!item) continue;

        // Quality waterfall: chance to upgrade rarity
        const rolledQuality = rollQuality(item.rarity, zoneDangerLevel, playerLuck, isBoss);

        // Only upgrade, never downgrade
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
    }
  }

  // Bonus: craft plan roll (~4.3% chance from danger >= 3 zones)
  if (zoneDangerLevel >= 3 && secureRandom() < CRAFT_PLAN_DROP_CHANCE) {
    const planCode = CRAFT_PLANS[Math.floor(secureRandom() * CRAFT_PLANS.length)];
    const planRow = db.prepare('SELECT code, name, rarity FROM items WHERE code = ?').get(planCode) as
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

  return drops;
}
