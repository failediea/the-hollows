import Database from 'better-sqlite3';
import { logActivity } from './agent.js';

export interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  checkCondition: (db: Database.Database, agentId: number) => boolean;
}

export const ACHIEVEMENTS: Omit<Achievement, 'id' | 'checkCondition'>[] = [
  {
    code: 'first_blood',
    name: 'First Blood',
    description: 'Kill your first mob',
    icon: '⚔️'
  },
  {
    code: 'gate_keeper',
    name: 'Gate Keeper',
    description: 'Defeat 3 gate bosses',
    icon: '🧩'
  },
  {
    code: 'spelunker',
    name: 'Spelunker',
    description: 'Visit all 8 zones',
    icon: '🗺️'
  },
  {
    code: 'dragonslayer',
    name: 'Dragonslayer',
    description: 'Deal the killing blow to the Ashborn',
    icon: '🐉'
  },
  {
    code: 'guild_of_the_ring',
    name: 'Guild of the Ring',
    description: 'Join a guild',
    icon: '🤝'
  },
  {
    code: 'merchant_prince',
    name: 'Merchant Prince',
    description: 'Accumulate 500 gold',
    icon: '💰'
  },
  {
    code: 'corruption_resister',
    name: 'Corruption Resister',
    description: 'Reach level 5 with 0 corruption',
    icon: '✨'
  },
  {
    code: 'survivor',
    name: 'Survivor',
    description: 'Survive 50 combat encounters',
    icon: '🛡️'
  },
  {
    code: 'the_collector',
    name: 'The Collector',
    description: 'Own 10 different items',
    icon: '🎒'
  },
  {
    code: 'pvp_champion',
    name: 'PvP Champion',
    description: 'Win 5 PvP matches',
    icon: '🏆'
  },
  {
    code: 'legendary_find',
    name: 'Legendary Find',
    description: 'Find a legendary item',
    icon: '💎'
  },
  {
    code: 'cursed',
    name: 'Cursed',
    description: 'Reach 100 corruption',
    icon: '💀'
  }
];

export function initializeAchievements(db: Database.Database): void {
  // Create achievements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL
    )
  `);

  // Create agent_achievements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      achievement_id INTEGER NOT NULL,
      unlocked_at INTEGER NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id),
      FOREIGN KEY(achievement_id) REFERENCES achievements(id),
      UNIQUE(agent_id, achievement_id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_achievements ON agent_achievements(agent_id);
    CREATE INDEX IF NOT EXISTS idx_achievements_code ON achievements(code);
  `);

  // Insert achievements
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO achievements (code, name, description, icon)
    VALUES (?, ?, ?, ?)
  `);

  for (const achievement of ACHIEVEMENTS) {
    stmt.run(achievement.code, achievement.name, achievement.description, achievement.icon);
  }
}

/**
 * Check if an agent has unlocked an achievement
 */
export function hasAchievement(db: Database.Database, agentId: number, achievementCode: string): boolean {
  const achievement = db.prepare('SELECT id FROM achievements WHERE code = ?').get(achievementCode) as { id: number } | undefined;
  if (!achievement) return false;

  const result = db.prepare('SELECT 1 FROM agent_achievements WHERE agent_id = ? AND achievement_id = ?')
    .get(agentId, achievement.id);
  
  return result !== undefined;
}

/**
 * Award an achievement to an agent
 */
export function awardAchievement(
  db: Database.Database,
  agentId: number,
  achievementCode: string
): { success: boolean; message: string; achievement?: any } {
  // Check if already has achievement
  if (hasAchievement(db, agentId, achievementCode)) {
    return { success: false, message: 'Achievement already unlocked' };
  }

  const achievement = db.prepare('SELECT * FROM achievements WHERE code = ?').get(achievementCode) as any;
  if (!achievement) {
    return { success: false, message: 'Achievement not found' };
  }

  const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string } | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found' };
  }

  // Award achievement
  db.prepare('INSERT INTO agent_achievements (agent_id, achievement_id, unlocked_at) VALUES (?, ?, ?)')
    .run(agentId, achievement.id, Date.now());

  logActivity(
    db,
    'achievement',
    `🏆 ${agent.name} unlocked achievement: ${achievement.name} - ${achievement.description}`,
    agent.name
  );

  return {
    success: true,
    message: `🏆 Achievement Unlocked: ${achievement.name}!`,
    achievement
  };
}

/**
 * Get all achievements for an agent
 */
export function getAgentAchievements(db: Database.Database, agentId: number): any[] {
  return db.prepare(`
    SELECT a.*, aa.unlocked_at
    FROM agent_achievements aa
    JOIN achievements a ON aa.achievement_id = a.id
    WHERE aa.agent_id = ?
    ORDER BY aa.unlocked_at DESC
  `).all(agentId);
}

/**
 * Check specific achievement conditions
 */

export function checkFirstBlood(db: Database.Database, agentId: number): void {
  const mobKills = db.prepare(`
    SELECT COUNT(*) as count FROM combat_log
    WHERE agent_id = ? AND opponent_type = 'mob' AND won = 1
  `).get(agentId) as { count: number };

  if (mobKills.count >= 1 && !hasAchievement(db, agentId, 'first_blood')) {
    awardAchievement(db, agentId, 'first_blood');
  }
}

export function checkGateKeeper(db: Database.Database, agentId: number): void {
  // Track gate bosses defeated via zone_gate_unlocks
  const gatesDefeated = db.prepare(`
    SELECT COUNT(*) as count FROM zone_gate_unlocks
    WHERE agent_id = ?
  `).get(agentId) as { count: number };

  if (gatesDefeated.count >= 3 && !hasAchievement(db, agentId, 'gate_keeper')) {
    awardAchievement(db, agentId, 'gate_keeper');
  }
}

export function checkSpelunker(db: Database.Database, agentId: number): void {
  // Check if agent has visited all zones (we'll track this via activity log)
  const visitedZones = db.prepare(`
    SELECT DISTINCT message FROM activity_log
    WHERE agent_name = (SELECT name FROM agents WHERE id = ?) AND event_type = 'move'
  `).all(agentId) as { message: string }[];

  const uniqueZones = new Set<string>();
  for (const visit of visitedZones) {
    // Extract zone name from message like "AgentName entered ZoneName"
    const match = visit.message.match(/entered (.+)$/);
    if (match) {
      uniqueZones.add(match[1]);
    }
  }

  if (uniqueZones.size >= 8 && !hasAchievement(db, agentId, 'spelunker')) {
    awardAchievement(db, agentId, 'spelunker');
  }
}

export function checkDragonslayer(db: Database.Database, agentId: number): void {
  const ashbornKills = db.prepare(`
    SELECT COUNT(*) as count FROM combat_log
    WHERE agent_id = ? AND opponent_name = 'The Ashborn' AND won = 1
  `).get(agentId) as { count: number };

  if (ashbornKills.count >= 1 && !hasAchievement(db, agentId, 'dragonslayer')) {
    awardAchievement(db, agentId, 'dragonslayer');
  }
}

export function checkGuild(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT guild_id FROM agents WHERE id = ?').get(agentId) as { guild_id: number | null };

  if (agent && agent.guild_id !== null && !hasAchievement(db, agentId, 'guild_of_the_ring')) {
    awardAchievement(db, agentId, 'guild_of_the_ring');
  }
}

export function checkMerchantPrince(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT gold FROM agents WHERE id = ?').get(agentId) as { gold: number };

  if (agent && agent.gold >= 500 && !hasAchievement(db, agentId, 'merchant_prince')) {
    awardAchievement(db, agentId, 'merchant_prince');
  }
}

export function checkCorruptionResister(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT level, corruption FROM agents WHERE id = ?').get(agentId) as { level: number; corruption: number };

  if (agent && agent.level >= 5 && agent.corruption === 0 && !hasAchievement(db, agentId, 'corruption_resister')) {
    awardAchievement(db, agentId, 'corruption_resister');
  }
}

export function checkSurvivor(db: Database.Database, agentId: number): void {
  const combatCount = db.prepare(`
    SELECT COUNT(*) as count FROM combat_log WHERE agent_id = ?
  `).get(agentId) as { count: number };

  if (combatCount.count >= 50 && !hasAchievement(db, agentId, 'survivor')) {
    awardAchievement(db, agentId, 'survivor');
  }
}

export function checkCollector(db: Database.Database, agentId: number): void {
  const uniqueItems = db.prepare(`
    SELECT COUNT(DISTINCT item_code) as count FROM inventory WHERE agent_id = ?
  `).get(agentId) as { count: number };

  if (uniqueItems.count >= 10 && !hasAchievement(db, agentId, 'the_collector')) {
    awardAchievement(db, agentId, 'the_collector');
  }
}

export function checkPvPChampion(db: Database.Database, agentId: number): void {
  const pvpWins = db.prepare(`
    SELECT COUNT(*) as count FROM pvp_matches WHERE winner_id = ? AND status = 'completed'
  `).get(agentId) as { count: number };

  if (pvpWins.count >= 5 && !hasAchievement(db, agentId, 'pvp_champion')) {
    awardAchievement(db, agentId, 'pvp_champion');
  }
}

export function checkLegendaryFind(db: Database.Database, agentId: number): void {
  const legendaryItems = db.prepare(`
    SELECT COUNT(*) as count FROM inventory inv
    JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ? AND i.rarity = 'legendary'
  `).get(agentId) as { count: number };

  if (legendaryItems.count >= 1 && !hasAchievement(db, agentId, 'legendary_find')) {
    awardAchievement(db, agentId, 'legendary_find');
  }
}

export function checkCursed(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT corruption FROM agents WHERE id = ?').get(agentId) as { corruption: number };

  if (agent && agent.corruption >= 100 && !hasAchievement(db, agentId, 'cursed')) {
    awardAchievement(db, agentId, 'cursed');
  }
}

/**
 * Check all achievement conditions for an agent after an action
 */
export function checkAllAchievements(db: Database.Database, agentId: number): void {
  checkFirstBlood(db, agentId);
  checkGateKeeper(db, agentId);
  checkSpelunker(db, agentId);
  checkDragonslayer(db, agentId);
  checkGuild(db, agentId);
  checkMerchantPrince(db, agentId);
  checkCorruptionResister(db, agentId);
  checkSurvivor(db, agentId);
  checkCollector(db, agentId);
  checkPvPChampion(db, agentId);
  checkLegendaryFind(db, agentId);
  checkCursed(db, agentId);
}
