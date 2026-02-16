import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import crypto from 'crypto';

export const STARTING_STATS = {
  HP: 70,  // Iteration 3: Middle ground between 60 and 80
  ATK: 6,
  DEF: 3,
  SPD: 4,
  LUCK: 3
};

export const XP_PER_LEVEL = 100; // kept for backward compatibility
export const CORRUPTION_THRESHOLD = 100;

/** Total XP needed to reach a given level (level 1 = 0 XP) */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * (50 + 5 * level);
}

/** Determine level from total accumulated XP */
export function getLevelForXp(totalXp: number): number {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}
export const CORRUPTION_PER_100_GOLD = 1;
export const MAX_INVENTORY_WEIGHT = 200;

export interface LevelUpResult {
  newLevel: number;
  statIncreases: {
    hp?: number;
    atk?: number;
    def?: number;
    spd?: number;
    luck?: number;
  };
}

export function createAgent(
  db: Database.Database,
  name: string,
  walletAddress: string,
  seasonId: number
): Agent {
  // Generate API key
  const apiKey = crypto.randomBytes(32).toString('hex');

  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agents (
      name, wallet_address, api_key, zone_id, hp, max_hp, atk, def, spd, luck,
      level, xp, gold, corruption, is_dead, prestige_points, season_id,
      created_at, last_action_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    name,
    walletAddress,
    apiKey,
    'the_gate',
    STARTING_STATS.HP,
    STARTING_STATS.HP,
    STARTING_STATS.ATK,
    STARTING_STATS.DEF,
    STARTING_STATS.SPD,
    STARTING_STATS.LUCK,
    1, // level
    0, // xp
    0, // gold
    0, // corruption
    0, // is_dead
    0, // prestige_points
    seasonId,
    now,
    now
  );

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid) as Agent;
  return agent;
}

export function gainXp(db: Database.Database, agentId: number, xpAmount: number): LevelUpResult | null {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return null;

  const adjustedXp = xpAmount;
  const newXp = agent.xp + adjustedXp;
  const newLevel = getLevelForXp(newXp);

  let levelUpResult: LevelUpResult | null = null;

  if (newLevel > agent.level) {
    // Level up! Grant consistent stat increases per level
    const levelsGained = newLevel - agent.level;
    const statIncreases: LevelUpResult['statIncreases'] = {};

    // Each level gives: +15 HP, +2 ATK, +1 DEF, +1 SPD, +1 LUCK
    statIncreases.hp = levelsGained * 15;
    statIncreases.atk = levelsGained * 2;
    statIncreases.def = levelsGained * 1;
    statIncreases.spd = levelsGained * 1;
    statIncreases.luck = levelsGained * 1;

    // Apply stat increases
    const newMaxHp = agent.max_hp + statIncreases.hp;
    const newAtk = agent.atk + statIncreases.atk;
    const newDef = agent.def + statIncreases.def;
    const newSpd = agent.spd + statIncreases.spd;
    const newLuck = agent.luck + statIncreases.luck;

    // Grant skill points (1 per level)
    const skillPointsGained = levelsGained;

    db.prepare(`
      UPDATE agents
      SET level = ?, xp = ?, max_hp = ?, hp = ?, atk = ?, def = ?, spd = ?, luck = ?, skill_points = skill_points + ?
      WHERE id = ?
    `).run(newLevel, newXp, newMaxHp, newMaxHp, newAtk, newDef, newSpd, newLuck, skillPointsGained, agentId);

    levelUpResult = { newLevel, statIncreases };

    logActivity(db, 'level_up', `${agent.name} reached level ${newLevel}! (+${skillPointsGained} skill points)`, agent.name);
  } else {
    // Just update XP
    db.prepare('UPDATE agents SET xp = ? WHERE id = ?').run(newXp, agentId);
  }

  return levelUpResult;
}

export function addGold(db: Database.Database, agentId: number, goldAmount: number): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return;

  const newGold = agent.gold + goldAmount;
  db.prepare('UPDATE agents SET gold = ? WHERE id = ?').run(newGold, agentId);

  // Update corruption based on total gold held
  updateCorruption(db, agentId);
}

export function removeGold(db: Database.Database, agentId: number, goldAmount: number): boolean {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead || agent.gold < goldAmount) return false;

  const newGold = agent.gold - goldAmount;
  db.prepare('UPDATE agents SET gold = ? WHERE id = ?').run(newGold, agentId);

  // Spending gold reduces corruption
  updateCorruption(db, agentId);

  return true;
}

export function updateCorruption(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return;

  // Base corruption from gold (1 per 100 gold)
  const goldCorruption = Math.floor(agent.gold / 100) * CORRUPTION_PER_100_GOLD;

  // Get corruption from equipped cursed items
  const curseCorruption = db.prepare(`
    SELECT SUM(i.corruption_per_action) as total
    FROM inventory inv
    JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ? AND inv.equipped = 1
  `).get(agentId) as { total: number | null };

  let totalCorruption = goldCorruption + (curseCorruption.total || 0);

  // Apply Corruption Ward skill (50% reduction)
  try {
    const hasCorruptionWard = db.prepare('SELECT 1 FROM agent_skills WHERE agent_id = ? AND skill_id = "corruption_ward"')
      .get(agentId);
    if (hasCorruptionWard) {
      totalCorruption = Math.floor(totalCorruption * 0.5);
    }
  } catch (error) {
    // Skill system not initialized yet, ignore
  }

  db.prepare('UPDATE agents SET corruption = ? WHERE id = ?').run(totalCorruption, agentId);

  // Apply curse debuffs if over threshold
  if (totalCorruption >= CORRUPTION_THRESHOLD) {
    applyCurseDebuffs(db, agentId);
  }
}

function applyCurseDebuffs(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent) return;

  // Note: Cursed agents get -20% to all stats (minimum 1)
  // This debuff should be checked and applied during combat
  // We don't permanently modify base stats here
  logActivity(db, 'corruption', `${agent.name} is heavily corrupted (${agent.corruption} corruption)`, agent.name);
}

export function takeDamage(db: Database.Database, agentId: number, damage: number): boolean {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return false;

  const newHp = Math.max(0, agent.hp - damage);

  if (newHp === 0) {
    // Agent dies - permadeath for this season
    // Lose 50% of gold on death
    const goldLost = Math.floor(agent.gold * 0.5);
    db.prepare('UPDATE agents SET hp = 0, is_dead = 1, gold = gold - ? WHERE id = ?').run(goldLost, agentId);

    // Grant prestige points based on level
    const prestigeGained = agent.level * 10;
    db.prepare('UPDATE agents SET prestige_points = prestige_points + ? WHERE id = ?')
      .run(prestigeGained, agentId);

    return true; // Agent died
  } else {
    db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(newHp, agentId);
    return false; // Agent survived
  }
}

export function heal(db: Database.Database, agentId: number, healAmount: number): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return;

  const newHp = Math.min(agent.max_hp, agent.hp + healAmount);
  db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(newHp, agentId);
}

export function rest(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return;

  // Resting heals to full HP
  heal(db, agentId, agent.max_hp);
}

export function moveZone(db: Database.Database, agentId: number, newZoneId: string): boolean {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return false;

  db.prepare('UPDATE agents SET zone_id = ?, last_action_at = ? WHERE id = ?')
    .run(newZoneId, Date.now(), agentId);

  return true;
}

export function getTotalInventoryWeight(db: Database.Database, agentId: number): number {
  const result = db.prepare(`
    SELECT SUM(i.weight * inv.quantity) as total_weight
    FROM inventory inv
    JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ?
  `).get(agentId) as { total_weight: number | null };

  return result.total_weight || 0;
}

export function canCarryItem(db: Database.Database, agentId: number, itemCode: string, quantity: number = 1): boolean {
  const item = db.prepare('SELECT weight FROM items WHERE code = ?').get(itemCode) as { weight: number } | null;
  if (!item) return false;

  const currentWeight = getTotalInventoryWeight(db, agentId);
  const additionalWeight = item.weight * quantity;

  return (currentWeight + additionalWeight) <= MAX_INVENTORY_WEIGHT;
}

export function addItemToInventory(
  db: Database.Database,
  agentId: number,
  itemCode: string,
  quantity: number = 1
): boolean {
  // Check if agent can carry the item
  if (!canCarryItem(db, agentId, itemCode, quantity)) {
    console.log(`Agent ${agentId} cannot carry ${quantity}x ${itemCode} - inventory full`);
    return false;
  }

  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number; quantity: number } | undefined;

  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?')
      .run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, ?, 0, ?)')
      .run(agentId, itemCode, quantity, Date.now());
  }

  return true;
}

export function removeItemFromInventory(
  db: Database.Database,
  agentId: number,
  itemCode: string,
  quantity: number = 1
): boolean {
  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number; quantity: number } | undefined;

  if (!existing || existing.quantity < quantity) return false;

  if (existing.quantity === quantity) {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(existing.id);
  } else {
    db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?')
      .run(quantity, existing.id);
  }

  return true;
}

export function equipItem(db: Database.Database, agentId: number, itemCode: string): boolean | string {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent || agent.is_dead) return false;

  // Check level requirement from ITEM_MIN_LEVELS
  // Dynamic import workaround - check inline
  const ITEM_LEVEL_MAP: Record<string, number> = {
    health_potion: 1, torch: 1, bandage: 1,
    bone_shield: 4, grave_iron_sword: 4, antidote: 4, mining_pick: 4,
    iron_plate: 5, troll_hide_armor: 6,
    venom_blade: 7, spider_silk_cloak: 7, poison_trap: 7,
    starsilver_sword: 8, ember_shield: 8,
    webspinner_staff: 9, death_blade: 11, necromancer_grimoire: 12,
    cursed_greatsword: 13, ashborn_scale_mail: 15,
  };
  const minLevel = ITEM_LEVEL_MAP[itemCode];
  if (minLevel && agent.level < minLevel) {
    return `You must be level ${minLevel} to equip this item. Current level: ${agent.level}`;
  }

  const invItem = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number; equipped: boolean } | undefined;

  if (!invItem) return false;

  // Unequip other items in the same category
  const item = db.prepare('SELECT category FROM items WHERE code = ?').get(itemCode) as { category: string };

  // Check for dual wield (Titan's Grip skill allows 2 weapons)
  const hasDualWield = item.category === 'weapon' && (() => {
    const row = db.prepare('SELECT 1 FROM agent_skills WHERE agent_id = ? AND skill_id = ?').get(agentId, 'titans_grip');
    return !!row;
  })();
  const canDualWield = hasDualWield;

  if (canDualWield) {
    // Get currently equipped weapons
    const equippedWeapons = db.prepare(`
      SELECT inv.id, inv.item_code, inv.equipped, inv.quantity FROM inventory inv
      JOIN items i ON inv.item_code = i.code
      WHERE inv.agent_id = ? AND inv.equipped >= 1 AND i.category = 'weapon'
      ORDER BY inv.id ASC
    `).all(agentId) as { id: number; item_code: string; equipped: number; quantity: number }[];

    // Count total weapon slots filled (equipped=2 means dual same weapon)
    const slotsUsed = equippedWeapons.reduce((sum, w) => sum + w.equipped, 0);

    if (equippedWeapons.length === 1 && equippedWeapons[0].item_code === itemCode) {
      // Same weapon already in slot 1 — dual wield it if qty >= 2
      if (equippedWeapons[0].quantity >= 2 && equippedWeapons[0].equipped < 2) {
        db.prepare('UPDATE inventory SET equipped = 2 WHERE id = ?').run(equippedWeapons[0].id);
      }
    } else if (equippedWeapons.length === 1 && equippedWeapons[0].item_code !== itemCode) {
      // Different weapon — equip in second slot
      db.prepare('UPDATE inventory SET equipped = 1 WHERE id = ?').run(invItem.id);
    } else if (slotsUsed >= 2) {
      // Already 2 slots filled — unequip all weapons, equip new one
      for (const w of equippedWeapons) {
        db.prepare('UPDATE inventory SET equipped = 0 WHERE id = ?').run(w.id);
      }
      db.prepare('UPDATE inventory SET equipped = 1 WHERE id = ?').run(invItem.id);
    } else {
      db.prepare('UPDATE inventory SET equipped = 1 WHERE id = ?').run(invItem.id);
    }

    updateCorruption(db, agentId);
    return true;
  } else {
    // Normal: unequip all items in same category
    db.prepare(`
      UPDATE inventory SET equipped = 0
      WHERE agent_id = ? AND item_code IN (
        SELECT code FROM items WHERE category = ?
      )
    `).run(agentId, item.category);
  }

  // Equip the item
  db.prepare('UPDATE inventory SET equipped = 1 WHERE id = ?').run(invItem.id);

  // Update corruption
  updateCorruption(db, agentId);

  return true;
}

export function getEquippedStats(db: Database.Database, agentId: number): {
  atkBonus: number;
  defBonus: number;
  hpBonus: number;
} {
  // equipped=2 means dual-wielding same weapon (count bonuses twice)
  const result = db.prepare(`
    SELECT
      SUM(i.atk_bonus * inv.equipped) as atk_bonus,
      SUM(i.def_bonus * inv.equipped) as def_bonus,
      SUM(i.hp_bonus * inv.equipped) as hp_bonus
    FROM inventory inv
    JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ? AND inv.equipped >= 1
  `).get(agentId) as { atk_bonus: number | null; def_bonus: number | null; hp_bonus: number | null };

  return {
    atkBonus: result.atk_bonus || 0,
    defBonus: result.def_bonus || 0,
    hpBonus: result.hp_bonus || 0
  };
}

export function updateLastAction(db: Database.Database, agentId: number): void {
  db.prepare('UPDATE agents SET last_action_at = ? WHERE id = ?').run(Date.now(), agentId);
}

export function logActivity(
  db: Database.Database,
  eventType: string,
  message: string,
  agentName?: string
): void {
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, agent_name, message, created_at)
      VALUES (?, ?, ?, ?)
    `).run(eventType, agentName || null, message, Date.now());
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}
