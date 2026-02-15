export type Stance = 'aggressive' | 'balanced' | 'defensive' | 'evasive';
export type ElementType = 'fire' | 'ice' | 'shadow' | 'holy' | 'none';
export type EnemyArchetype = 'brute' | 'guardian' | 'assassin' | 'caster' | 'boss';
export type EncounterType = 'mob' | 'gate_boss' | 'world_boss';
export type CombatStatus = 'loading' | 'awaiting_input' | 'resolving' | 'animating' | 'victory' | 'defeat' | 'fled';

export interface CombatAction {
  type: 'basic_attack' | 'ability' | 'consumable' | 'guard' | 'flee';
  abilityId?: string;
  itemCode?: string;
}

export interface AbilityState {
  id: string;
  name: string;
  description: string;
  staminaCost: number;
  cooldown: number;
  maxCooldown: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  stat?: string;
  value: number;
  duration: number;
  damagePerTurn?: number;
}

export interface EnemyState {
  name: string;
  hp: number;
  maxHp: number;
  element: ElementType;
  archetype: EnemyArchetype;
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  element: ElementType;
  abilities: AbilityState[];
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
}

export interface RoundResolution {
  round: number;
  playerStance: Stance;
  enemyStance: Stance;
  playerAction: CombatAction;
  enemyAction: CombatAction;
  stanceInteraction: string | null;
  turnOrder: 'player_first' | 'enemy_first' | 'simultaneous';
  playerDamageDealt: number;
  playerDamageTaken: number;
  events: string[];
  narrative: string;
}

export interface Rewards {
  xpGained: number;
  goldGained: number;
  itemsDropped: string[];
  xpCapped: boolean;
  xpCappedMessage?: string;
  questCompleted?: string;
  gateUnlocked?: boolean;
  newZone?: string;
  gateMessage?: string;
  lootRoll?: any;
  partyRewards?: {
    totalXp: number;
    totalGold: number;
    xpPerMember: number;
    goldPerMember: number;
    livingMembers: number;
    partySize: number;
  };
}

export interface LogEntry {
  round: number;
  narrative: string;
  events: string[];
  playerDamageDealt: number;
  playerDamageTaken: number;
}

export interface CombatState {
  combatId: string;
  zone: string;
  encounterType: EncounterType;
  status: CombatStatus;
  round: number;
  enemy: EnemyState;
  player: PlayerState;
  selectedStance: Stance | null;
  selectedAction: CombatAction | null;
  lastResolution: RoundResolution | null;
  log: LogEntry[];
  rewards: Rewards | null;
  timer: number;
  deadlineAt: number;
}
