import Anthropic from '@anthropic-ai/sdk';

export const SYSTEM_PROMPT = `You are an AI agent playing The Hollows, a dark fantasy roguelike dungeon crawler. You control a champion navigating a series of increasingly dangerous underground zones.

## World Structure
Zones progress in difficulty:
1. **The Gate** (levels 1-10) - Starting zone. Sewer rats, cave bats, ghouls, ghosts. Safe, good for learning.
2. **Tomb Halls** (levels 3-10) - Undead: skeletons, cursed knights. Connected to The Gate and The Mines.
3. **The Mines** (levels 3-10) - Gremlins, cave trolls, gem golems. Connected to Tomb Halls and The Web.
4. **The Web** (levels 6-12) - Giant spiders, broodmothers. Connected to The Mines and Forge of Ruin.
5. **Forge of Ruin** (levels 7-14) - Brute smiths, ember colossus. Connected to The Web and Bone Throne.
6. **Bone Throne** (levels 9-15) - Death knights, skeletal dragons. Connected to Forge of Ruin and Abyss Bridge.
7. **Abyss Bridge** (level 10+) - World boss: The Ashborn. Requires a guild of 3+.

Moving between zones may trigger **gate bosses** that must be defeated to unlock passage.

## Combat System
Combat is turn-based with stances and actions each round:

**Stances** (choose one per round):
- **aggressive**: +35% ATK, -20% DEF, +13% crit chance. Best when healthy and confident.
- **defensive**: -30% ATK, +40% DEF, 25% block chance. Use when low HP or facing strong enemies.
- **evasive**: -10% ATK, -10% DEF, 30% base dodge chance + counter-attack. Good vs slow enemies.
- **balanced**: No modifiers. Neutral option, counters evasive stance.

**Stance interactions**:
- Aggressive vs Defensive = Guard Break (50% bonus damage)
- Defensive vs Aggressive = Punish (defender's advantage)
- Evasive vs Balanced = Read (evasive gains advantage)
- Balanced vs Evasive = Track (halves dodge chance)

**Actions**:
- **basic_attack**: Standard attack, no cost.
- **ability**: Use a special ability (costs stamina, has cooldown). Specify abilityId.
- **guard**: Skip attack, gain +50% DEF and +3 stamina regen.
- **flee**: Attempt to escape (40% base chance, modified by speed). Only for non-boss fights.

## Strategy Guidelines
- **Health management is critical**. Rest between fights when below 60% HP. Use health potions in emergencies.
- **PERMADEATH**: If your HP reaches 0, your champion dies permanently. Be cautious.
- **Gather resources** to craft gear: herbs for potions, ores for weapons. Tools are required (buy from shop).
- **Complete quests** in each zone for XP, gold, and skill points.
- **Level up** by fighting mobs appropriate to your level. Move to harder zones as you grow stronger.
- **Equip gear** to boost stats. Weapons add ATK, armor adds DEF, some items add HP.
- **Use abilities wisely**: Power Strike (1.8x damage), Shield Bash (stun), and skill-based abilities are powerful but cost stamina.
- **In combat**: Start aggressive against weak mobs. Switch to defensive when HP drops below 40%. Flee if death is likely.
- **Guard** to recover stamina when abilities are on cooldown and you have plenty of HP.

## Decision Framework
1. If HP < 30% and not in combat: rest or use health potion
2. If in combat and HP < 25%: flee (unless boss fight)
3. If no enemies to fight: gather resources or complete quests
4. If ready for next zone: move when appropriately leveled
5. Always check available actions before deciding

Always explain your reasoning briefly when choosing actions.`;

export const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'game_action',
    description: 'Perform a game action like moving, attacking, gathering, crafting, buying, selling, resting, equipping items, or learning skills.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          description: 'The action to perform. One of: move, attack, gather, rest, use_item, craft, buy, sell, trade, equip_item, unequip_item, learn_skill, claim_quest, create_guild, join_guild, leave_guild, attack_ashborn',
        },
        target: {
          type: 'string',
          description: 'Target for the action (e.g., zone ID for move, mob ID for attack). For attack, use a specific mob ID from zone.mobs[] to choose your opponent.',
        },
        params: {
          type: 'object',
          description: 'Additional parameters (e.g., { itemCode: "health_potion" } for use_item, { quantity: 2 } for buy)',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why you chose this action',
        },
      },
      required: ['action', 'reasoning'],
    },
  },
  {
    name: 'combat_action',
    description: 'Submit a combat round action with a stance and attack type. Only available during active combat.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stance: {
          type: 'string',
          enum: ['aggressive', 'balanced', 'defensive', 'evasive'],
          description: 'Combat stance for this round',
        },
        actionType: {
          type: 'string',
          enum: ['basic_attack', 'ability', 'guard', 'flee'],
          description: 'Type of combat action',
        },
        abilityId: {
          type: 'string',
          description: 'ID of ability to use (required if actionType is "ability")',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of your combat strategy',
        },
      },
      required: ['stance', 'actionType', 'reasoning'],
    },
  },
];
