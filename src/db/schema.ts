import Database from 'better-sqlite3';

export interface Agent {
  id: number;
  name: string;
  wallet_address: string;
  api_key: string;
  zone_id: string;
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  level: number;
  xp: number;
  gold: number;
  corruption: number;
  skill_points: number;
  is_dead: boolean;
  prestige_points: number;
  season_id: number;
  guild_id: number | null;
  created_at: number;
  last_action_at: number;
  last_gather_at: number;
}

export interface Zone {
  id: string;
  name: string;
  emoji: string;
  danger_level: number;
  description: string;
  is_pvp: boolean;
  requires_guild_size: number;
}

export interface Item {
  id: number;
  code: string;
  name: string;
  category: 'weapon' | 'armor' | 'artifact' | 'accessory' | 'consumable' | 'material' | 'plan';
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  corruption_per_action: number;
  weight: number;
  description: string;
  craftable: boolean;
  craft_recipe: string | null; // JSON array of required item codes
}

export interface Inventory {
  id: number;
  agent_id: number;
  item_code: string;
  quantity: number;
  equipped: boolean;
  acquired_at: number;
}

export interface CombatLog {
  id: number;
  agent_id: number;
  opponent_type: 'mob' | 'boss' | 'agent';
  opponent_name: string;
  zone_id: string;
  damage_dealt: number;
  damage_taken: number;
  xp_gained: number;
  gold_gained: number;
  won: boolean;
  guild_id: number | null;
  created_at: number;
}

export interface Guild {
  id: number;
  name: string;
  leader_id: number;
  loot_mode: 'round-robin' | 'need-before-greed' | 'leader-decides';
  max_members: number;
  created_at: number;
}

export interface GuildMember {
  id: number;
  guild_id: number;
  agent_id: number;
  joined_at: number;
}

export interface Leaderboard {
  id: number;
  season_id: number;
  agent_id: number;
  agent_name: string;
  wallet_address: string;
  xp_earned: number;
  mobs_killed: number;
  gold_accumulated: number;
  boss_damage: number;
  rank: number;
  updated_at: number;
}

export interface Season {
  id: number;
  start_time: number;
  end_time: number;
  is_active: boolean;
  prize_pool: number;
}

export interface Riddle {
  id: number;
  question: string;
  answer: string;
  from_zone: string;
  to_zone: string;
  damage_on_fail: number;
  active_date: string; // YYYY-MM-DD format
}

export interface WorldBoss {
  id: number;
  name: string;
  zone_id: string;
  max_hp: number;
  current_hp: number;
  atk: number;
  def: number;
  prize_pool: number;
  last_spawn: number;
  respawn_hours: number;
  is_alive: boolean;
}

export interface PvPMatch {
  id: number;
  challenger_id: number;
  challenged_id: number;
  wager_amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  winner_id: number | null;
  combat_log: string | null; // JSON combat details
  created_at: number;
  completed_at: number | null;
}

export interface Transaction {
  id: number;
  from_agent_id: number | null;
  to_agent_id: number | null;
  transaction_type: 'trade' | 'shop_buy' | 'shop_sell' | 'pvp_wager' | 'boss_prize' | 'guild_split';
  item_code: string | null;
  quantity: number;
  gold_amount: number;
  created_at: number;
}

export interface Trade {
  id: number;
  proposer_id: number;
  target_id: number;
  offer_items: string; // JSON array of item codes
  offer_gold: number;
  request_items: string; // JSON array of item codes
  request_gold: number;
  zone_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: number;
}

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      wallet_address TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      zone_id TEXT NOT NULL DEFAULT 'the_gate',
      hp INTEGER NOT NULL DEFAULT 100,
      max_hp INTEGER NOT NULL DEFAULT 100,
      atk INTEGER NOT NULL DEFAULT 10,
      def INTEGER NOT NULL DEFAULT 5,
      spd INTEGER NOT NULL DEFAULT 5,
      luck INTEGER NOT NULL DEFAULT 3,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      corruption INTEGER NOT NULL DEFAULT 0,
      skill_points INTEGER NOT NULL DEFAULT 0,
      is_dead BOOLEAN NOT NULL DEFAULT 0,
      prestige_points INTEGER NOT NULL DEFAULT 0,
      season_id INTEGER NOT NULL,
      guild_id INTEGER,
      created_at INTEGER NOT NULL,
      last_action_at INTEGER NOT NULL,
      last_rest_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Zones table
  db.exec(`
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      danger_level INTEGER NOT NULL,
      description TEXT NOT NULL,
      is_pvp BOOLEAN NOT NULL DEFAULT 0,
      requires_guild_size INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      atk_bonus INTEGER NOT NULL DEFAULT 0,
      def_bonus INTEGER NOT NULL DEFAULT 0,
      hp_bonus INTEGER NOT NULL DEFAULT 0,
      corruption_per_action INTEGER NOT NULL DEFAULT 0,
      weight INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL,
      craftable BOOLEAN NOT NULL DEFAULT 0,
      craft_recipe TEXT
    )
  `);

  // Inventory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      equipped BOOLEAN NOT NULL DEFAULT 0,
      acquired_at INTEGER NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id)
    )
  `);

  // Combat log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS combat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      opponent_type TEXT NOT NULL,
      opponent_name TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      damage_dealt INTEGER NOT NULL,
      damage_taken INTEGER NOT NULL,
      xp_gained INTEGER NOT NULL,
      gold_gained INTEGER NOT NULL,
      won BOOLEAN NOT NULL,
      guild_id INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id)
    )
  `);

  // Guilds table
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      leader_id INTEGER NOT NULL,
      loot_mode TEXT NOT NULL DEFAULT 'round-robin',
      max_members INTEGER NOT NULL DEFAULT 5,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(leader_id) REFERENCES agents(id)
    )
  `);

  // Guild members table
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      FOREIGN KEY(guild_id) REFERENCES guilds(id),
      FOREIGN KEY(agent_id) REFERENCES agents(id),
      UNIQUE(guild_id, agent_id)
    )
  `);

  // Leaderboard table
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      mobs_killed INTEGER NOT NULL DEFAULT 0,
      gold_accumulated INTEGER NOT NULL DEFAULT 0,
      boss_damage INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE(season_id, agent_id)
    )
  `);

  // Seasons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      prize_pool INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Riddles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS riddles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      from_zone TEXT NOT NULL,
      to_zone TEXT NOT NULL,
      damage_on_fail INTEGER NOT NULL DEFAULT 10,
      active_date TEXT NOT NULL
    )
  `);

  // World bosses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      max_hp INTEGER NOT NULL,
      current_hp INTEGER NOT NULL,
      atk INTEGER NOT NULL,
      def INTEGER NOT NULL,
      prize_pool INTEGER NOT NULL DEFAULT 0,
      last_spawn INTEGER NOT NULL,
      respawn_hours INTEGER NOT NULL,
      is_alive BOOLEAN NOT NULL DEFAULT 1
    )
  `);

  // PvP matches table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pvp_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger_id INTEGER NOT NULL,
      challenged_id INTEGER NOT NULL,
      wager_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      winner_id INTEGER,
      combat_log TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY(challenger_id) REFERENCES agents(id),
      FOREIGN KEY(challenged_id) REFERENCES agents(id)
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent_id INTEGER,
      to_agent_id INTEGER,
      transaction_type TEXT NOT NULL,
      item_code TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      gold_amount INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Activity log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      agent_name TEXT,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Trades table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposer_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      offer_items TEXT NOT NULL,
      offer_gold INTEGER NOT NULL DEFAULT 0,
      request_items TEXT NOT NULL,
      request_gold INTEGER NOT NULL DEFAULT 0,
      zone_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(proposer_id) REFERENCES agents(id),
      FOREIGN KEY(target_id) REFERENCES agents(id)
    )
  `);

  // Skills table (definitions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      cost INTEGER NOT NULL,
      prerequisite TEXT,
      description TEXT NOT NULL
    )
  `);

  // Agent skills table (unlocked skills per agent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id),
      UNIQUE(agent_id, skill_id)
    )
  `);

  // Achievements table (definitions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL
    )
  `);

  // Agent achievements table (unlocked achievements per agent)
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

  // Zone gate unlocks table (boss-gated zone transitions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS zone_gate_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      gate_id TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      UNIQUE(season_id, agent_id, gate_id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_agents_season ON agents(season_id);
    CREATE INDEX IF NOT EXISTS idx_agents_guild ON agents(guild_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_agent ON inventory(agent_id);
    CREATE INDEX IF NOT EXISTS idx_combat_log_agent ON combat_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_season ON leaderboard(season_id);
    CREATE INDEX IF NOT EXISTS idx_riddles_date ON riddles(active_date);
    CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_id);
    CREATE INDEX IF NOT EXISTS idx_trades_target ON trades(target_id);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_achievements_agent ON agent_achievements(agent_id);
    CREATE INDEX IF NOT EXISTS idx_zone_gate_unlocks_agent ON zone_gate_unlocks(agent_id, season_id);
  `);

  // Migration: add last_rest_at column if missing
  try {
    db.exec('ALTER TABLE agents ADD COLUMN last_rest_at INTEGER NOT NULL DEFAULT 0');
  } catch (_e) {
    // Column already exists
  }

  // Migration: add last_gather_at column if missing
  try {
    db.exec('ALTER TABLE agents ADD COLUMN last_gather_at INTEGER NOT NULL DEFAULT 0');
  } catch (_e) {
    // Column already exists
  }

  return db;
}
