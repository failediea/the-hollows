export interface Mob {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  xp_reward: number;
  gold_reward: number;
  element?: 'fire' | 'ice' | 'shadow' | 'holy';
  archetype?: 'brute' | 'guardian' | 'assassin' | 'caster' | 'boss';
  location?: string;
  description?: string;
  drop_table: { item: string; chance: number }[];
}

export interface Resource {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  gather_time_seconds: number;
}

export interface ZoneConfig {
  id: string;
  name: string;
  emoji: string;
  dangerLevel: number;
  description: string;
  lore: string;
  isPvP: boolean;
  requiresGuildSize: number;
  mobs: Mob[];
  resources: Resource[];
  connectedZones: string[];
  riddleRequired?: { from: string; to: string }; // Riddle needed to enter
  maxLevel?: number; // XP cap - no XP earned at or above this level
}

export const ZONES: Record<string, ZoneConfig> = {
  the_gate: {
    id: 'the_gate',
    name: 'The Gate',
    emoji: '🕯️',
    dangerLevel: 1,
    maxLevel: 10,
    description: 'A smoky waystation where desperate fortune-seekers prepare to descend.',
    lore: 'Last outpost of the surface world. Below the waystation, drain tunnels give way to caverns and crumbling storehouses. Deeper still, a toxic junction marks the boundary between the living camp and the dead places — the kennel passage, the defiled crypt, a forgotten shrine. At the very bottom, the Sealed Threshold bars passage to the Tomb Halls. Every soul here knows that once they descend, The Hollows may never let them leave.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'sewer_rat',
        name: 'Sewer Rat',
        hp: 20,
        atk: 4,
        def: 1,
        spd: 3,
        archetype: 'brute',
        location: 'The Drain Tunnels',
        description: 'Filthy tunnels beneath the waystation, choked with refuse and skittering vermin.',
        xp_reward: 6,
        gold_reward: 2,
        drop_table: [
          { item: 'rat_pelt', chance: 0.3 }
        ]
      },
      {
        id: 'cave_bat',
        name: 'Cave Bat',
        hp: 35,
        atk: 6,
        def: 2,
        spd: 5,
        archetype: 'assassin',
        location: 'The Upper Cavern',
        description: 'A vaulted natural cave where bat colonies roost among crumbling stalactites.',
        xp_reward: 7,
        gold_reward: 3,
        drop_table: [
          { item: 'bat_wing', chance: 0.25 }
        ]
      },
      {
        id: 'giant_rat',
        name: 'Giant Rat',
        hp: 50,
        atk: 9,
        def: 3,
        spd: 4,
        archetype: 'brute',
        location: 'The Ruined Storehouse',
        description: 'An old supply depot overrun by oversized rats gorging on rotting provisions.',
        xp_reward: 8,
        gold_reward: 5,
        drop_table: [
          { item: 'rat_pelt', chance: 0.35 },
          { item: 'bone_dust', chance: 0.15 }
        ]
      },
      {
        id: 'plague_rat',
        name: 'Plague Rat',
        hp: 70,
        atk: 12,
        def: 5,
        spd: 4,
        archetype: 'brute',
        location: 'The Toxic Junction',
        description: 'A reeking crossroads where poisoned runoff pools in green-black puddles.',
        xp_reward: 10,
        gold_reward: 7,
        drop_table: [
          { item: 'rat_pelt', chance: 0.3 },
          { item: 'venom_sac', chance: 0.1 }
        ]
      },
      {
        id: 'corrupted_hound',
        name: 'Corrupted Hound',
        hp: 85,
        atk: 14,
        def: 6,
        spd: 6,
        archetype: 'assassin',
        location: 'The Kennel Passage',
        description: 'Once a guard post for trained hounds — now their twisted descendants stalk the corridor.',
        xp_reward: 11,
        gold_reward: 9,
        drop_table: [
          { item: 'bone_dust', chance: 0.2 },
          { item: 'rat_pelt', chance: 0.2 }
        ]
      },
      {
        id: 'rabid_ghoul',
        name: 'Rabid Ghoul',
        hp: 100,
        atk: 16,
        def: 7,
        spd: 5,
        archetype: 'brute',
        location: 'The Defiled Crypt',
        description: 'A desecrated burial niche where the restless dead claw at their own graves.',
        xp_reward: 12,
        gold_reward: 11,
        drop_table: [
          { item: 'bone_dust', chance: 0.25 },
          { item: 'venom_sac', chance: 0.15 }
        ]
      },
      {
        id: 'wandering_ghost',
        name: 'Wandering Ghost',
        hp: 115,
        atk: 18,
        def: 8,
        spd: 6,
        archetype: 'caster',
        location: 'The Forgotten Shrine',
        description: 'A collapsed chapel where faded prayers still hang in the air like cobwebs.',
        xp_reward: 14,
        gold_reward: 13,
        drop_table: [
          { item: 'soul_shard', chance: 0.1 },
          { item: 'bone_dust', chance: 0.2 }
        ]
      },
      {
        id: 'tomb_shade',
        name: 'Tomb Shade',
        hp: 145,
        atk: 21,
        def: 10,
        spd: 7,
        element: 'shadow',
        archetype: 'caster',
        location: 'The Sealed Threshold',
        description: 'The final passage before the Tomb Halls, sealed by shadow and guarded by ancient malice.',
        xp_reward: 15,
        gold_reward: 15,
        drop_table: [
          { item: 'soul_shard', chance: 0.15 },
          { item: 'bone_dust', chance: 0.25 },
          { item: 'health_potion', chance: 0.1 }
        ]
      }
    ],
    resources: [
      { id: 'torchwood', name: 'Torchwood', rarity: 'common', gather_time_seconds: 600 },
      { id: 'iron_scraps', name: 'Iron Scraps', rarity: 'common', gather_time_seconds: 600 },
      { id: 'herbs', name: 'Herbs', rarity: 'common', gather_time_seconds: 600 }
    ],
    connectedZones: ['tomb_halls']
  },

  tomb_halls: {
    id: 'tomb_halls',
    name: 'Tomb Halls',
    emoji: '⚰️',
    dangerLevel: 2,
    maxLevel: 20,
    description: 'Frost-rimed crypts haunted by jealous spirits and faded glory.',
    lore: 'Burial chambers of the first Deepkings. Their spirits still wander, jealously guarding the treasures they hoarded in life. The air is cold enough to see your breath. Faded murals on the walls depict the glory of the Deepkings\' Domain before the Ashborn\'s awakening shattered everything they built.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'bone_rattler',
        name: 'Bone Rattler',
        hp: 130,
        atk: 20,
        def: 10,
        spd: 5,
        element: 'shadow',
        archetype: 'brute',
        xp_reward: 10,
        gold_reward: 8,
        drop_table: [
          { item: 'bone_dust', chance: 0.4 },
          { item: 'ancient_coins', chance: 0.15 }
        ]
      },
      {
        id: 'skeleton',
        name: 'Skeleton Warrior',
        hp: 170,
        atk: 24,
        def: 12,
        spd: 6,
        archetype: 'guardian',
        xp_reward: 12,
        gold_reward: 10,
        element: 'shadow',
        drop_table: [
          { item: 'bone_dust', chance: 0.4 },
          { item: 'ancient_coins', chance: 0.2 },
          { item: 'rusty_sword', chance: 0.1 }
        ]
      },
      {
        id: 'wight',
        name: 'Wight',
        hp: 210,
        atk: 28,
        def: 14,
        spd: 7,
        archetype: 'guardian',
        xp_reward: 14,
        gold_reward: 13,
        element: 'shadow',
        drop_table: [
          { item: 'grave_iron', chance: 0.3 },
          { item: 'soul_shard', chance: 0.15 },
          { item: 'wight_shroud', chance: 0.08 }
        ]
      },
      {
        id: 'bone_archer',
        name: 'Bone Archer',
        hp: 260,
        atk: 32,
        def: 16,
        spd: 8,
        archetype: 'assassin',
        xp_reward: 17,
        gold_reward: 16,
        element: 'shadow',
        drop_table: [
          { item: 'bone_dust', chance: 0.4 },
          { item: 'ancient_coins', chance: 0.25 }
        ]
      },
      {
        id: 'tomb_guardian',
        name: 'Tomb Guardian',
        hp: 290,
        atk: 35,
        def: 18,
        spd: 6,
        archetype: 'guardian',
        xp_reward: 19,
        gold_reward: 18,
        element: 'shadow',
        drop_table: [
          { item: 'ancient_coins', chance: 0.5 },
          { item: 'grave_iron', chance: 0.4 },
          { item: 'cursed_helm', chance: 0.05 }
        ]
      },
      {
        id: 'cursed_knight',
        name: 'Cursed Knight',
        hp: 310,
        atk: 37,
        def: 19,
        spd: 7,
        archetype: 'guardian',
        xp_reward: 22,
        gold_reward: 20,
        element: 'shadow',
        drop_table: [
          { item: 'grave_iron', chance: 0.4 },
          { item: 'cursed_steel', chance: 0.2 },
          { item: 'soul_shard', chance: 0.15 }
        ]
      },
      {
        id: 'death_acolyte',
        name: 'Death Acolyte',
        hp: 380,
        atk: 42,
        def: 22,
        spd: 7,
        element: 'shadow',
        archetype: 'caster',
        xp_reward: 25,
        gold_reward: 25,
        drop_table: [
          { item: 'soul_shard', chance: 0.25 },
          { item: 'dark_essence', chance: 0.1 },
          { item: 'bone_dust', chance: 0.3 }
        ]
      },
      {
        id: 'crypt_lord',
        name: 'Crypt Lord',
        hp: 440,
        atk: 46,
        def: 24,
        spd: 8,
        element: 'shadow',
        archetype: 'boss',
        xp_reward: 28,
        gold_reward: 30,
        drop_table: [
          { item: 'soul_shard', chance: 0.3 },
          { item: 'dark_essence', chance: 0.15 },
          { item: 'cursed_helm', chance: 0.1 },
          { item: 'health_potion', chance: 0.15 }
        ]
      }
    ],
    resources: [
      { id: 'bone_dust', name: 'Bone Dust', rarity: 'common', gather_time_seconds: 600 },
      { id: 'ancient_coins', name: 'Ancient Coins', rarity: 'uncommon', gather_time_seconds: 600 },
      { id: 'grave_iron', name: 'Grave Iron', rarity: 'uncommon', gather_time_seconds: 600 }
    ],
    connectedZones: ['the_gate', 'the_mines']
  },

  the_mines: {
    id: 'the_mines',
    name: 'The Mines',
    emoji: '⛏️',
    dangerLevel: 2,
    maxLevel: 30,
    description: 'Collapsing tunnels where picks still jut from living, pulsing stone.',
    lore: 'Abandoned Starsilver mines where the first cracks appeared. Tools still embedded in walls. The rock itself seems to breathe, expanding and contracting with a slow, terrible rhythm. It was here that the Deepkings first pierced the seal that held the Ashborn, and the stone has never forgotten.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'gremlin_digger',
        name: 'Gremlin Digger',
        hp: 240,
        atk: 35,
        def: 16,
        spd: 6,
        archetype: 'brute',
        xp_reward: 14,
        gold_reward: 15,
        drop_table: [
          { item: 'starsilver_ore', chance: 0.25 },
          { item: 'iron_scraps', chance: 0.3 }
        ]
      },
      {
        id: 'deep_crawler',
        name: 'Deep Crawler',
        hp: 300,
        atk: 40,
        def: 18,
        spd: 7,
        archetype: 'assassin',
        xp_reward: 17,
        gold_reward: 18,
        drop_table: [
          { item: 'dark_iron', chance: 0.3 },
          { item: 'starsilver_ore', chance: 0.25 }
        ]
      },
      {
        id: 'gremlin',
        name: 'Gremlin Miner',
        hp: 370,
        atk: 45,
        def: 21,
        spd: 6,
        archetype: 'brute',
        xp_reward: 20,
        gold_reward: 22,
        drop_table: [
          { item: 'starsilver_ore', chance: 0.3 },
          { item: 'gems', chance: 0.15 },
          { item: 'rusty_pickaxe', chance: 0.2 }
        ]
      },
      {
        id: 'gem_golem',
        name: 'Gem Golem',
        hp: 450,
        atk: 50,
        def: 24,
        spd: 5,
        archetype: 'guardian',
        xp_reward: 24,
        gold_reward: 28,
        drop_table: [
          { item: 'gems', chance: 0.6 },
          { item: 'starsilver_ore', chance: 0.3 },
          { item: 'ring_of_the_deep', chance: 0.05 }
        ]
      },
      {
        id: 'gremlin_chief',
        name: 'Gremlin Chief',
        hp: 530,
        atk: 56,
        def: 27,
        spd: 7,
        archetype: 'brute',
        xp_reward: 27,
        gold_reward: 35,
        drop_table: [
          { item: 'dark_iron', chance: 0.4 },
          { item: 'gems', chance: 0.3 },
          { item: 'gremlin_crown', chance: 0.1 },
          { item: 'gremlin_shiv', chance: 0.12 }
        ]
      },
      {
        id: 'cave_troll',
        name: 'Cave Troll',
        hp: 620,
        atk: 62,
        def: 30,
        spd: 5,
        archetype: 'brute',
        xp_reward: 30,
        gold_reward: 42,
        drop_table: [
          { item: 'dark_iron', chance: 0.5 },
          { item: 'troll_hide', chance: 0.3 },
          { item: 'plan_troll_hide_armor', chance: 0.01 }
        ]
      },
      {
        id: 'tunnel_wyrm',
        name: 'Tunnel Wyrm',
        hp: 670,
        atk: 65,
        def: 31,
        spd: 6,
        archetype: 'assassin',
        xp_reward: 34,
        gold_reward: 46,
        drop_table: [
          { item: 'dark_iron', chance: 0.4 },
          { item: 'starsilver_ore', chance: 0.35 },
          { item: 'gems', chance: 0.2 }
        ]
      },
      {
        id: 'crystal_titan',
        name: 'Crystal Titan',
        hp: 720,
        atk: 68,
        def: 33,
        spd: 6,
        archetype: 'guardian',
        xp_reward: 38,
        gold_reward: 50,
        drop_table: [
          { item: 'gems', chance: 0.5 },
          { item: 'dark_iron', chance: 0.4 },
          { item: 'starsilver_ore', chance: 0.3 }
        ]
      }
    ],
    resources: [
      { id: 'starsilver_ore', name: 'Starsilver Ore', rarity: 'uncommon', gather_time_seconds: 600 },
      { id: 'dark_iron', name: 'Dark Iron', rarity: 'uncommon', gather_time_seconds: 600 },
      { id: 'gems', name: 'Precious Gems', rarity: 'rare', gather_time_seconds: 600 }
    ],
    connectedZones: ['tomb_halls', 'the_web']
  },

  the_web: {
    id: 'the_web',
    name: 'The Web',
    emoji: '🕸️',
    dangerLevel: 3,
    maxLevel: 40,
    description: 'Rope-thick webs choke every passage. Something intelligent watches from the dark.',
    lore: 'Silk-choked tunnels where the Broodmothers nest. Entire expeditions have vanished here, leaving only their weapons tangled in webs thick as rope. The Corruption twisted the cave spiders into something far worse — intelligent, patient, and endlessly hungry.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'venom_spitter',
        name: 'Venom Spitter',
        hp: 380,
        atk: 52,
        def: 26,
        spd: 8,
        archetype: 'assassin',
        xp_reward: 20,
        gold_reward: 25,
        drop_table: [
          { item: 'venom_sac', chance: 0.6 },
          { item: 'spider_silk', chance: 0.3 }
        ]
      },
      {
        id: 'silk_weaver',
        name: 'Silk Weaver',
        hp: 470,
        atk: 58,
        def: 30,
        spd: 7,
        archetype: 'guardian',
        xp_reward: 25,
        gold_reward: 30,
        drop_table: [
          { item: 'spider_silk', chance: 0.8 },
          { item: 'shadow_thread', chance: 0.2 }
        ]
      },
      {
        id: 'giant_spider',
        name: 'Giant Spider',
        hp: 570,
        atk: 65,
        def: 33,
        spd: 9,
        archetype: 'assassin',
        xp_reward: 30,
        gold_reward: 38,
        drop_table: [
          { item: 'spider_silk', chance: 0.5 },
          { item: 'venom_sac', chance: 0.3 },
          { item: 'spider_silk_cloak', chance: 0.1 },
          { item: 'plan_webspinner_staff', chance: 0.01 }
        ]
      },
      {
        id: 'web_stalker',
        name: 'Web Stalker',
        hp: 680,
        atk: 72,
        def: 37,
        spd: 10,
        element: 'shadow',
        archetype: 'assassin',
        xp_reward: 38,
        gold_reward: 46,
        drop_table: [
          { item: 'spider_silk', chance: 0.4 },
          { item: 'shadow_thread', chance: 0.15 }
        ]
      },
      {
        id: 'broodling',
        name: 'Broodling',
        hp: 800,
        atk: 80,
        def: 41,
        spd: 8,
        archetype: 'brute',
        xp_reward: 43,
        gold_reward: 55,
        drop_table: [
          { item: 'spider_silk', chance: 0.4 },
          { item: 'venom_sac', chance: 0.25 }
        ]
      },
      {
        id: 'broodmother',
        name: 'Broodmother',
        hp: 930,
        atk: 88,
        def: 45,
        spd: 8,
        element: 'ice',
        archetype: 'boss',
        xp_reward: 48,
        gold_reward: 65,
        drop_table: [
          { item: 'spider_silk', chance: 0.7 },
          { item: 'venom_sac', chance: 0.5 },
          { item: 'shadow_thread', chance: 0.2 },
          { item: 'webspinner_staff', chance: 0.15 }
        ]
      },
      {
        id: 'poison_weaver',
        name: 'Poison Weaver',
        hp: 1000,
        atk: 92,
        def: 47,
        spd: 9,
        element: 'ice',
        archetype: 'caster',
        xp_reward: 54,
        gold_reward: 72,
        drop_table: [
          { item: 'venom_sac', chance: 0.7 },
          { item: 'shadow_thread', chance: 0.3 },
          { item: 'spider_silk', chance: 0.4 }
        ]
      },
      {
        id: 'arachne_queen',
        name: 'Arachne Queen',
        hp: 1080,
        atk: 97,
        def: 50,
        spd: 9,
        element: 'ice',
        archetype: 'boss',
        xp_reward: 60,
        gold_reward: 80,
        drop_table: [
          { item: 'shadow_thread', chance: 0.4 },
          { item: 'spider_silk', chance: 0.6 },
          { item: 'venom_sac', chance: 0.4 },
          { item: 'webspinner_staff', chance: 0.1 }
        ]
      }
    ],
    resources: [
      { id: 'spider_silk', name: 'Spider Silk', rarity: 'uncommon', gather_time_seconds: 600 },
      { id: 'venom_sac', name: 'Venom Sac', rarity: 'uncommon', gather_time_seconds: 600 },
      { id: 'shadow_thread', name: 'Shadow Thread', rarity: 'rare', gather_time_seconds: 600 }
    ],
    connectedZones: ['the_mines', 'forge_of_ruin']
  },

  forge_of_ruin: {
    id: 'forge_of_ruin',
    name: 'Forge of Ruin',
    emoji: '🔥',
    dangerLevel: 3,
    maxLevel: 50,
    description: 'Undying forges crackle with cursed flame. Every weapon born here carries madness.',
    lore: 'The great foundry where Starsilver was once smelted. The forges still burn with cursed flame that cannot be extinguished. Weapons forged here carry tremendous power — and a whisper of madness. Orcs have claimed this sacred place, drawn by the warmth of the undying fires and the promise of dark steel.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'dark_smith',
        name: 'Dark Smith',
        hp: 500,
        atk: 66,
        def: 33,
        spd: 6,
        element: 'fire',
        archetype: 'brute',
        xp_reward: 28,
        gold_reward: 35,
        drop_table: [
          { item: 'cursed_steel', chance: 0.5 },
          { item: 'dark_iron', chance: 0.3 }
        ]
      },
      {
        id: 'molten_golem',
        name: 'Molten Golem',
        hp: 620,
        atk: 73,
        def: 37,
        spd: 5,
        element: 'fire',
        archetype: 'guardian',
        xp_reward: 34,
        gold_reward: 42,
        drop_table: [
          { item: 'cursed_steel', chance: 0.4 },
          { item: 'ember_core', chance: 0.3 }
        ]
      },
      {
        id: 'brute_smith',
        name: 'Brute Smith',
        hp: 750,
        atk: 80,
        def: 40,
        spd: 6,
        element: 'fire',
        archetype: 'brute',
        xp_reward: 42,
        gold_reward: 50,
        drop_table: [
          { item: 'cursed_steel', chance: 0.4 },
          { item: 'ember_core', chance: 0.2 },
          { item: 'iron_hammer', chance: 0.15 }
        ]
      },
      {
        id: 'fire_elemental',
        name: 'Fire Elemental',
        hp: 890,
        atk: 88,
        def: 44,
        spd: 8,
        element: 'fire',
        archetype: 'caster',
        xp_reward: 52,
        gold_reward: 60,
        drop_table: [
          { item: 'ember_core', chance: 0.5 },
          { item: 'flame_essence', chance: 0.25 }
        ]
      },
      {
        id: 'forge_guardian',
        name: 'Forge Guardian',
        hp: 1040,
        atk: 96,
        def: 48,
        spd: 7,
        element: 'fire',
        archetype: 'guardian',
        xp_reward: 58,
        gold_reward: 72,
        drop_table: [
          { item: 'cursed_steel', chance: 0.5 },
          { item: 'runic_fragments', chance: 0.2 },
          { item: 'ember_core', chance: 0.25 }
        ]
      },
      {
        id: 'brute_warlord',
        name: 'Brute Warlord',
        hp: 1200,
        atk: 104,
        def: 52,
        spd: 7,
        element: 'fire',
        archetype: 'brute',
        xp_reward: 64,
        gold_reward: 85,
        drop_table: [
          { item: 'cursed_steel', chance: 0.6 },
          { item: 'runic_fragments', chance: 0.3 },
          { item: 'warlord_axe', chance: 0.1 }
        ]
      },
      {
        id: 'flame_colossus',
        name: 'Flame Colossus',
        hp: 1290,
        atk: 108,
        def: 54,
        spd: 7,
        element: 'fire',
        archetype: 'boss',
        xp_reward: 72,
        gold_reward: 92,
        drop_table: [
          { item: 'ember_core', chance: 0.45 },
          { item: 'runic_fragments', chance: 0.25 },
          { item: 'flame_essence', chance: 0.15 }
        ]
      },
      {
        id: 'infernal_smith',
        name: 'Infernal Smith',
        hp: 1380,
        atk: 113,
        def: 56,
        spd: 8,
        element: 'fire',
        archetype: 'boss',
        xp_reward: 78,
        gold_reward: 100,
        drop_table: [
          { item: 'ember_core', chance: 0.4 },
          { item: 'runic_fragments', chance: 0.35 },
          { item: 'flame_essence', chance: 0.2 },
          { item: 'cursed_steel', chance: 0.5 }
        ]
      }
    ],
    resources: [
      { id: 'cursed_steel', name: 'Cursed Steel', rarity: 'rare', gather_time_seconds: 600 },
      { id: 'ember_core', name: 'Ember Core', rarity: 'rare', gather_time_seconds: 600 },
      { id: 'runic_fragments', name: 'Runic Fragments', rarity: 'rare', gather_time_seconds: 600 }
    ],
    connectedZones: ['the_web', 'bone_throne']
  },

  bone_throne: {
    id: 'bone_throne',
    name: 'The Bone Throne',
    emoji: '💀',
    dangerLevel: 4,
    maxLevel: 60,
    description: 'Reality warps around the throne. Linger too long and it whispers your name.',
    lore: 'The throne room of the last Deepking, now a cathedral of bone and shadow. The Corruption is strongest here, warping reality itself. Those who linger too long begin to hear the throne calling their name. The Necromancer who claimed this seat draws power from the Deepking\'s lingering rage.',
    isPvP: false,
    requiresGuildSize: 0,
    mobs: [
      {
        id: 'soul_reaver',
        name: 'Soul Reaver',
        hp: 650,
        atk: 85,
        def: 43,
        spd: 9,
        element: 'shadow',
        archetype: 'caster',
        xp_reward: 38,
        gold_reward: 50,
        drop_table: [
          { item: 'soul_shard', chance: 0.8 },
          { item: 'dark_essence', chance: 0.4 }
        ]
      },
      {
        id: 'wraith',
        name: 'Wraith',
        hp: 800,
        atk: 93,
        def: 47,
        spd: 10,
        element: 'shadow',
        archetype: 'caster',
        xp_reward: 46,
        gold_reward: 60,
        drop_table: [
          { item: 'soul_shard', chance: 0.5 },
          { item: 'dark_essence', chance: 0.3 }
        ]
      },
      {
        id: 'bone_dragon',
        name: 'Bone Dragon',
        hp: 960,
        atk: 102,
        def: 51,
        spd: 9,
        element: 'shadow',
        archetype: 'boss',
        xp_reward: 56,
        gold_reward: 72,
        drop_table: [
          { item: 'soul_shard', chance: 0.7 },
          { item: 'dark_essence', chance: 0.5 },
          { item: 'bone_dust', chance: 0.6 }
        ]
      },
      {
        id: 'death_knight',
        name: 'Death Knight',
        hp: 1140,
        atk: 112,
        def: 56,
        spd: 8,
        element: 'shadow',
        archetype: 'boss',
        xp_reward: 68,
        gold_reward: 85,
        drop_table: [
          { item: 'soul_shard', chance: 0.6 },
          { item: 'dark_essence', chance: 0.4 },
          { item: 'death_blade', chance: 0.15 },
          { item: 'bone_cleaver', chance: 0.12 },
          { item: 'plan_cursed_greatsword', chance: 0.01 }
        ]
      },
      {
        id: 'bone_colossus',
        name: 'Bone Colossus',
        hp: 1340,
        atk: 122,
        def: 61,
        spd: 7,
        element: 'shadow',
        archetype: 'guardian',
        xp_reward: 76,
        gold_reward: 100,
        drop_table: [
          { item: 'soul_shard', chance: 0.5 },
          { item: 'dark_essence', chance: 0.3 },
          { item: 'bone_dust', chance: 0.6 }
        ]
      },
      {
        id: 'necromancer',
        name: 'Necromancer',
        hp: 1560,
        atk: 133,
        def: 66,
        spd: 9,
        element: 'shadow',
        archetype: 'caster',
        xp_reward: 82,
        gold_reward: 120,
        drop_table: [
          { item: 'necrotic_tome', chance: 0.3 },
          { item: 'dark_essence', chance: 0.6 },
          { item: 'soul_shard', chance: 0.7 },
          { item: 'necromancer_grimoire', chance: 0.1 }
        ]
      },
      {
        id: 'shadow_archon',
        name: 'Shadow Archon',
        hp: 1680,
        atk: 139,
        def: 69,
        spd: 10,
        element: 'shadow',
        archetype: 'caster',
        xp_reward: 92,
        gold_reward: 135,
        drop_table: [
          { item: 'dark_essence', chance: 0.65 },
          { item: 'soul_shard', chance: 0.6 },
          { item: 'necrotic_tome', chance: 0.15 }
        ]
      },
      {
        id: 'lich_king',
        name: 'Lich King',
        hp: 1800,
        atk: 145,
        def: 72,
        spd: 10,
        element: 'shadow',
        archetype: 'boss',
        xp_reward: 100,
        gold_reward: 150,
        drop_table: [
          { item: 'dark_essence', chance: 0.7 },
          { item: 'soul_shard', chance: 0.8 },
          { item: 'necrotic_tome', chance: 0.2 },
          { item: 'necromancer_grimoire', chance: 0.08 }
        ]
      }
    ],
    resources: [
      { id: 'soul_shard', name: 'Soul Shard', rarity: 'rare', gather_time_seconds: 600 },
      { id: 'dark_essence', name: 'Dark Essence', rarity: 'rare', gather_time_seconds: 600 },
      { id: 'necrotic_tome', name: 'Necrotic Tome', rarity: 'legendary', gather_time_seconds: 600 }
    ],
    connectedZones: ['forge_of_ruin', 'abyss_bridge']
  },

  abyss_bridge: {
    id: 'abyss_bridge',
    name: 'The Abyss Bridge',
    emoji: '🌑',
    dangerLevel: 5,
    description: 'WORLD BOSS: Hellish orange light rises from below. Only the bravest dare cross.',
    lore: 'A narrow bridge spanning an endless chasm. The Ashborn dwells below, its fire illuminating the darkness in hellish orange. Only the bravest — or most foolish — dare cross. This primordial fire entity slumbered since the world\'s creation until the Deepkings\' greed awakened it. Its very presence corrupts the stone and warps the air with impossible heat.',
    isPvP: false,
    requiresGuildSize: 3,
    mobs: [
      {
        id: 'ashborn',
        name: 'The Ashborn',
        hp: 15000,
        atk: 85,
        def: 45,
        spd: 8,
        archetype: 'boss',
        xp_reward: 500,
        gold_reward: 1000,
        element: 'fire',
        drop_table: [
          { item: 'ashborn_heart', chance: 1.0 },
          { item: 'flame_crown', chance: 0.5 },
          { item: 'ashborn_fang', chance: 0.4 },
          { item: 'ashborn_scale_mail', chance: 0.3 },
          { item: 'crown_of_madness', chance: 0.2 },
          { item: 'ancient_power', chance: 0.3 },
          { item: 'plan_ashborn_scale_mail', chance: 0.01 }
        ]
      }
    ],
    resources: [
      { id: 'ashborn_heart', name: 'Ashborn Heart', rarity: 'legendary', gather_time_seconds: 600 },
      { id: 'flame_crown', name: 'Flame Crown', rarity: 'legendary', gather_time_seconds: 600 },
      { id: 'ancient_power', name: 'Ancient Power', rarity: 'legendary', gather_time_seconds: 600 }
    ],
    connectedZones: ['bone_throne']
  },

  black_pit: {
    id: 'black_pit',
    name: 'The Black Pit',
    emoji: '⚔️',
    dangerLevel: 0, // PvP zone, no environmental danger
    description: 'Corruption-soaked depths where agents turn on each other. PvP zone.',
    lore: 'The deepest point of The Hollows. Nobody knows what lies here. Those who return speak of impossible geometry and time moving wrong. PvP zone — trust no one. The Corruption has so thoroughly saturated this place that the laws of nature bend and break. Agents fight each other here, driven mad by whispers from the dark.',
    isPvP: true,
    requiresGuildSize: 0,
    mobs: [],
    resources: [
      { id: 'glory_tokens', name: 'Glory Tokens', rarity: 'legendary', gather_time_seconds: 0 }
    ],
    connectedZones: ['the_gate']
  }
};

// Helper to get mob by ID
export function getMobById(mobId: string): Mob | null {
  for (const zone of Object.values(ZONES)) {
    const mob = zone.mobs.find(m => m.id === mobId);
    if (mob) return mob;
  }
  return null;
}

// Helper to get random mob from zone
export function getRandomMob(zoneId: string): Mob | null {
  const zone = ZONES[zoneId];
  if (!zone || zone.mobs.length === 0) return null;
  return zone.mobs[Math.floor(Math.random() * zone.mobs.length)];
}
