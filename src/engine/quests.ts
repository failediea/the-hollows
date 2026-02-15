import Database from 'better-sqlite3';

export interface QuestObjective {
  type: 'kill' | 'collect' | 'gather' | 'craft' | 'gate_boss';
  target?: string;   // mob id, item code, or resource id
  targetName: string; // display name
  amount: number;
}

export interface QuestDef {
  id: string;
  zone: string;
  order: number;      // sequential order within zone (1, 2, 3...)
  name: string;
  description: string;
  objective: QuestObjective;
  rewards: {
    xp?: number;
    gold?: number;
    item?: { code: string; name: string; quantity: number };
    skillPoints?: number;
  };
}

export const QUESTS: QuestDef[] = [
  // === THE GATE ===
  {
    id: 'gate_1', zone: 'the_gate', order: 1,
    name: 'The Drain Tunnels',
    description: 'Something scratches in the tunnels below the waystation. Clear the Sewer Rats before they overrun the camp.',
    objective: { type: 'kill', target: 'sewer_rat', targetName: 'Sewer Rat', amount: 2 },
    rewards: { xp: 8, gold: 4 },
  },
  {
    id: 'gate_2', zone: 'the_gate', order: 2,
    name: 'Echoes in the Dark',
    description: 'Bats swarm the Upper Cavern, blinding anyone who passes. Thin their numbers.',
    objective: { type: 'kill', target: 'cave_bat', targetName: 'Cave Bat', amount: 3 },
    rewards: { xp: 10, gold: 5 },
  },
  {
    id: 'gate_3', zone: 'the_gate', order: 3,
    name: 'The Ruined Storehouse',
    description: 'Giant Rats have claimed the old storehouse. Salvage what Rat Pelts you can from the wreckage.',
    objective: { type: 'collect', target: 'rat_pelt', targetName: 'Rat Pelt', amount: 3 },
    rewards: { xp: 12, gold: 8 },
  },
  {
    id: 'gate_4', zone: 'the_gate', order: 4,
    name: 'Roots and Remedies',
    description: 'Herbs grow thick along the damp walls near the cavern. Gather them — you\'ll need medicine for what lies below.',
    objective: { type: 'gather', target: 'herbs', targetName: 'Herbs', amount: 5 },
    rewards: { xp: 12, gold: 8 },
  },
  {
    id: 'gate_5', zone: 'the_gate', order: 5,
    name: 'Brew for the Descent',
    description: 'The veterans say no one survives past the Junction without potions. Brew at least two before you go deeper.',
    objective: { type: 'craft', target: 'health_potion', targetName: 'Health Potion', amount: 2 },
    rewards: { xp: 18, gold: 12 },
  },
  {
    id: 'gate_6', zone: 'the_gate', order: 6,
    name: 'The Toxic Junction',
    description: 'Plague Rats breed in the poisoned runoff at the Junction. Destroy them before the infection spreads topside.',
    objective: { type: 'kill', target: 'plague_rat', targetName: 'Plague Rat', amount: 2 },
    rewards: { xp: 20, gold: 12 },
  },
  {
    id: 'gate_7', zone: 'the_gate', order: 7,
    name: 'The Kennel Passage',
    description: 'Corrupted Hounds howl through the old kennel corridor. They must be put down to clear the route forward.',
    objective: { type: 'kill', target: 'corrupted_hound', targetName: 'Corrupted Hound', amount: 2 },
    rewards: { xp: 22, gold: 15 },
  },
  {
    id: 'gate_8', zone: 'the_gate', order: 8,
    name: 'Unhallowed Ground',
    description: 'A Rabid Ghoul haunts the Defiled Crypt, feeding on the dead. End its misery.',
    objective: { type: 'kill', target: 'rabid_ghoul', targetName: 'Rabid Ghoul', amount: 1 },
    rewards: { xp: 28, gold: 18 },
  },
  {
    id: 'gate_9', zone: 'the_gate', order: 9,
    name: 'Whispers at the Shrine',
    description: 'A Wandering Ghost circles the Forgotten Shrine, unable to pass on. Lay it to rest.',
    objective: { type: 'kill', target: 'wandering_ghost', targetName: 'Wandering Ghost', amount: 1 },
    rewards: { xp: 30, gold: 20 },
  },
  {
    id: 'gate_10', zone: 'the_gate', order: 10,
    name: 'The Sealed Threshold',
    description: 'A Tomb Shade guards the final passage. Defeat it to unseal the way to the Tomb Halls.',
    objective: { type: 'kill', target: 'tomb_shade', targetName: 'Tomb Shade', amount: 1 },
    rewards: { xp: 40, gold: 25 },
  },
  {
    id: 'gate_11', zone: 'the_gate', order: 11,
    name: 'Into the Deep',
    description: 'Beyond the Threshold, something ancient stirs. Defeat the Gate Boss to prove you are ready for the depths.',
    objective: { type: 'gate_boss', target: 'giant_rat_alpha', targetName: 'Giant Rat Alpha', amount: 1 },
    rewards: { xp: 50, gold: 30, skillPoints: 1 },
  },

  // === TOMB HALLS ===
  {
    id: 'tomb_1', zone: 'tomb_halls', order: 1,
    name: 'Bone Breaker',
    description: 'Destroy a Skeleton Warrior disturbing the tombs.',
    objective: { type: 'kill', target: 'skeleton', targetName: 'Skeleton Warrior', amount: 1 },
    rewards: { xp: 20, gold: 15 },
  },
  {
    id: 'tomb_2', zone: 'tomb_halls', order: 2,
    name: 'Grave Robber',
    description: 'Collect 5 Bone Dust from the fallen.',
    objective: { type: 'collect', target: 'bone_dust', targetName: 'Bone Dust', amount: 5 },
    rewards: { xp: 25, gold: 20 },
  },
  {
    id: 'tomb_3', zone: 'tomb_halls', order: 3,
    name: 'Undead Purge',
    description: 'Slay 5 undead creatures in the Tomb Halls.',
    objective: { type: 'kill', target: null as any, targetName: 'Any Tomb mob', amount: 5 },
    rewards: { xp: 40, gold: 30 },
  },
  {
    id: 'tomb_4', zone: 'tomb_halls', order: 4,
    name: 'Ancient Relics',
    description: 'Gather 3 Ancient Coins from the burial chambers.',
    objective: { type: 'gather', target: 'ancient_coins', targetName: 'Ancient Coins', amount: 3 },
    rewards: { xp: 30, gold: 25 },
  },
  {
    id: 'tomb_5', zone: 'tomb_halls', order: 5,
    name: 'Knight Slayer',
    description: 'Defeat 3 Cursed Knights — the elite guard of the Deepkings.',
    objective: { type: 'kill', target: 'cursed_knight', targetName: 'Cursed Knight', amount: 3 },
    rewards: { xp: 50, gold: 40, skillPoints: 1 },
  },

  // === THE MINES ===
  {
    id: 'mine_1', zone: 'the_mines', order: 1,
    name: 'Pest Control',
    description: 'Kill a Gremlin Miner stealing ore.',
    objective: { type: 'kill', target: 'gremlin', targetName: 'Gremlin Miner', amount: 1 },
    rewards: { xp: 20, gold: 15 },
  },
  {
    id: 'mine_2', zone: 'the_mines', order: 2,
    name: 'Starsilver Prospector',
    description: 'Gather 3 Starsilver Ore veins.',
    objective: { type: 'gather', target: 'starsilver_ore', targetName: 'Starsilver Ore', amount: 3 },
    rewards: { xp: 30, gold: 25 },
  },
  {
    id: 'mine_3', zone: 'the_mines', order: 3,
    name: 'Troll Trouble',
    description: 'Defeat 2 Cave Trolls blocking the tunnels.',
    objective: { type: 'kill', target: 'cave_troll', targetName: 'Cave Troll', amount: 2 },
    rewards: { xp: 40, gold: 30 },
  },
  {
    id: 'mine_4', zone: 'the_mines', order: 4,
    name: 'Gem Collector',
    description: 'Collect 3 Precious Gems from the deep veins.',
    objective: { type: 'gather', target: 'gems', targetName: 'Precious Gems', amount: 3 },
    rewards: { xp: 35, gold: 30 },
  },
  {
    id: 'mine_5', zone: 'the_mines', order: 5,
    name: 'Mine Boss',
    description: 'Defeat 3 Gem Golems guarding the richest veins.',
    objective: { type: 'kill', target: 'gem_golem', targetName: 'Gem Golem', amount: 3 },
    rewards: { xp: 50, gold: 40, skillPoints: 1 },
  },

  // === THE WEB ===
  {
    id: 'web_1', zone: 'the_web', order: 1,
    name: 'Spider Squasher',
    description: 'Kill 3 Giant Spiders infesting the web.',
    objective: { type: 'kill', target: 'giant_spider', targetName: 'Giant Spider', amount: 3 },
    rewards: { xp: 30, gold: 20 },
  },
  {
    id: 'web_2', zone: 'the_web', order: 2,
    name: 'Silk Harvest',
    description: 'Collect 5 Spider Silk from the webs.',
    objective: { type: 'gather', target: 'spider_silk', targetName: 'Spider Silk', amount: 5 },
    rewards: { xp: 35, gold: 25 },
  },
  {
    id: 'web_3', zone: 'the_web', order: 3,
    name: 'Venom Extraction',
    description: 'Collect 3 Venom Sacs from spiders.',
    objective: { type: 'collect', target: 'venom_sac', targetName: 'Venom Sac', amount: 3 },
    rewards: { xp: 40, gold: 30 },
  },
  {
    id: 'web_4', zone: 'the_web', order: 4,
    name: 'Broodmother\'s End',
    description: 'Slay the Broodmother lurking in the depths.',
    objective: { type: 'kill', target: 'broodmother', targetName: 'Broodmother', amount: 1 },
    rewards: { xp: 60, gold: 50, skillPoints: 1 },
  },

  // === FORGE OF RUIN ===
  {
    id: 'forge_1', zone: 'forge_of_ruin', order: 1,
    name: 'Forge Fighter',
    description: 'Defeat 2 Brute Smiths working the dark forges.',
    objective: { type: 'kill', target: 'brute_smith', targetName: 'Brute Smith', amount: 2 },
    rewards: { xp: 40, gold: 30 },
  },
  {
    id: 'forge_2', zone: 'forge_of_ruin', order: 2,
    name: 'Dark Metallurgy',
    description: 'Gather 5 Ember Cores from the forge fires.',
    objective: { type: 'gather', target: 'ember_core', targetName: 'Ember Core', amount: 5 },
    rewards: { xp: 45, gold: 35 },
  },
  {
    id: 'forge_3', zone: 'forge_of_ruin', order: 3,
    name: 'Colossus Slayer',
    description: 'Defeat the Ember Colossus.',
    objective: { type: 'kill', target: 'ember_colossus', targetName: 'Ember Colossus', amount: 1 },
    rewards: { xp: 70, gold: 60, skillPoints: 1 },
  },

  // === BONE THRONE ===
  {
    id: 'throne_1', zone: 'bone_throne', order: 1,
    name: 'Death\'s Door',
    description: 'Defeat a Death Knight of the Bone Throne.',
    objective: { type: 'kill', target: 'death_knight', targetName: 'Death Knight', amount: 1 },
    rewards: { xp: 50, gold: 40 },
  },
  {
    id: 'throne_2', zone: 'bone_throne', order: 2,
    name: 'Soul Reaper',
    description: 'Collect 5 Soul Shards from fallen enemies.',
    objective: { type: 'collect', target: 'soul_shard', targetName: 'Soul Shard', amount: 5 },
    rewards: { xp: 60, gold: 50 },
  },
  {
    id: 'throne_3', zone: 'bone_throne', order: 3,
    name: 'Dragon Slayer',
    description: 'Slay the Skeletal Dragon that guards the throne.',
    objective: { type: 'kill', target: 'skeletal_dragon', targetName: 'Skeletal Dragon', amount: 1 },
    rewards: { xp: 100, gold: 80, skillPoints: 2 },
  },
];

// ============ DB HELPERS ============

export function initQuestTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      quest_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      claimed INTEGER DEFAULT 0,
      started_at INTEGER DEFAULT 0,
      completed_at INTEGER,
      UNIQUE(agent_id, quest_id)
    )
  `);
}

// Get the current active quest for an agent in a zone
export function getActiveQuest(db: Database.Database, agentId: number, zoneId: string): QuestDef | null {
  const zoneQuests = QUESTS.filter(q => q.zone === zoneId).sort((a, b) => a.order - b.order);
  
  for (const quest of zoneQuests) {
    const row = db.prepare('SELECT * FROM quest_progress WHERE agent_id = ? AND quest_id = ?')
      .get(agentId, quest.id) as any;
    
    if (!row) {
      // Not started — this is the active quest
      return quest;
    }
    if (!row.claimed) {
      // Started but not claimed — still active
      return quest;
    }
    // Claimed — move to next
  }
  return null; // all done
}

// Get all quest states for a zone
export function getZoneQuests(db: Database.Database, agentId: number, zoneId: string) {
  const zoneQuests = QUESTS.filter(q => q.zone === zoneId).sort((a, b) => a.order - b.order);
  
  return zoneQuests.map(quest => {
    const row = db.prepare('SELECT * FROM quest_progress WHERE agent_id = ? AND quest_id = ?')
      .get(agentId, quest.id) as any;
    
    const prevQuest = zoneQuests.find(q => q.order === quest.order - 1);
    let unlocked = quest.order === 1;
    if (prevQuest) {
      const prevRow = db.prepare('SELECT claimed FROM quest_progress WHERE agent_id = ? AND quest_id = ?')
        .get(agentId, prevQuest.id) as any;
      unlocked = prevRow?.claimed === 1;
    }

    return {
      ...quest,
      progress: row?.progress || 0,
      completed: row?.completed === 1,
      claimed: row?.claimed === 1,
      unlocked,
    };
  });
}

// Track quest progress for an event
export function trackQuestProgress(
  db: Database.Database, agentId: number, zoneId: string,
  eventType: 'kill' | 'collect' | 'gather' | 'craft' | 'gate_boss',
  targetId: string | null,
  amount: number = 1
): { questCompleted?: string; questName?: string } | null {
  const active = getActiveQuest(db, agentId, zoneId);
  if (!active) return null;

  const obj = active.objective;
  
  // Check if this event matches the quest objective
  if (obj.type !== eventType) return null;
  
  // For 'kill' with null target, any mob in the zone counts
  if (obj.target && obj.target !== targetId) return null;

  // Ensure row exists
  db.prepare(`
    INSERT OR IGNORE INTO quest_progress (agent_id, quest_id, progress, started_at)
    VALUES (?, ?, 0, ?)
  `).run(agentId, active.id, Date.now());

  // Increment progress
  db.prepare('UPDATE quest_progress SET progress = MIN(progress + ?, ?) WHERE agent_id = ? AND quest_id = ?')
    .run(amount, obj.amount, agentId, active.id);

  // Check completion
  const row = db.prepare('SELECT progress FROM quest_progress WHERE agent_id = ? AND quest_id = ?')
    .get(agentId, active.id) as any;

  if (row.progress >= obj.amount) {
    db.prepare('UPDATE quest_progress SET completed = 1, completed_at = ? WHERE agent_id = ? AND quest_id = ?')
      .run(Date.now(), agentId, active.id);
    return { questCompleted: active.id, questName: active.name };
  }

  return null;
}

// Claim rewards for a completed quest
export function claimQuestReward(db: Database.Database, agentId: number, questId: string):
  { success: boolean; message: string; rewards?: any } {

  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return { success: false, message: 'Quest not found' };

  const claimTransaction = db.transaction(() => {
    const row = db.prepare('SELECT * FROM quest_progress WHERE agent_id = ? AND quest_id = ?')
      .get(agentId, questId) as any;

    if (!row || !row.completed) return { success: false, message: 'Quest not completed' };
    if (row.claimed) return { success: false, message: 'Already claimed' };

    // Mark claimed first to prevent double-claim
    db.prepare('UPDATE quest_progress SET claimed = 1 WHERE agent_id = ? AND quest_id = ?')
      .run(agentId, questId);

    // Grant rewards
    const r = quest.rewards;
    if (r.xp) db.prepare('UPDATE agents SET xp = xp + ? WHERE id = ?').run(r.xp, agentId);
    if (r.gold) db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(r.gold, agentId);
    if (r.skillPoints) db.prepare('UPDATE agents SET skill_points = skill_points + ? WHERE id = ?').run(r.skillPoints, agentId);
    if (r.item) {
      const existing = db.prepare('SELECT id FROM inventory WHERE agent_id = ? AND item_code = ?').get(agentId, r.item.code) as any;
      if (existing) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(r.item.quantity, existing.id);
      } else {
        db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, acquired_at) VALUES (?, ?, ?, ?)')
          .run(agentId, r.item.code, r.item.quantity, Date.now());
      }
    }

    // Check level up
    const agent = db.prepare('SELECT xp, level FROM agents WHERE id = ?').get(agentId) as any;
    const xpThresholds = [0, 50, 120, 220, 350, 520, 730, 1000, 1350, 1800, 2400, 3200, 4200, 5500, 7200];
    let newLevel = agent.level;
    while (newLevel < xpThresholds.length - 1 && agent.xp >= xpThresholds[newLevel]) {
      newLevel++;
    }
    if (newLevel > agent.level) {
      const hpGain = (newLevel - agent.level) * 10;
      db.prepare('UPDATE agents SET level = ?, max_hp = max_hp + ?, hp = MIN(hp + ?, max_hp + ?), atk = atk + ?, def = def + ?, spd = spd + ? WHERE id = ?')
        .run(newLevel, hpGain, hpGain, hpGain, newLevel - agent.level, newLevel - agent.level, newLevel - agent.level, agentId);
    }

    return {
      success: true,
      message: `🎉 Quest "${quest.name}" complete!`,
      rewards: r,
    };
  });

  return claimTransaction() as { success: boolean; message: string; rewards?: any };
}
