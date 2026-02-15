import Database from 'better-sqlite3';
import { Guild, Agent } from '../db/schema.js';

export type LootMode = 'round-robin' | 'need-before-greed' | 'leader-decides';

export function createGuild(
  db: Database.Database,
  name: string,
  leaderId: number,
  lootMode: LootMode = 'round-robin'
): { success: boolean; message: string; guild?: Guild } {
  // Check if leader exists and is not dead
  const leader = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(leaderId) as Agent | undefined;
  if (!leader) {
    return { success: false, message: 'Leader not found or is dead' };
  }

  // Check if leader is already in a guild
  if (leader.guild_id) {
    return { success: false, message: 'You are already in a guild' };
  }

  // Check if guild name is taken
  const existing = db.prepare('SELECT * FROM guilds WHERE name = ?').get(name);
  if (existing) {
    return { success: false, message: 'Guild name already taken' };
  }

  const now = Date.now();

  // Create guild
  const result = db.prepare(`
    INSERT INTO guilds (name, leader_id, loot_mode, max_members, created_at)
    VALUES (?, ?, ?, 5, ?)
  `).run(name, leaderId, lootMode, now);

  const guildId = result.lastInsertRowid as number;

  // Add leader as first member
  db.prepare(`
    INSERT INTO guild_members (guild_id, agent_id, joined_at)
    VALUES (?, ?, ?)
  `).run(guildId, leaderId, now);

  // Update agent's guild_id
  db.prepare('UPDATE agents SET guild_id = ? WHERE id = ?').run(guildId, leaderId);

  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId) as Guild;
  
  return { success: true, message: 'Guild created', guild };
}

export function joinGuild(
  db: Database.Database,
  guildId: number,
  agentId: number
): { success: boolean; message: string } {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(agentId) as Agent | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found or is dead' };
  }

  if (agent.guild_id) {
    return { success: false, message: 'You are already in a guild' };
  }

  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId) as Guild | undefined;
  if (!guild) {
    return { success: false, message: 'Guild not found' };
  }

  // Check member count
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM guild_members WHERE guild_id = ?')
    .get(guildId) as { count: number };

  if (memberCount.count >= guild.max_members) {
    return { success: false, message: 'Guild is full' };
  }

  const now = Date.now();

  // Add member
  db.prepare(`
    INSERT INTO guild_members (guild_id, agent_id, joined_at)
    VALUES (?, ?, ?)
  `).run(guildId, agentId, now);

  // Update agent's guild_id
  db.prepare('UPDATE agents SET guild_id = ? WHERE id = ?').run(guildId, agentId);

  return { success: true, message: 'Joined guild' };
}

export function leaveGuild(
  db: Database.Database,
  agentId: number
): { success: boolean; message: string } {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent | undefined;
  if (!agent || !agent.guild_id) {
    return { success: false, message: 'You are not in a guild' };
  }

  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(agent.guild_id) as Guild;

  // If leader leaves, disband guild
  if (guild.leader_id === agentId) {
    return disbandGuild(db, guild.id);
  }

  // Remove member
  db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND agent_id = ?')
    .run(agent.guild_id, agentId);

  // Update agent
  db.prepare('UPDATE agents SET guild_id = NULL WHERE id = ?').run(agentId);

  return { success: true, message: 'Left guild' };
}

export function disbandGuild(
  db: Database.Database,
  guildId: number
): { success: boolean; message: string } {
  // Remove all members
  const members = db.prepare('SELECT agent_id FROM guild_members WHERE guild_id = ?')
    .all(guildId) as { agent_id: number }[];

  for (const member of members) {
    db.prepare('UPDATE agents SET guild_id = NULL WHERE id = ?').run(member.agent_id);
  }

  db.prepare('DELETE FROM guild_members WHERE guild_id = ?').run(guildId);
  db.prepare('DELETE FROM guilds WHERE id = ?').run(guildId);

  return { success: true, message: 'Guild disbanded' };
}

export function getGuildMembers(db: Database.Database, guildId: number): Agent[] {
  const members = db.prepare(`
    SELECT a.* FROM agents a
    JOIN guild_members fm ON a.id = fm.agent_id
    WHERE fm.guild_id = ? AND a.is_dead = 0
    ORDER BY fm.joined_at
  `).all(guildId) as Agent[];

  return members;
}

export function getGuildInfo(db: Database.Database, guildId: number): {
  guild: Guild;
  members: Agent[];
  memberCount: number;
} | null {
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId) as Guild | undefined;
  if (!guild) return null;

  const members = getGuildMembers(db, guildId);

  return {
    guild,
    members,
    memberCount: members.length
  };
}

export function canEnterZone(
  db: Database.Database,
  agentId: number,
  _zoneId: string,
  requiredGuildSize: number
): { canEnter: boolean; message: string } {
  if (requiredGuildSize === 0) {
    return { canEnter: true, message: 'Zone accessible' };
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  
  if (!agent.guild_id) {
    return { 
      canEnter: false, 
      message: `This zone requires a guild of at least ${requiredGuildSize} members` 
    };
  }

  const members = getGuildMembers(db, agent.guild_id);
  
  // Check if enough members are in the same zone
  const membersInZone = members.filter(m => m.zone_id === agent.zone_id);

  if (membersInZone.length < requiredGuildSize) {
    return { 
      canEnter: false, 
      message: `Need ${requiredGuildSize} guild members in the same zone. Currently: ${membersInZone.length}` 
    };
  }

  return { canEnter: true, message: 'Guild ready' };
}

export function distributeLoot(
  db: Database.Database,
  guildId: number,
  items: string[],
  gold: number
): void {
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId) as Guild;
  const members = getGuildMembers(db, guildId);

  if (members.length === 0) return;

  // Distribute gold evenly
  const goldPerMember = Math.floor(gold / members.length);
  for (const member of members) {
    db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(goldPerMember, member.id);
  }

  // Distribute items based on loot mode
  switch (guild.loot_mode) {
    case 'round-robin':
      // Cycle through members
      items.forEach((item, index) => {
        const recipient = members[index % members.length];
        addItemToInventory(db, recipient.id, item);
      });
      break;

    case 'leader-decides':
      // All items to leader
      const leader = members.find(m => m.id === guild.leader_id);
      if (leader) {
        for (const item of items) {
          addItemToInventory(db, leader.id, item);
        }
      }
      break;

    case 'need-before-greed':
      // Random distribution (simplified version)
      for (const item of items) {
        const randomMember = members[Math.floor(Math.random() * members.length)];
        addItemToInventory(db, randomMember.id, item);
      }
      break;
  }
}

function addItemToInventory(db: Database.Database, agentId: number, itemCode: string): void {
  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number } | undefined;

  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, 1, 0, ?)')
      .run(agentId, itemCode, Date.now());
  }
}
