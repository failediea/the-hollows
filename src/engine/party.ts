/**
 * Party System & Loot Roll System for The Hollows
 * - In-memory party management (max 3 members)
 * - Cryptographically secure loot rolls
 */

import { randomInt } from 'node:crypto';
import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';

// ============ PARTY DATA MODEL ============

export interface PartyMember {
  agentId: number;
  agentName: string;
  level: number;
  hp: number;
  maxHp: number;
  zone: string;
}

export interface Party {
  id: string;
  leaderId: number;
  members: PartyMember[];
  maxSize: number;
  isOpen: boolean;
  createdAt: number;
}

// ============ LOOT ROLL DATA MODEL ============

export interface LootRollItem {
  itemName: string;
  itemCode: string;
  rarity: string;
  rolls: Record<string, number>; // agentName -> roll value
  winnerId: number;
  winnerName: string;
}

export interface LootRoll {
  combatId: string;
  items: LootRollItem[];
  participants: { id: number; name: string }[];
  status: 'resolved';
  createdAt: number;
}

// ============ IN-MEMORY STORAGE ============

const parties = new Map<string, Party>();
const agentToParty = new Map<number, string>(); // agentId -> partyId
const lootRolls = new Map<string, LootRoll>(); // combatId -> LootRoll

// ============ PARTY MANAGEMENT ============

export function createParty(db: Database.Database, agentId: number, isOpen: boolean): { success: boolean; message: string; party?: Party } {
  if (agentToParty.has(agentId)) {
    return { success: false, message: 'You are already in a party. Leave first.' };
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(agentId) as Agent | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found or dead' };
  }

  const partyId = `p_${Date.now()}_${randomInt(1000, 9999)}`;
  const party: Party = {
    id: partyId,
    leaderId: agentId,
    members: [{
      agentId: agent.id,
      agentName: agent.name,
      level: agent.level,
      hp: agent.hp,
      maxHp: agent.max_hp,
      zone: agent.zone_id,
    }],
    maxSize: 3,
    isOpen,
    createdAt: Date.now(),
  };

  parties.set(partyId, party);
  agentToParty.set(agentId, partyId);

  return { success: true, message: `Party created (${isOpen ? 'open' : 'private'})`, party };
}

export function joinParty(db: Database.Database, agentId: number, partyId: string): { success: boolean; message: string; party?: Party } {
  if (agentToParty.has(agentId)) {
    return { success: false, message: 'You are already in a party. Leave first.' };
  }

  const party = parties.get(partyId);
  if (!party) {
    return { success: false, message: 'Party not found' };
  }

  if (!party.isOpen) {
    return { success: false, message: 'This party is private' };
  }

  if (party.members.length >= party.maxSize) {
    return { success: false, message: 'Party is full' };
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(agentId) as Agent | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found or dead' };
  }

  // Must be in the same zone as the leader
  const leader = party.members[0];
  if (agent.zone_id !== leader.zone) {
    return { success: false, message: `You must be in ${leader.zone} to join this party` };
  }

  party.members.push({
    agentId: agent.id,
    agentName: agent.name,
    level: agent.level,
    hp: agent.hp,
    maxHp: agent.max_hp,
    zone: agent.zone_id,
  });

  agentToParty.set(agentId, partyId);

  return { success: true, message: `Joined ${leader.agentName}'s party`, party };
}

export function inviteToParty(db: Database.Database, inviterId: number, partyId: string, targetAgentName: string): { success: boolean; message: string } {
  const party = parties.get(partyId);
  if (!party) return { success: false, message: 'Party not found' };
  if (party.leaderId !== inviterId) return { success: false, message: 'Only the party leader can invite' };
  if (party.members.length >= party.maxSize) return { success: false, message: 'Party is full' };

  const target = db.prepare('SELECT * FROM agents WHERE name = ? AND is_dead = 0').get(targetAgentName) as Agent | undefined;
  if (!target) return { success: false, message: 'Target agent not found or dead' };
  if (agentToParty.has(target.id)) return { success: false, message: 'Target is already in a party' };

  const leader = party.members[0];
  if (target.zone_id !== leader.zone) {
    return { success: false, message: 'Target must be in the same zone' };
  }

  // Auto-join on invite (no pending system for simplicity)
  party.members.push({
    agentId: target.id,
    agentName: target.name,
    level: target.level,
    hp: target.hp,
    maxHp: target.max_hp,
    zone: target.zone_id,
  });

  agentToParty.set(target.id, partyId);

  return { success: true, message: `${target.name} has been invited and joined the party` };
}

export function leaveParty(agentId: number): { success: boolean; message: string } {
  const partyId = agentToParty.get(agentId);
  if (!partyId) return { success: false, message: 'You are not in a party' };

  const party = parties.get(partyId);
  if (!party) {
    agentToParty.delete(agentId);
    return { success: false, message: 'Party not found' };
  }

  party.members = party.members.filter(m => m.agentId !== agentId);
  agentToParty.delete(agentId);

  if (party.members.length === 0) {
    parties.delete(partyId);
    return { success: true, message: 'Party disbanded (empty)' };
  }

  // If leader left, transfer leadership
  if (party.leaderId === agentId) {
    party.leaderId = party.members[0].agentId;
  }

  return { success: true, message: 'You left the party' };
}

export function kickFromParty(kickerId: number, targetAgentId: number): { success: boolean; message: string } {
  const partyId = agentToParty.get(kickerId);
  if (!partyId) return { success: false, message: 'You are not in a party' };

  const party = parties.get(partyId);
  if (!party) return { success: false, message: 'Party not found' };
  if (party.leaderId !== kickerId) return { success: false, message: 'Only the party leader can kick members' };
  if (targetAgentId === kickerId) return { success: false, message: 'Cannot kick yourself' };

  const member = party.members.find(m => m.agentId === targetAgentId);
  if (!member) return { success: false, message: 'Target is not in your party' };

  party.members = party.members.filter(m => m.agentId !== targetAgentId);
  agentToParty.delete(targetAgentId);

  return { success: true, message: `${member.agentName} has been kicked from the party` };
}

export function getMyParty(agentId: number): Party | null {
  const partyId = agentToParty.get(agentId);
  if (!partyId) return null;
  return parties.get(partyId) || null;
}

export function getOpenParties(zone: string): Party[] {
  const result: Party[] = [];
  for (const party of parties.values()) {
    if (party.isOpen && party.members.length < party.maxSize) {
      // Check if leader is in the same zone
      if (party.members[0]?.zone === zone) {
        result.push(party);
      }
    }
  }
  return result;
}

export function getAgentPartyId(agentId: number): string | null {
  return agentToParty.get(agentId) || null;
}

export function refreshPartyMember(db: Database.Database, agentId: number): void {
  const partyId = agentToParty.get(agentId);
  if (!partyId) return;
  const party = parties.get(partyId);
  if (!party) return;

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent | undefined;
  if (!agent) return;

  const member = party.members.find(m => m.agentId === agentId);
  if (member) {
    member.hp = agent.hp;
    member.maxHp = agent.max_hp;
    member.level = agent.level;
    member.zone = agent.zone_id;
  }
}

// ============ PARTY COMBAT HELPERS ============

/**
 * Scale mob HP for party combat
 * baseHp * (1 + 0.5 * (partySize - 1))
 */
export function scaleMobHp(baseHp: number, partySize: number): number {
  return Math.floor(baseHp * (1 + 0.5 * (partySize - 1)));
}

/**
 * Split XP evenly among living party members
 */
export function splitXp(totalXp: number, livingMembers: number): number {
  return Math.floor(totalXp / livingMembers);
}

// ============ LOOT ROLL SYSTEM ============

/**
 * Create a loot roll for party combat. All rolls are pre-computed server-side.
 * Uses crypto.randomInt for cryptographic security.
 */
export function createLootRoll(
  combatId: string,
  items: { name: string; code: string; rarity: string }[],
  participants: { id: number; name: string }[]
): LootRoll {
  const rollItems: LootRollItem[] = items.map(item => {
    const rolls: Record<string, number> = {};
    let maxRoll = -1;
    let winners: { id: number; name: string }[] = [];

    // Initial roll for each participant
    for (const p of participants) {
      const roll = randomInt(1, 101); // 1-100 inclusive
      rolls[p.name] = roll;
      if (roll > maxRoll) {
        maxRoll = roll;
        winners = [p];
      } else if (roll === maxRoll) {
        winners.push(p);
      }
    }

    // Tie-breaking: re-roll among tied players until one wins
    while (winners.length > 1) {
      let tieMax = -1;
      let tieWinners: { id: number; name: string }[] = [];
      for (const w of winners) {
        const tieRoll = randomInt(1, 101);
        rolls[w.name] = tieRoll; // Overwrite with tie-breaker roll
        if (tieRoll > tieMax) {
          tieMax = tieRoll;
          tieWinners = [w];
        } else if (tieRoll === tieMax) {
          tieWinners.push(w);
        }
      }
      winners = tieWinners;
    }

    return {
      itemName: item.name,
      itemCode: item.code,
      rarity: item.rarity,
      rolls,
      winnerId: winners[0].id,
      winnerName: winners[0].name,
    };
  });

  const lootRoll: LootRoll = {
    combatId,
    items: rollItems,
    participants,
    status: 'resolved',
    createdAt: Date.now(),
  };

  lootRolls.set(combatId, lootRoll);

  return lootRoll;
}

export function getLootRoll(combatId: string): LootRoll | null {
  return lootRolls.get(combatId) || null;
}

/**
 * Clean up old loot rolls (older than 1 hour)
 */
export function cleanupLootRolls(): number {
  const cutoff = Date.now() - 3600000;
  let cleaned = 0;
  for (const [id, roll] of lootRolls.entries()) {
    if (roll.createdAt < cutoff) {
      lootRolls.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}
