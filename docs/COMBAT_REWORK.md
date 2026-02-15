# Combat Rework Design Document

> Replaces the current auto-battler (`simulateCombat`) with a turn-based tactical combat system where every decision matters — especially when death is permanent.

## Design Philosophy

The old system: call `attack`, watch an auto-resolved log, collect loot or die. No decisions, no tension.

The new system: combat is a **multi-round tactical encounter** where each round the player chooses a **stance**, an **action**, and optionally a **target/modifier**. Resource management (Stamina, ability cooldowns, consumables) creates meaningful trade-offs. With permadeath, every fight is a risk calculation.

### Core Principles

1. **Every round is a decision** — no auto-pilot
2. **No free information** — you cannot predict the enemy; decisions are based on game knowledge, not hints
3. **Resource tension** — stamina is scarce, abilities have cooldowns, potions are finite
4. **Risk/reward** — aggressive play deals more damage but exposes you to death
5. **Works for both humans (UI clicks) and AI agents (API calls)** — same underlying model
6. **Permadeath amplifies everything** — a "safe" play style is valid; greed is punished

---

## 1. Combat Flow

### 1.1 Encounter Initiation

When a player takes the `attack` action (or is ambushed by a zone event), a **Combat Session** is created server-side.

```
POST /api/action
{ "action": "attack", "params": { "target": "mob_id" } }  // optional target

→ 201 Created
{
  "combatId": "c_abc123",
  "enemy": {
    "name": "Bone Sentinel",
    "hp": 45, "maxHp": 45,
    "element": "shadow",
    "tier": "elite"
  },
  "agent": {
    "hp": 62, "maxHp": 80,
    "stamina": 10, "maxStamina": 10,
    "element": "fire",
    "abilities": [
      { "id": "power_strike", "name": "Power Strike", "staminaCost": 3, "cooldown": 0, "maxCooldown": 2, "description": "Deal 1.8× ATK damage" },
      { "id": "shield_bash", "name": "Shield Bash", "staminaCost": 2, "cooldown": 0, "maxCooldown": 3, "description": "Deal 1.0× ATK and stun enemy for 1 round" }
    ],
    "consumables": [
      { "itemCode": "health_potion", "name": "Health Potion", "quantity": 2 }
    ]
  },
  "round": 1,
  "status": "awaiting_input",
  "timeoutSeconds": 30
}
```

### 1.2 Round Structure

Each round proceeds in phases:

1. **Player Input Phase** — player chooses stance + action (30s timeout; default: `defensive` + `basic_attack` on timeout)
2. **Resolution Phase** — server resolves both combatants simultaneously with speed-based priority
3. **Status Phase** — apply status effects (poison, bleed, stun), tick cooldowns, regenerate stamina
4. **Result Phase** — return round outcome; if HP ≤ 0 for either side, combat ends

### 1.3 Input Timeout & AI Agents

- **Human players (browser):** 30-second timer per round. UI shows countdown. On timeout, auto-selects defensive stance + basic attack (survival instinct).
- **AI agents (API):** Same 30-second window. The combat session stays in `awaiting_input` state. Agent polls or uses webhook.
- **Fleeing:** Always available. Costs the current round (enemy gets a free hit). SPD check determines success (see §3.5).

---

## 2. Stances

Each round, the player picks **one stance**. Stances create a rock-paper-scissors dynamic layered on top of action choices.

| Stance | ATK Modifier | DEF Modifier | Effect |
|---|---|---|---|
| **Aggressive** | ×1.3 | ×0.7 | +15% crit chance. Bonus damage but vulnerable. |
| **Balanced** | ×1.0 | ×1.0 | No modifiers. Reliable. |
| **Defensive** | ×0.6 | ×1.5 | Block: 30% chance to negate all damage this round. |
| **Evasive** | ×0.8 | ×0.8 | Dodge: SPD-based chance to fully avoid one hit (see §4.3). Counter-attack on dodge. |

### Stance Interactions (Bonus Effects)

| Your Stance → Enemy Stance | Bonus |
|---|---|
| Aggressive → Defensive | "Guard Break": ignore 50% of their DEF bonus |
| Defensive → Aggressive | "Punish": if block triggers, deal a free counter-attack |
| Evasive → Balanced | "Read": +20% dodge chance |
| Balanced → Evasive | "Track": opponent's dodge chance halved |


---

## 3. Actions

Each round, the player picks **one action** in addition to their stance.

### 3.1 Basic Attack (free — 0 stamina)

- Deals `ATK × stanceMod × elementMod × (1 + variance)` damage
- Variance: ±10% random
- Always available

### 3.2 Abilities (cost stamina, have cooldowns)

Abilities are unlocked through skills/level progression. Each champion starts with 1 ability and can learn up to 4.

| Ability | Stamina | Cooldown | Effect |
|---|---|---|---|
| **Power Strike** | 3 | 2 rounds | Deal 1.8× ATK damage |
| **Shield Bash** | 2 | 3 rounds | Deal 1.0× ATK + stun enemy 1 round (they auto-use Balanced + no action) |
| **Venom Slash** | 2 | 2 rounds | Deal 0.8× ATK + apply poison (3 damage/round for 3 rounds) |
| **Battle Cry** | 4 | 5 rounds | +30% ATK for 3 rounds (buff) |
| **Heal** | 5 | 4 rounds | Restore 25% max HP |
| **Elemental Burst** | 4 | 3 rounds | Deal 2.0× ATK with your element (double element chart bonus/penalty) |
| **Riposte** | 2 | 2 rounds | Enter riposte state: if hit this round, auto-counter for 1.5× ATK |
| **Feint** | 1 | 1 round | Force enemy to reveal next round's true stance |

### 3.3 Use Consumable (free — 0 stamina, replaces action)

- Use a potion/food from inventory mid-combat
- Still takes your action for the round (can't attack AND drink a potion)
- Health potions, antidotes, stat buffs, etc.

### 3.4 Guard (free — 0 stamina)

- Take no action, gain +50% DEF this round
- Recover +2 stamina (on top of natural regen)
- Useful when waiting for cooldowns or low stamina

### 3.5 Flee (free — 0 stamina)

- Attempt to escape combat
- Success chance: `50% + (playerSPD - enemySPD) × 5%`, clamped to [10%, 90%]
- On failure: enemy gets a free hit (Aggressive stance, basic attack), you stay in combat
- On success: combat ends, no rewards, no death
- **Cannot flee from boss encounters**

---

## 4. Damage & Combat Formulas

### 4.1 Base Damage

```
rawDamage = ATK × stanceAtkMod × actionMultiplier × elementMultiplier
defense = DEF × stanceDefMod
mitigated = rawDamage - (defense × 0.5)
variance = mitigated × uniform(-0.1, 0.1)
damage = max(1, floor(mitigated + variance))
if critical: damage = floor(damage × 1.5)
```

### 4.2 Critical Hits

```
critChance = baseCrit + stanceCritBonus
baseCrit = min(0.40, luck / 120)
stanceCritBonus = 0.15 if aggressive, else 0
```

### 4.3 Dodge (Evasive Stance)

```
dodgeChance = 0.25 + (SPD - enemySPD) × 0.03
// apply interaction bonuses
if enemy is Balanced: dodgeChance × 0.5  (they "Track" you)
if enemy is Balanced and you Evasive: dodgeChance × 1.2 (you "Read" them — wait, this is Evasive vs Balanced)
// Clamp
dodgeChance = clamp(dodgeChance, 0.05, 0.60)
```

On successful dodge: deal a counter-attack at 0.5× ATK (free hit).

### 4.4 Block (Defensive Stance)

```
blockChance = 0.30
if hasShieldEquipped: blockChance += 0.15
```

Block negates ALL incoming damage for that round.

### 4.5 Element Chart (unchanged)

| → | Fire | Ice | Shadow | Holy | None |
|---|---|---|---|---|---|
| **Fire** | 1.0 | 2.0 | 1.0 | 0.5 | 1.0 |
| **Ice** | 0.5 | 1.0 | 1.0 | 1.0 | 1.0 |
| **Shadow** | 1.0 | 1.0 | 1.0 | 2.0 | 1.2 |
| **Holy** | 1.0 | 1.0 | 2.0 | 1.0 | 1.2 |
| **None** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

### 4.6 Stamina

- Max stamina: 10 (base) + level/5 (rounded down)
- Natural regen: +1 per round
- Guard action: +2 additional (total +3 that round)
- Stamina does NOT regenerate outside combat (resets to max at combat start)

### 4.7 Turn Order

Higher SPD acts first within a round. If the faster combatant kills the slower one, the slower one does NOT get their action (first-strike advantage).

---

## 5. Enemy AI Behavior

Enemies use a simple behavior tree based on their archetype:

| Archetype | Behavior |
|---|---|
| **Brute** | 60% Aggressive, 25% Balanced, 15% Defensive. Prefers Power Strike. |
| **Guardian** | 20% Aggressive, 30% Balanced, 50% Defensive. Uses Guard often. |
| **Assassin** | 30% Aggressive, 10% Balanced, 60% Evasive. Uses Venom Slash. |
| **Caster** | 40% Aggressive, 40% Balanced, 20% Defensive. Uses Elemental Burst. |
| **Boss** | Scripted phase-based AI (see §5.1). |

### 5.1 Boss Phases

Bosses change behavior at HP thresholds:

- **Phase 1 (100-60% HP):** Normal archetype behavior
- **Phase 2 (60-30% HP):** More aggressive, unlocks signature ability
- **Phase 3 (<30% HP):** Enraged — +50% ATK, uses abilities every round

---

## 6. Permadeath & Rest Rules

### 6.1 Permadeath

When HP reaches 0:

1. Champion is **permanently dead**. No revive. No gold payment. Dead.
2. All inventory, gold, XP, skills, guild membership — gone.
3. The death is logged and broadcast: `💀 {name} has perished in {zone}, slain by {enemy}.`
4. To play again: pay a new entrance fee in MONAD tokens → create a brand new champion.
5. **The old `revive` action is removed entirely.**

```sql
-- On death:
UPDATE agents SET is_dead = 1, died_at = NOW(), killed_by = ? WHERE id = ?;
-- No resurrection. Record stays for leaderboard history.
```

### 6.2 Rest Cooldown

- Rest cooldown: **5 minutes** (300,000ms) between rests (up from current 60s)
- Rest heals 25% max HP (unchanged)
- Rest is NOT available during combat
- This makes HP a genuinely scarce resource between fights

```typescript
const REST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
```

### 6.3 Strategic Implications

With permadeath + 5-min rest cooldown:
- Players must **choose fights carefully** — don't attack at low HP
- Consumables (health potions) become **extremely valuable**
- The Defensive stance and Flee action are **legitimate strategies**, not cowardice
- Guild play provides safety in numbers for boss encounters
- Trading potions/food becomes a real economy driver

---

## 7. API Reference

### 7.1 Start Combat

Already handled by existing `attack` action. Returns a `combatId` and initial state.

### 7.2 Submit Round Input

```
POST /api/combat/{combatId}/action
{
  "stance": "aggressive" | "balanced" | "defensive" | "evasive",
  "action": {
    "type": "basic_attack" | "ability" | "consumable" | "guard" | "flee",
    "abilityId": "power_strike",      // if type=ability
    "itemCode": "health_potion"       // if type=consumable
  }
}

→ 200 OK
{
  "combatId": "c_abc123",
  "round": 2,
  "resolution": {
    "playerStance": "aggressive",
    "enemyStance": "defensive",
    "stanceInteraction": "guard_break",
    "playerAction": { "type": "ability", "abilityId": "power_strike" },
    "enemyAction": { "type": "basic_attack" },
    "turnOrder": "player_first",
    "playerDamageDealt": 18,
    "playerDamageTaken": 6,
    "playerCrit": false,
    "playerDodged": false,
    "playerBlocked": false,
    "enemyCrit": false,
    "statusEffectsApplied": [],
    "statusEffectsTicked": [],
    "narrative": "You lunge forward with a devastating Power Strike, breaking through the Sentinel's guard! It retaliates with a bony fist, but your momentum absorbs the blow."
  },
  "state": {
    "player": { "hp": 56, "maxHp": 80, "stamina": 8, "maxStamina": 10, "buffs": [], "debuffs": [] },
    "enemy": { "hp": 27, "maxHp": 45, "buffs": [], "debuffs": [] },
    "abilities": [
      { "id": "power_strike", "cooldown": 2, "maxCooldown": 2 },
      { "id": "shield_bash", "cooldown": 0, "maxCooldown": 3 }
    ]
  },
  "status": "awaiting_input",  // or "victory" or "defeat" or "fled"
  "timeoutSeconds": 30
}
```

### 7.3 Combat End (Victory)

When enemy HP ≤ 0:

```json
{
  "status": "victory",
  "rewards": {
    "xpGained": 35,
    "goldGained": 12,
    "itemsDropped": ["bone_shard"],
    "combatSummary": {
      "roundsTotal": 5,
      "damageDealt": 48,
      "damageTaken": 22,
      "stancesUsed": { "aggressive": 3, "defensive": 1, "evasive": 1 },
      "abilitiesUsed": ["power_strike", "shield_bash"]
    }
  }
}
```

### 7.4 Combat End (Defeat — Permadeath)

```json
{
  "status": "defeat",
  "permadeath": true,
  "message": "💀 Your champion has fallen. The Hollows claim another soul.",
  "finalStats": {
    "name": "Vex the Bold",
    "level": 7,
    "totalXp": 2340,
    "monstersSlain": 48,
    "zonesExplored": 5,
    "survivalTime": "3d 14h 22m",
    "killedBy": "Bone Sentinel"
  },
  "playAgain": {
    "action": "POST /api/entry/pay",
    "cost": "entrance fee in MONAD tokens"
  }
}
```

### 7.5 Get Combat State (Polling)

```
GET /api/combat/{combatId}
→ Returns current state (same shape as action response minus resolution)
```

---

## 8. Browser UI Flow

### 8.1 Combat Screen Layout

```
┌─────────────────────────────────────────────┐
│  BONE SENTINEL          ███████░░░ 27/45 HP │
│  [shadow]               Stance: ???         │
│  Tell: "hunkers behind shield"              │
│                                             │
│  ─── Round 3 ───────────────────────────── │
│                                             │
│  YOUR CHAMPION          ██████░░░░ 56/80 HP │
│  [fire]  Stamina: ████████░░ 8/10           │
│                                             │
│  ┌─ STANCE ──────────────────────────────┐  │
│  │ ⚔️ Aggressive  🔰 Balanced            │  │
│  │ 🛡️ Defensive   💨 Evasive             │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ ACTION ──────────────────────────────┐  │
│  │ 🗡️ Basic Attack (0 STA)               │  │
│  │ 💥 Power Strike (3 STA) [CD: 2]       │  │
│  │ 🔨 Shield Bash (2 STA) [READY]        │  │
│  │ 🧪 Health Potion ×2                   │  │
│  │ 🛡️ Guard (+2 STA)                     │  │
│  │ 🏃 Flee                               │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [CONFIRM]                    ⏱️ 24s        │
│                                             │
│  ┌─ Combat Log ──────────────────────────┐  │
│  │ R1: You attacked (12 dmg). Hit for 8. │  │
│  │ R2: Power Strike! 18 dmg. Hit for 6.  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 8.2 Interaction Flow

1. Player selects **stance** (one of four buttons — highlights on click)
2. Player selects **action** (list updates based on stamina/cooldowns — grayed out if unavailable)
3. Player clicks **CONFIRM** (or timer runs out)
4. Resolution animation plays (1-2 seconds): damage numbers, HP bars animate, narrative text appears
5. Next round begins or combat ends

### 8.3 Permadeath Screen

On death, the screen goes dark with a dramatic reveal:

```
┌─────────────────────────────────────────────┐
│                                             │
│              💀 YOU HAVE FALLEN             │
│                                             │
│         "The Hollows claim another soul"    │
│                                             │
│  Vex the Bold                               │
│  Level 7 · 48 monsters slain · 3d survived  │
│  Killed by: Bone Sentinel                   │
│                                             │
│  Your champion is gone forever.             │
│  All progress has been lost.                │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │   🔄 Enter The Hollows Again         │   │
│  │   (Requires MONAD entrance fee)      │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 9. Guild Combat (World Bosses)

Guild combat uses the same system but with **simultaneous multi-player rounds**.

### 9.1 Flow

1. Guild leader initiates boss fight
2. All guild members in the zone join the combat session
3. Each round: ALL guild members submit stance + action independently (30s timeout)
4. Server resolves all guild member attacks, then boss attack(s)
5. Boss targets are chosen based on **threat** (damage dealt) — tanks can use Defensive+Guard to build threat without dealing damage (taunt mechanic via a guild ability)
6. If a guild member dies → permadeath applies. They are removed from combat.

### 9.2 API

```
POST /api/combat/{combatId}/action
// Same payload — each guild member submits independently
// Server waits for all living members (or timeout) before resolving
```

---

## 10. PvP Combat

PvP uses the same stance/action system. Both players submit simultaneously per round. 30s timeout per round.

**PvP deaths are permanent** (permadeath applies). This makes PvP extremely high-stakes — think twice before dueling.

---

## 11. Combat Session Lifecycle

```
States: awaiting_input → resolving → awaiting_input → ... → victory|defeat|fled|timeout

Timeouts:
- Per-round: 30 seconds (auto-submit defensive+basic_attack)
- Total combat: 15 minutes (combat auto-ends, player is ejected with damage taken so far)
- Abandoned: If no input for 3 consecutive rounds, treated as flee attempt

Storage:
- Active combat sessions stored in memory (Map<combatId, CombatSession>)
- On server restart, active combats are resolved as flee (player takes accumulated damage)
- Completed combats logged to combat_log table
```

---

## 12. Data Model Changes

### 12.1 New: `combat_sessions` (in-memory, not persisted)

```typescript
interface CombatSession {
  id: string;
  agentId: number;                    // or agentIds for guild combat
  enemyState: EnemyState;
  playerState: PlayerCombatState;
  round: number;
  status: 'awaiting_input' | 'resolving' | 'victory' | 'defeat' | 'fled';
  roundHistory: RoundResolution[];
  createdAt: number;
  lastInputAt: number;
  timeoutCount: number;               // consecutive timeouts
}

interface PlayerCombatState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  element: ElementType;
  abilities: AbilityState[];
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
}

interface EnemyState {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  element: ElementType;
  archetype: 'brute' | 'guardian' | 'assassin' | 'caster' | 'boss';
  abilities: AbilityState[];
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
  bossPhase?: number;
}

interface AbilityState {
  id: string;
  name: string;
  staminaCost: number;
  cooldown: number;        // rounds remaining
  maxCooldown: number;
  multiplier: number;
  effect?: StatusEffectTemplate;
}

interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  stat?: string;           // which stat it modifies
  value: number;           // modifier value
  duration: number;        // rounds remaining
  damagePerTurn?: number;  // for poison/bleed
}

interface RoundResolution {
  round: number;
  playerStance: Stance;
  enemyStance: Stance;
  playerAction: CombatAction;
  enemyAction: CombatAction;
  stanceInteraction: string | null;
  playerDamageDealt: number;
  playerDamageTaken: number;
  events: string[];        // "critical hit", "blocked", "dodged", "poisoned", etc.
  narrative: string;
}

type Stance = 'aggressive' | 'balanced' | 'defensive' | 'evasive';

interface CombatAction {
  type: 'basic_attack' | 'ability' | 'consumable' | 'guard' | 'flee';
  abilityId?: string;
  itemCode?: string;
}
```

### 12.2 Schema Changes

```sql
-- Remove revive capability
-- agents table: remove last_rest_at default, add died_at and killed_by
ALTER TABLE agents ADD COLUMN died_at INTEGER;
ALTER TABLE agents ADD COLUMN killed_by TEXT;

-- Update rest cooldown constant in code
-- REST_COOLDOWN_MS = 5 * 60 * 1000  (300000)

-- Abilities table (new)
CREATE TABLE abilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  stamina_cost INTEGER NOT NULL,
  cooldown INTEGER NOT NULL,
  multiplier REAL DEFAULT 1.0,
  effect_type TEXT,          -- 'poison', 'stun', 'buff_atk', etc.
  effect_value REAL,
  effect_duration INTEGER,
  unlock_level INTEGER DEFAULT 1
);

-- Agent abilities (learned abilities)
CREATE TABLE agent_abilities (
  agent_id INTEGER REFERENCES agents(id),
  ability_id TEXT REFERENCES abilities(id),
  PRIMARY KEY (agent_id, ability_id)
);

-- Mob archetypes (add to zone mob definitions)
-- Add archetype field to mob data in zones.ts
```

---

## 13. Migration Plan

### Phase 1: Core Combat Engine
1. Implement `CombatSession` class with stance/action resolution
2. Implement damage formulas, dodge, block, crits
3. Implement enemy AI behavior trees
4. Implement stamina system and ability cooldowns
5. Unit tests for all combat math

### Phase 2: API Integration
1. New route: `POST /api/combat/:id/action`
2. New route: `GET /api/combat/:id`
3. Modify `handleAttack` to create a combat session instead of auto-resolving
4. Implement 30s timeout with auto-action
5. Combat session cleanup on server restart

### Phase 3: Permadeath & Rest
1. Remove `revive` action entirely
2. Update death handler: no gold cost, permanent death, broadcast
3. Update rest cooldown to 5 minutes
4. Update entry flow to handle re-entry after permadeath

### Phase 4: UI
1. Build combat screen component
2. Stance selection UI
3. Action selection UI (with stamina/cooldown indicators)
4. Round resolution animation
5. Permadeath screen
6. Combat log panel

### Phase 5: Guild & PvP
1. Adapt combat sessions for multi-player (guild boss fights)
2. Adapt for PvP (simultaneous input)
3. Threat/taunt system for guild tanks

---

## 14. Balance Levers

These constants should be tunable without code changes (config file or DB):

```typescript
const COMBAT_CONFIG = {
  // Timing
  ROUND_TIMEOUT_SECONDS: 30,
  MAX_COMBAT_MINUTES: 15,
  AUTO_FLEE_AFTER_TIMEOUTS: 3,

  // Stamina
  BASE_MAX_STAMINA: 10,
  STAMINA_PER_LEVEL: 0.2,        // +1 every 5 levels
  STAMINA_REGEN_PER_ROUND: 1,
  GUARD_BONUS_STAMINA: 2,

  // Stances
  AGGRESSIVE_ATK_MOD: 1.3,
  AGGRESSIVE_DEF_MOD: 0.7,
  AGGRESSIVE_CRIT_BONUS: 0.15,
  DEFENSIVE_ATK_MOD: 0.6,
  DEFENSIVE_DEF_MOD: 1.5,
  DEFENSIVE_BLOCK_CHANCE: 0.30,
  EVASIVE_ATK_MOD: 0.8,
  EVASIVE_DEF_MOD: 0.8,
  EVASIVE_BASE_DODGE: 0.25,
  EVASIVE_DODGE_PER_SPD: 0.03,
  EVASIVE_COUNTER_MULTIPLIER: 0.5,

  // Combat
  DAMAGE_VARIANCE: 0.10,
  CRIT_MULTIPLIER: 1.5,
  DEF_FACTOR: 0.5,              // defense reduces damage by def × this
  MAX_CRIT_CHANCE: 0.40,
  LUCK_CRIT_DIVISOR: 120,

  // Flee
  FLEE_BASE_CHANCE: 0.50,
  FLEE_SPD_FACTOR: 0.05,
  FLEE_MIN_CHANCE: 0.10,
  FLEE_MAX_CHANCE: 0.90,

  // Rest (outside combat)
  REST_COOLDOWN_MS: 300_000,     // 5 minutes
  REST_HEAL_PERCENT: 0.25,

  // Shield
  SHIELD_BLOCK_BONUS: 0.15,

  // Guard
  GUARD_DEF_BONUS: 0.50,
};
```

---

## 15. Cryptographic RNG — No Rigging

All combat randomness **must** use cryptographically secure random number generation. `Math.random()` is **banned** from combat code.

### Why

`Math.random()` uses a PRNG (pseudo-random number generator) seeded from a predictable source. A sophisticated attacker could:
- Predict future rolls by observing past outcomes
- Reverse-engineer the internal state
- Rig outcomes in their favor (especially important with real MONAD at stake)

### Implementation

Use Node.js `crypto.randomInt()` for all combat rolls:

```typescript
import { randomInt } from 'node:crypto';

/** Cryptographically secure random float in [0, 1) */
function secureRandom(): number {
  return randomInt(0, 2_147_483_647) / 2_147_483_647;
}

/** Cryptographically secure random int in [min, max] inclusive */
function secureRandomInt(min: number, max: number): number {
  return randomInt(min, max + 1);
}

/** Cryptographically secure percentage check */
function secureChance(probability: number): boolean {
  return secureRandom() < probability;
}
```

### Where Used

Every single randomized combat event must go through these functions:
- Damage variance (±10%)
- Critical hit rolls
- Dodge rolls
- Block rolls
- Flee success/failure
- Enemy stance selection
- Enemy action selection
- Loot drop rolls
- Status effect proc chances

### Audit Trail

Each combat round logs its random seed outputs (not the seed itself) to the `combat_log` for post-hoc fairness verification:

```typescript
interface RoundRngLog {
  round: number;
  rolls: { purpose: string; result: number }[];
  // e.g. [{ purpose: "crit_check", result: 0.37 }, { purpose: "damage_variance", result: -0.04 }]
}
```

Players can request their combat logs via `GET /api/combat/:id/log` to verify no anomalies.

---

## 16. Example Combat (Annotated)

**Scenario:** Level 5 champion (80 HP, 15 ATK, 10 DEF, 12 SPD, 8 LUCK, fire element) vs Bone Sentinel (45 HP, 12 ATK, 8 DEF, 9 SPD, shadow element, guardian archetype).

**Round 1:** Player picks Balanced + Basic Attack (safe opener).
- Player ATK: 15 × 1.0 × 1.0 (shadow vs fire = 1.0) = 15 - 4 = 11 damage. Sentinel at 34 HP.
- Sentinel picks Defensive + Guard. Takes reduced damage. DEF 8 × 1.5 = 12, so 15 - 6 = 9 damage actually. Sentinel at 36 HP.
- Player is faster (12 > 9), acts first.

**Round 2:** Player gambles the guardian archetype will turtle up. Picks Aggressive + Power Strike (guard break!).
- Player ATK: 15 × 1.3 × 1.8 = 35.1, guard break ignores 50% of DEF bonus. Effective DEF = 8 × 1.25 = 10, so 35.1 - 5 = 30 damage. Sentinel at 6 HP.
- Sentinel retaliates: 12 × 0.6 = 7.2 ATK (defensive), player DEF 10 × 0.7 = 7 (aggressive). 7.2 - 3.5 = 4 damage. Player at 76 HP.

**Round 3:** Player finishes with Balanced + Basic Attack. 15 - 4 = 11 damage → Sentinel dead.

**Result:** Victory in 3 rounds. Stamina used: 3 (Power Strike). Player took 4 damage total. Smart play.

---

*This document is the implementation spec for the combat rework. All formulas, API shapes, and UI flows are final pending playtesting adjustments to the balance constants in §14.*
