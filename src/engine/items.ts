import Database from 'better-sqlite3';
import { Item } from '../db/schema.js';

// ============ TIERED RECIPE SYSTEM ============
export interface Recipe {
  code: string;
  name: string;
  desc: string;
  mats: { [itemCode: string]: number };
  result: string;
  minLevel: number;
  requiredZone: string | null;
  requiresPlan: string | null;
  tier: 'basic' | 'apprentice' | 'journeyman' | 'master' | 'legendary';
}

export const RECIPES: Recipe[] = [
  // Basic (The Gate, Lv 1-3)
  { code: 'health_potion', name: 'Health Potion', desc: 'Restores 50 HP', mats: { herbs: 3 }, result: 'health_potion', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
  { code: 'nunchaku', name: 'Nunchaku', desc: 'Two sticks and a rope', mats: { torchwood: 2 }, result: 'nunchaku', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
  { code: 'bandage', name: 'Bandage', desc: 'Restores 25 HP', mats: { herbs: 2, torchwood: 1 }, result: 'bandage', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
  { code: 'greater_health_potion', name: 'Greater Health Potion', desc: 'Restores 100 HP', mats: { health_potion: 2, herbs: 1 }, result: 'greater_health_potion', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },

  // Apprentice (Tomb Halls/Mines, Lv 4-6)
  { code: 'bone_shield', name: 'Bone Shield', desc: 'Shield crafted from bone dust and iron', mats: { bone_dust: 5, iron_scraps: 3 }, result: 'bone_shield', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
  { code: 'grave_iron_sword', name: 'Grave Iron Sword', desc: 'Blade forged from grave iron', mats: { grave_iron: 3, iron_scraps: 5 }, result: 'grave_iron_sword', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
  { code: 'antidote', name: 'Antidote', desc: 'Cures poison and restores 20 HP', mats: { herbs: 3, bone_dust: 2 }, result: 'antidote', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
  { code: 'iron_plate', name: 'Iron Plate Armor', desc: 'Heavy but protective plate armor', mats: { iron_scraps: 8, dark_iron: 2 }, result: 'iron_plate', minLevel: 5, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
  { code: 'mining_pick', name: 'Mining Pick', desc: 'Sturdy pick for mining operations', mats: { iron_scraps: 5, torchwood: 3 }, result: 'mining_pick', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },

  // Journeyman (Web/Forge, Lv 7-10)
  { code: 'venom_blade', name: 'Venom Blade', desc: 'Poisoned blade dripping with venom', mats: { venom_sac: 3, iron_scraps: 5 }, result: 'venom_blade', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
  { code: 'spider_silk_cloak', name: 'Spider Silk Cloak', desc: 'Lightweight and poison-resistant cloak', mats: { spider_silk: 5, shadow_thread: 2 }, result: 'spider_silk_cloak', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
  { code: 'poison_trap', name: 'Poison Trap', desc: 'A deadly trap laced with venom', mats: { venom_sac: 2, spider_silk: 2 }, result: 'poison_trap', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
  { code: 'starsilver_sword', name: 'Starsilver Sword', desc: 'Blessed blade of pure starsilver', mats: { starsilver_ore: 5, dark_iron: 3 }, result: 'starsilver_sword', minLevel: 8, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
  { code: 'ember_shield', name: 'Ember Shield', desc: 'Shield infused with dark iron and gems', mats: { dark_iron: 5, gems: 2 }, result: 'ember_shield', minLevel: 8, requiredZone: null, requiresPlan: null, tier: 'journeyman' },

  // Master (Bone Throne, Lv 11-15)
  { code: 'death_blade', name: 'Death Blade', desc: 'Forged from pure death energy', mats: { cursed_steel: 5, soul_shard: 3, bone_dust: 5 }, result: 'death_blade', minLevel: 11, requiredZone: null, requiresPlan: null, tier: 'master' },
  { code: 'necromancer_grimoire', name: 'Necromancer Staff', desc: 'Staff of dark necromantic power', mats: { soul_shard: 5, shadow_thread: 3, ancient_coins: 10 }, result: 'necromancer_grimoire', minLevel: 12, requiredZone: null, requiresPlan: null, tier: 'master' },

  // Plan-Required (Legendary)
  { code: 'webspinner_staff', name: 'Webspinner Staff', desc: 'Staff wrapped in frozen silk', mats: { spider_silk: 8, shadow_thread: 5, venom_sac: 3 }, result: 'webspinner_staff', minLevel: 9, requiredZone: null, requiresPlan: 'plan_webspinner_staff', tier: 'legendary' },
  { code: 'cursed_greatsword', name: 'Cursed Greatsword', desc: 'Massive blade of cursed steel', mats: { cursed_steel: 8, soul_shard: 5, dark_iron: 5 }, result: 'cursed_greatsword', minLevel: 13, requiredZone: null, requiresPlan: 'plan_cursed_greatsword', tier: 'legendary' },
  { code: 'troll_hide_armor', name: 'Troll Hide Armor', desc: 'Thick armor from troll hide', mats: { iron_scraps: 10, herbs: 5, bone_dust: 5 }, result: 'troll_hide_armor', minLevel: 6, requiredZone: null, requiresPlan: 'plan_troll_hide_armor', tier: 'legendary' },
  { code: 'ashborn_scale_mail', name: 'Ashborn Scale Mail', desc: 'Impenetrable scales from the Ashborn', mats: { dark_iron: 10, gems: 5, soul_shard: 5 }, result: 'ashborn_scale_mail', minLevel: 15, requiredZone: null, requiresPlan: 'plan_ashborn_scale_mail', tier: 'legendary' },
];

// Item min level lookup (from recipes)
export const ITEM_MIN_LEVELS: Record<string, number> = {};
for (const r of RECIPES) {
  ITEM_MIN_LEVELS[r.result] = r.minLevel;
}

export const ITEMS: Omit<Item, 'id'>[] = [
  // Consumables
  {
    code: 'health_potion',
    name: 'Health Potion',
    category: 'consumable',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 50,
    corruption_per_action: 0,
    weight: 1,
    description: 'Restores 50 HP',
    craftable: true,
    craft_recipe: JSON.stringify({ herbs: 3 })
  },
  {
    code: 'greater_health_potion',
    name: 'Greater Health Potion',
    category: 'consumable',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 100,
    corruption_per_action: 0,
    weight: 1,
    description: 'Restores 100 HP',
    craftable: true,
    craft_recipe: JSON.stringify({ health_potion: 2, herbs: 1 })
  },
  {
    code: 'antidote',
    name: 'Antidote',
    category: 'consumable',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 20,
    corruption_per_action: 0,
    weight: 1,
    description: 'Cures poison and restores 20 HP',
    craftable: true,
    craft_recipe: JSON.stringify({ herbs: 3, bone_dust: 2 })
  },
  {
    code: 'nunchaku',
    name: 'Nunchaku',
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 1,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'Two sticks and a rope',
    craftable: true,
    craft_recipe: JSON.stringify({ torchwood: 2 })
  },
  {
    code: 'corruption_cleanse',
    name: 'Purification Elixir',
    category: 'consumable',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: -50,
    weight: 1,
    description: 'Reduces corruption by 50 points',
    craftable: true,
    craft_recipe: JSON.stringify(['soul_shard', 'herbs', 'ancient_coins'])
  },

  // Gathering Tools
  {
    code: 'woodcutters_axe',
    name: "Woodcutter's Axe",
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'A sturdy axe for chopping torchwood',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'pickaxe',
    name: 'Pickaxe',
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 4,
    description: 'A basic pickaxe for mining ore and gems',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'herbalist_sickle',
    name: "Herbalist's Sickle",
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'A curved blade for harvesting herbs and silk',
    craftable: false,
    craft_recipe: null
  },

  // Materials
  {
    code: 'torchwood',
    name: 'Torchwood',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Burns bright and long',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'iron_scraps',
    name: 'Iron Scraps',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'Rusty but usable metal',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'bone_dust',
    name: 'Bone Dust',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Ground from ancient bones',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'spider_silk',
    name: 'Spider Silk',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Incredibly strong thread',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'venom_sac',
    name: 'Venom Sac',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Deadly poison gland',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'soul_shard',
    name: 'Soul Shard',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Fragment of a trapped soul',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'dark_essence',
    name: 'Dark Essence',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Pure shadow energy',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'cursed_steel',
    name: 'Cursed Steel',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'Forged in unholy fire',
    craftable: false,
    craft_recipe: null
  },

  // Weapons
  {
    code: 'rusty_sword',
    name: 'Rusty Sword',
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 3,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 5,
    description: 'Better than bare fists',
    craftable: true,
    craft_recipe: JSON.stringify(['iron_scraps', 'iron_scraps'])
  },
  {
    code: 'iron_sword',
    name: 'Iron Sword',
    category: 'weapon',
    rarity: 'uncommon',
    atk_bonus: 8,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 7,
    description: 'Reliable and sharp',
    craftable: true,
    craft_recipe: JSON.stringify(['grave_iron', 'grave_iron', 'iron_scraps'])
  },
  {
    code: 'shadow_blade',
    name: 'Shadow Blade',
    category: 'weapon',
    rarity: 'cursed',
    atk_bonus: 15,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 5,
    weight: 6,
    description: 'Whispers promises of power. +15 ATK but +5 corruption per action.',
    craftable: true,
    craft_recipe: JSON.stringify(['dark_essence', 'cursed_steel', 'soul_shard'])
  },
  {
    code: 'death_blade',
    name: 'Death Blade',
    category: 'weapon',
    rarity: 'legendary',
    atk_bonus: 20,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 3,
    weight: 8,
    description: 'Forged from pure death energy',
    craftable: true,
    craft_recipe: JSON.stringify({ cursed_steel: 5, soul_shard: 3, bone_dust: 5 })
  },
  {
    code: 'ashborn_heart_hammer',
    name: 'Ashborn Heart Hammer',
    category: 'weapon',
    rarity: 'legendary',
    atk_bonus: 25,
    def_bonus: 5,
    hp_bonus: 50,
    corruption_per_action: 0,
    weight: 15,
    description: 'Crafted from the heart of the Ashborn itself',
    craftable: true,
    craft_recipe: JSON.stringify(['ashborn_heart', 'cursed_steel', 'cursed_steel', 'runic_fragments'])
  },

  // Armor
  {
    code: 'leather_armor',
    name: 'Leather Armor',
    category: 'armor',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 3,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 8,
    description: 'Basic protection',
    craftable: true,
    craft_recipe: JSON.stringify(['rat_pelt', 'rat_pelt', 'rat_pelt'])
  },
  {
    code: 'iron_plate',
    name: 'Iron Plate Armor',
    category: 'armor',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 8,
    hp_bonus: 20,
    corruption_per_action: 0,
    weight: 20,
    description: 'Heavy but protective',
    craftable: true,
    craft_recipe: JSON.stringify({ iron_scraps: 8, dark_iron: 2 })
  },
  {
    code: 'cursed_helm',
    name: 'Cursed Helm',
    category: 'armor',
    rarity: 'cursed',
    atk_bonus: 5,
    def_bonus: 10,
    hp_bonus: 0,
    corruption_per_action: 3,
    weight: 10,
    description: 'Grants power at a price. +5 ATK, +10 DEF, +3 corruption per action.',
    craftable: false,
    craft_recipe: null
  },

  // Artifacts
  {
    code: 'ring_of_luck',
    name: 'Ring of Luck',
    category: 'accessory',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Increases critical hit chance',
    craftable: true,
    craft_recipe: JSON.stringify(['gems', 'gems', 'ancient_coins'])
  },
  {
    code: 'amulet_of_shadows',
    name: 'Amulet of Shadows',
    category: 'accessory',
    rarity: 'cursed',
    atk_bonus: 10,
    def_bonus: 5,
    hp_bonus: 0,
    corruption_per_action: 7,
    weight: 2,
    description: 'Immense power, terrible cost. +10 ATK, +5 DEF, +7 corruption per action.',
    craftable: true,
    craft_recipe: JSON.stringify(['dark_essence', 'dark_essence', 'shadow_thread', 'soul_shard'])
  },
  {
    code: 'flame_crown',
    name: 'Flame Crown',
    category: 'accessory',
    rarity: 'legendary',
    atk_bonus: 15,
    def_bonus: 10,
    hp_bonus: 100,
    corruption_per_action: 0,
    weight: 5,
    description: 'Crown of the defeated Ashborn',
    craftable: false,
    craft_recipe: null
  },

  // NEW WEAPONS
  {
    code: 'bone_cleaver',
    name: 'Bone Cleaver',
    category: 'weapon',
    rarity: 'rare',
    atk_bonus: 18,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 9,
    description: 'Jagged blade forged from cursed bones. Shadow element.',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'webspinner_staff',
    name: 'Webspinner Staff',
    category: 'weapon',
    rarity: 'rare',
    atk_bonus: 14,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 6,
    description: 'Staff wrapped in frozen silk. Ice element.',
    craftable: true,
    craft_recipe: JSON.stringify({ spider_silk: 8, shadow_thread: 5, venom_sac: 3 })
  },
  {
    code: 'gremlin_shiv',
    name: 'Gremlin Shiv',
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 8,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'Fast and nimble blade. +8 ATK, +3 SPD',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ashborn_fang',
    name: "Ashborn's Fang",
    category: 'weapon',
    rarity: 'legendary',
    atk_bonus: 30,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 12,
    description: 'Tooth of the demon lord. Fire element.',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'starsilver_sword',
    name: 'Starsilver Sword',
    category: 'weapon',
    rarity: 'rare',
    atk_bonus: 22,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 5,
    description: 'Blessed blade of pure starsilver. Holy element.',
    craftable: true,
    craft_recipe: JSON.stringify({ starsilver_ore: 5, dark_iron: 3 })
  },

  // NEW ARMOR
  {
    code: 'spider_silk_cloak',
    name: 'Spider Silk Cloak',
    category: 'armor',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 8,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 4,
    description: 'Lightweight and poison-resistant. +8 DEF, +5 SPD',
    craftable: true,
    craft_recipe: JSON.stringify({ spider_silk: 5, shadow_thread: 2 })
  },
  {
    code: 'runic_plate',
    name: 'Runic Plate',
    category: 'armor',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 15,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 25,
    description: 'Ancient armor inscribed with protective runes. Holy element resist.',
    craftable: true,
    craft_recipe: JSON.stringify(['runic_fragments', 'runic_fragments', 'runic_fragments', 'dark_iron', 'dark_iron'])
  },
  {
    code: 'wight_shroud',
    name: 'Wight Shroud',
    category: 'armor',
    rarity: 'cursed',
    atk_bonus: 0,
    def_bonus: 12,
    hp_bonus: 0,
    corruption_per_action: 10,
    weight: 8,
    description: 'Spectral armor of the undead. +12 DEF but +10 corruption per action.',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ashborn_scale_mail',
    name: 'Ashborn Scale Mail',
    category: 'armor',
    rarity: 'legendary',
    atk_bonus: 0,
    def_bonus: 25,
    hp_bonus: 50,
    corruption_per_action: 0,
    weight: 30,
    description: 'Impenetrable scales from the Ashborn. Fire immunity.',
    craftable: true,
    craft_recipe: JSON.stringify({ dark_iron: 10, gems: 5, soul_shard: 5 })
  },

  // NEW CONSUMABLES
  {
    code: 'greater_health_potion_2',
    name: 'Greater Health Potion',
    category: 'consumable',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 150,
    corruption_per_action: 0,
    weight: 1,
    description: 'Restores 75% of max HP',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'corruption_purge',
    name: 'Corruption Purge',
    category: 'consumable',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: -999,
    weight: 1,
    description: 'Removes all corruption',
    craftable: true,
    craft_recipe: JSON.stringify(['soul_shard', 'ancient_coins', 'ancient_coins'])
  },
  {
    code: 'speed_elixir',
    name: 'Speed Elixir',
    category: 'consumable',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: '+5 SPD for 3 combats',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'shadow_cloak_item',
    name: 'Shadow Cloak',
    category: 'consumable',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Become invisible for 1 zone transition - skip mobs',
    craftable: true,
    craft_recipe: JSON.stringify(['shadow_thread', 'shadow_thread', 'spider_silk', 'spider_silk', 'spider_silk'])
  },

  // NEW ARTIFACTS
  {
    code: 'ring_of_the_deep',
    name: 'Ring of the Deep',
    category: 'accessory',
    rarity: 'rare',
    atk_bonus: 3,
    def_bonus: 3,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Ancient ring from the mines. +3 all stats.',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'necromancer_grimoire',
    name: "Necromancer's Grimoire",
    category: 'weapon',
    rarity: 'cursed',
    atk_bonus: 10,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 20,
    weight: 3,
    description: 'Book of dark magic. +10 ATK but +20 corruption.',
    craftable: true,
    craft_recipe: JSON.stringify({ soul_shard: 5, shadow_thread: 3, ancient_coins: 10 })
  },
  {
    code: 'crown_of_madness',
    name: 'Crown of Madness',
    category: 'accessory',
    rarity: 'legendary',
    atk_bonus: 8,
    def_bonus: 8,
    hp_bonus: 0,
    corruption_per_action: 15,
    weight: 6,
    description: 'Legendary artifact of power and insanity. +8 all stats, +15 corruption per action.',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'herbs',
    name: 'Medicinal Herbs',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Used in various healing recipes',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'rat_pelt',
    name: 'Rat Pelt',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Smelly but useful for crafting',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'bat_wing',
    name: 'Bat Wing',
    category: 'material',
    rarity: 'common',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Leathery wing membrane',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ancient_coins',
    name: 'Ancient Coins',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Currency from a lost age',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'grave_iron',
    name: 'Grave Iron',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'Iron forged in death',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'rusty_pickaxe',
    name: 'Rusty Pickaxe',
    category: 'weapon',
    rarity: 'common',
    atk_bonus: 3,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 5,
    description: 'Old mining tool',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'troll_hide',
    name: 'Troll Hide',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 4,
    description: 'Thick and durable',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'gremlin_crown',
    name: 'Gremlin Crown',
    category: 'accessory',
    rarity: 'rare',
    atk_bonus: 2,
    def_bonus: 2,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'Stolen treasure of the gremlin chief',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'iron_hammer',
    name: 'Iron Hammer',
    category: 'weapon',
    rarity: 'uncommon',
    atk_bonus: 10,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 8,
    description: 'Heavy and brutal',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'warlord_axe',
    name: 'Warlord Axe',
    category: 'weapon',
    rarity: 'rare',
    atk_bonus: 16,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 12,
    description: 'Massive two-handed axe',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'flame_essence',
    name: 'Flame Essence',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Burning magical essence',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'necrotic_tome',
    name: 'Necrotic Tome',
    category: 'material',
    rarity: 'legendary',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'Book of forbidden necromancy',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ashborn_heart',
    name: 'Ashborn Heart',
    category: 'accessory',
    rarity: 'legendary',
    atk_bonus: 15,
    def_bonus: 15,
    hp_bonus: 100,
    corruption_per_action: 0,
    weight: 10,
    description: 'Still burning with demonic fire',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ancient_power',
    name: 'Ancient Power',
    category: 'accessory',
    rarity: 'legendary',
    atk_bonus: 8,
    def_bonus: 8,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Crystallized primordial energy',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'starsilver_ore',
    name: 'Starsilver Ore',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'Precious silver ore',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'dark_iron',
    name: 'Dark Iron',
    category: 'material',
    rarity: 'uncommon',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 3,
    description: 'Heavy black iron',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'gems',
    name: 'Precious Gems',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Sparkling valuable gems',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'runic_fragments',
    name: 'Runic Fragments',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Ancient rune-inscribed stones',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'ember_core',
    name: 'Ember Core',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 2,
    description: 'Burning elemental core',
    craftable: false,
    craft_recipe: null
  },
  {
    code: 'shadow_thread',
    name: 'Shadow Thread',
    category: 'material',
    rarity: 'rare',
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    corruption_per_action: 0,
    weight: 1,
    description: 'Thread woven from darkness itself',
    craftable: false,
    craft_recipe: null
  },

  // New crafted items
  {
    code: 'bandage',
    name: 'Bandage',
    category: 'consumable',
    rarity: 'common',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 25, corruption_per_action: 0, weight: 1,
    description: 'Restores 25 HP',
    craftable: true, craft_recipe: JSON.stringify({ herbs: 2, torchwood: 1 })
  },
  {
    code: 'bone_shield',
    name: 'Bone Shield',
    category: 'shield',
    rarity: 'uncommon',
    atk_bonus: 0, def_bonus: 6, hp_bonus: 10, corruption_per_action: 0, weight: 12,
    description: 'Shield crafted from bone dust and iron',
    craftable: true, craft_recipe: JSON.stringify({ bone_dust: 5, iron_scraps: 3 })
  },
  {
    code: 'grave_iron_sword',
    name: 'Grave Iron Sword',
    category: 'weapon',
    rarity: 'uncommon',
    atk_bonus: 10, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 7,
    description: 'Blade forged from grave iron',
    craftable: true, craft_recipe: JSON.stringify({ grave_iron: 3, iron_scraps: 5 })
  },
  {
    code: 'mining_pick',
    name: 'Mining Pick',
    category: 'weapon',
    rarity: 'uncommon',
    atk_bonus: 6, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 6,
    description: 'Sturdy pick for mining operations',
    craftable: true, craft_recipe: JSON.stringify({ iron_scraps: 5, torchwood: 3 })
  },
  {
    code: 'venom_blade',
    name: 'Venom Blade',
    category: 'weapon',
    rarity: 'rare',
    atk_bonus: 14, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 6,
    description: 'Poisoned blade dripping with venom',
    craftable: true, craft_recipe: JSON.stringify({ venom_sac: 3, iron_scraps: 5 })
  },
  {
    code: 'poison_trap',
    name: 'Poison Trap',
    category: 'consumable',
    rarity: 'uncommon',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 2,
    description: 'A deadly trap laced with venom',
    craftable: true, craft_recipe: JSON.stringify({ venom_sac: 2, spider_silk: 2 })
  },
  {
    code: 'ember_shield',
    name: 'Ember Shield',
    category: 'shield',
    rarity: 'rare',
    atk_bonus: 0, def_bonus: 12, hp_bonus: 20, corruption_per_action: 0, weight: 15,
    description: 'Shield infused with dark iron and gems',
    craftable: true, craft_recipe: JSON.stringify({ dark_iron: 5, gems: 2 })
  },
  {
    code: 'cursed_greatsword',
    name: 'Cursed Greatsword',
    category: 'weapon',
    rarity: 'legendary',
    atk_bonus: 24, def_bonus: 0, hp_bonus: 0, corruption_per_action: 5, weight: 14,
    description: 'Massive blade of cursed steel',
    craftable: true, craft_recipe: JSON.stringify({ cursed_steel: 8, soul_shard: 5, dark_iron: 5 })
  },
  {
    code: 'troll_hide_armor',
    name: 'Troll Hide Armor',
    category: 'armor',
    rarity: 'rare',
    atk_bonus: 0, def_bonus: 10, hp_bonus: 30, corruption_per_action: 0, weight: 18,
    description: 'Thick armor from troll hide',
    craftable: true, craft_recipe: JSON.stringify({ iron_scraps: 10, herbs: 5, bone_dust: 5 })
  },

  // Crafting Plans
  {
    code: 'plan_webspinner_staff',
    name: 'Plan: Webspinner Staff',
    category: 'material',
    rarity: 'legendary',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 1,
    description: 'Crafting plan for the Webspinner Staff. Drops from Giant Spider.',
    craftable: false, craft_recipe: null
  },
  {
    code: 'plan_cursed_greatsword',
    name: 'Plan: Cursed Greatsword',
    category: 'material',
    rarity: 'legendary',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 1,
    description: 'Crafting plan for the Cursed Greatsword. Drops from Death Knight.',
    craftable: false, craft_recipe: null
  },
  {
    code: 'plan_troll_hide_armor',
    name: 'Plan: Troll Hide Armor',
    category: 'material',
    rarity: 'legendary',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 1,
    description: 'Crafting plan for the Troll Hide Armor. Drops from Cave Troll.',
    craftable: false, craft_recipe: null
  },
  {
    code: 'plan_ashborn_scale_mail',
    name: 'Plan: Ashborn Scale Mail',
    category: 'material',
    rarity: 'legendary',
    atk_bonus: 0, def_bonus: 0, hp_bonus: 0, corruption_per_action: 0, weight: 1,
    description: 'Crafting plan for the Ashborn Scale Mail. Drops from The Ashborn.',
    craftable: false, craft_recipe: null
  },
];

export function initializeItems(db: Database.Database): void {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO items (
      code, name, category, rarity, atk_bonus, def_bonus, hp_bonus,
      corruption_per_action, weight, description, craftable, craft_recipe
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE items SET category = ?, atk_bonus = ?, def_bonus = ?, hp_bonus = ?,
      corruption_per_action = ?, rarity = ?, name = ?, description = ?
    WHERE code = ?
  `);

  for (const item of ITEMS) {
    insertStmt.run(
      item.code,
      item.name,
      item.category,
      item.rarity,
      item.atk_bonus,
      item.def_bonus,
      item.hp_bonus,
      item.corruption_per_action,
      item.weight,
      item.description,
      item.craftable ? 1 : 0,
      item.craft_recipe
    );
    // Also update existing rows to sync category/stats
    updateStmt.run(
      item.category,
      item.atk_bonus,
      item.def_bonus,
      item.hp_bonus,
      item.corruption_per_action,
      item.rarity,
      item.name,
      item.description,
      item.code
    );
  }
}

export function craftItem(db: Database.Database, agentId: number, itemCode: string): {
  success: boolean;
  message: string;
  item?: Item;
} {
  // Find recipe in the new tiered system
  const recipe = RECIPES.find(r => r.code === itemCode || r.result === itemCode);
  
  if (!recipe) {
    // Fall back to legacy craft_recipe on item
    const item = db.prepare('SELECT * FROM items WHERE code = ? AND craftable = 1').get(itemCode) as Item | undefined;
    if (!item || !item.craft_recipe) {
      return { success: false, message: 'Item not found or not craftable' };
    }
    // Legacy path for items not in the new recipe system
    return craftItemLegacy(db, agentId, item);
  }

  // Get agent for level check
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
  if (!agent || agent.is_dead) {
    return { success: false, message: 'Agent is dead' };
  }

  // Check level requirement
  if (agent.level < recipe.minLevel) {
    return { success: false, message: `You must be level ${recipe.minLevel} to craft ${recipe.name}. Current level: ${agent.level}` };
  }

  // Check plan requirement
  if (recipe.requiresPlan) {
    const hasPlan = db.prepare('SELECT quantity FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(agentId, recipe.requiresPlan) as { quantity: number } | undefined;
    if (!hasPlan || hasPlan.quantity < 1) {
      return { success: false, message: `You need the crafting plan "${recipe.requiresPlan.replace(/_/g, ' ')}" to craft ${recipe.name}` };
    }
  }

  // Check materials
  const inventory = db.prepare('SELECT item_code, quantity FROM inventory WHERE agent_id = ?')
    .all(agentId) as { item_code: string; quantity: number }[];
  const inventoryMap = new Map<string, number>();
  for (const inv of inventory) {
    inventoryMap.set(inv.item_code, inv.quantity);
  }

  for (const [material, count] of Object.entries(recipe.mats)) {
    const available = inventoryMap.get(material) || 0;
    if (available < count) {
      return { success: false, message: `Missing ${count - available}x ${material.replace(/_/g, ' ')}` };
    }
  }

  // Consume materials
  for (const [material, count] of Object.entries(recipe.mats)) {
    db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE agent_id = ? AND item_code = ?')
      .run(count, agentId, material);
    db.prepare('DELETE FROM inventory WHERE agent_id = ? AND quantity <= 0').run(agentId);
  }

  // Add crafted item
  const resultCode = recipe.result;
  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, resultCode) as { id: number } | undefined;

  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, 1, 0, ?)')
      .run(agentId, resultCode, Date.now());
  }

  const item = db.prepare('SELECT * FROM items WHERE code = ?').get(resultCode) as Item | undefined;
  return { success: true, message: `Successfully crafted ${recipe.name}`, item };
}

function craftItemLegacy(db: Database.Database, agentId: number, item: Item): {
  success: boolean;
  message: string;
  item?: Item;
} {
  const recipe: string[] = JSON.parse(item.craft_recipe!);
  const inventory = db.prepare('SELECT item_code, quantity FROM inventory WHERE agent_id = ?')
    .all(agentId) as { item_code: string; quantity: number }[];
  const inventoryMap = new Map<string, number>();
  for (const inv of inventory) {
    inventoryMap.set(inv.item_code, inv.quantity);
  }
  const requiredMaterials = new Map<string, number>();
  for (const material of recipe) {
    requiredMaterials.set(material, (requiredMaterials.get(material) || 0) + 1);
  }
  for (const [material, count] of requiredMaterials) {
    const available = inventoryMap.get(material) || 0;
    if (available < count) {
      return { success: false, message: `Missing ${count - available}x ${material}` };
    }
  }
  for (const [material, count] of requiredMaterials) {
    db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE agent_id = ? AND item_code = ?')
      .run(count, agentId, material);
    db.prepare('DELETE FROM inventory WHERE agent_id = ? AND quantity <= 0').run(agentId);
  }
  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, item.code) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, 1, 0, ?)')
      .run(agentId, item.code, Date.now());
  }
  return { success: true, message: `Successfully crafted ${item.name}`, item };
}

export function useConsumable(db: Database.Database, agentId: number, itemCode: string): {
  success: boolean;
  message: string;
  effect?: { hp?: number; corruption?: number };
} {
  const item = db.prepare(`SELECT * FROM items WHERE code = ? AND category = 'consumable'`)
    .get(itemCode) as Item | undefined;

  if (!item) {
    return { success: false, message: 'Item not found or not consumable' };
  }

  const invItem = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { quantity: number } | undefined;

  if (!invItem || invItem.quantity < 1) {
    return { success: false, message: 'You do not have this item' };
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
  if (!agent || agent.is_dead) {
    return { success: false, message: 'Agent is dead' };
  }

  // Apply effects
  const effect: { hp?: number; corruption?: number } = {};

  if (item.hp_bonus > 0) {
    const newHp = Math.min(agent.max_hp, agent.hp + item.hp_bonus);
    db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(newHp, agentId);
    effect.hp = item.hp_bonus;
  }

  if (item.corruption_per_action !== 0) {
    const newCorruption = Math.max(0, agent.corruption + item.corruption_per_action);
    db.prepare('UPDATE agents SET corruption = ? WHERE id = ?').run(newCorruption, agentId);
    effect.corruption = item.corruption_per_action;
  }

  // Remove one from inventory
  db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE agent_id = ? AND item_code = ?')
    .run(agentId, itemCode);
  db.prepare('DELETE FROM inventory WHERE agent_id = ? AND quantity <= 0').run(agentId);

  return { success: true, message: `Used ${item.name}`, effect };
}
