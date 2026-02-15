import { Stance, CombatAction, StatusEffect } from '../engine/combat-session.js';

// ============ Server → Agent Messages ============

export interface WelcomeMessage {
  type: 'welcome';
  agentId: number;
  agentName: string;
}

export interface AgentObservation {
  type: 'observation';
  agent: {
    id: number;
    name: string;
    level: number;
    xp: number;
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    luck: number;
    gold: number;
    corruption: number;
    zone: string;
    isDead: boolean;
    skillPoints: number;
    equipBonuses: { atk: number; def: number; hp: number };
  };
  zone: {
    id: string;
    name: string;
    dangerLevel: number;
    connectedZones: string[];
    mobs: Array<{
      id: string;
      name: string;
      hp: number;
      atk: number;
      def: number;
      spd: number;
      element: string;
      archetype: string;
      xp_reward: number;
      gold_reward: number;
    }>;
    resources: Array<{
      id: string;
      name: string;
      gather_time_seconds: number;
    }>;
    nearbyPlayers: Array<{
      name: string;
      level: number;
    }>;
  };
  inventory: Array<{
    itemCode: string;
    name: string;
    quantity: number;
    category: string;
    rarity: string;
    equipped: boolean;
  }>;
  combat: {
    active: boolean;
    combatId?: string;
    round?: number;
    status?: string;
    enemy?: {
      name: string;
      hp: number;
      maxHp: number;
      element: string;
      archetype: string;
      buffs: StatusEffect[];
      debuffs: StatusEffect[];
    };
    player?: {
      hp: number;
      maxHp: number;
      stamina: number;
      maxStamina: number;
      buffs: StatusEffect[];
      debuffs: StatusEffect[];
      abilities: Array<{
        id: string;
        name: string;
        description: string;
        staminaCost: number;
        cooldown: number;
        maxCooldown: number;
      }>;
    };
    deadlineAt?: number;
    encounterType?: string;
  };
  quests: Array<{
    id: string;
    name: string;
    description: string;
    objective: {
      type: string;
      target?: string;
      targetName: string;
      amount: number;
    };
    progress: number;
    completed: boolean;
    claimed: boolean;
  }>;
  availableActions: string[];
  world: {
    season: number;
    worldBoss: {
      name: string;
      hp: number;
      maxHp: number;
      isAlive: boolean;
    } | null;
  };
}

export interface ActionResultMessage {
  type: 'action_result';
  id: string;
  success: boolean;
  message: string;
  data?: any;
  observation: AgentObservation;
}

export interface ErrorMessage {
  type: 'error';
  id?: string;
  error: string;
}

export type ServerMessage = WelcomeMessage | AgentObservation | ActionResultMessage | ErrorMessage;

// ============ Agent → Server Messages ============

export interface AuthMessage {
  type: 'auth';
  apiKey: string;
}

export interface GameActionMessage {
  type: 'action';
  id: string;
  action: string;
  target?: string;
  params?: Record<string, any>;
}

export interface CombatActionMessage {
  type: 'combat_action';
  id: string;
  combatId: string;
  stance: Stance;
  action: CombatAction;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = AuthMessage | GameActionMessage | CombatActionMessage | PingMessage;
