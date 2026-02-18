export type Stance = 'aggressive' | 'balanced' | 'defensive' | 'evasive';
export type ElementType = 'fire' | 'ice' | 'shadow' | 'holy' | 'none';
export type EnemyArchetype = 'brute' | 'guardian' | 'assassin' | 'caster' | 'boss';
export type EncounterType = 'mob' | 'gate_boss' | 'world_boss';
export type CombatStatus = 'loading' | 'awaiting_input' | 'resolving' | 'animating' | 'victory' | 'defeat' | 'fled';

export type PlayerClass = 'sentinel' | 'reaver' | 'shade' | 'warden' | 'corsair' | 'pyromancer' | 'void_weaver';

export type AbilitySlotType = 'primary' | 'q' | 'e' | 'r';
export type AbilityVisual = 'melee_instant' | 'projectile' | 'self_aoe' | 'targeted_aoe' | 'self_buff' | 'drain';
export type MeshType = 'heavy_armor' | 'dual_wield' | 'slim_rogue' | 'ranger' | 'gunslinger' | 'fire_mage' | 'void_mage';

export interface ClassAbilityDef {
  id: string;
  name: string;
  slot: AbilitySlotType;
  cooldownTicks: number;
  staminaCost: number;
  range: number;
  damage: number;
  projectileSpeed: number;
  aoeRadius: number;
  element: ElementType;
  visual: AbilityVisual;
  duration?: number;       // buff/debuff duration in ticks
  dotDamage?: number;      // damage per tick for DoTs
  dotDuration?: number;    // DoT tick count
  buffEffect?: string;     // e.g. 'attack_speed', 'damage_reduction', 'reflect', 'taunt', 'stealth'
  buffValue?: number;      // multiplier or flat value
  healPercent?: number;    // for life drain
  piercing?: boolean;      // passes through enemies
  projectileCount?: number; // for fan abilities
}

export interface ClassDef {
  id: PlayerClass;
  name: string;
  role: string;
  description: string;
  hp: number;
  stamina: number;
  attackRange: number;
  abilities: ClassAbilityDef[];
  color: string;
  meshType: MeshType;
}

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

export interface GroundLootState {
  id: string;
  itemCode: string;
  itemName: string;
  rarity: string;
  x: number;
  y: number;
}

export interface GroundLootItem {
  id: string;
  itemCode: string;
  itemName: string;
  rarity: string;
  x: number;
  y: number;
  pickedUp: boolean;
  isHealing?: boolean;
  healAmount?: number;
}

export type EquipSlot = 'weapon' | 'armor' | 'shield' | 'accessory';

export interface InventoryItem {
  id: number;
  itemCode: string;
  itemName: string;
  rarity: string;
  category: string;
  atkBonus: number;
  defBonus: number;
  hpBonus: number;
  equipped: boolean;
}

export interface Rewards {
  xpGained: number;
  goldGained: number;
  itemsDropped: { itemName: string; rarity: string }[];
  xpCapped: boolean;
  playerLevel?: number;
  playerLevelEnd?: number;
  xpCappedMessage?: string;
  questCompleted?: string;
  gateUnlocked?: boolean;
  newZone?: string;
  gateMessage?: string;
  lootRoll?: any;
  lootItems?: Array<{ name: string; rarity: string }>;
  nextZone?: string;
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
