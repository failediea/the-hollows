/**
 * Boss-gated zone transitions
 * Replaces the riddle system with gate-boss encounters
 */

import { Mob } from '../world/zones.js';

export interface GateDef {
  gate_id: string;
  from_zone: string;
  to_zone: string;
  boss_mob: Mob & { archetype: string };
  required_level: number;
}

export const ZONE_GATE_DEFS: GateDef[] = [
  {
    gate_id: 'gate_to_tomb_halls',
    from_zone: 'the_gate',
    to_zone: 'tomb_halls',
    required_level: 10,
    boss_mob: {
      id: 'giant_rat_alpha',
      name: 'Giant Rat Alpha',
      hp: 140,
      atk: 20,
      def: 7,
      spd: 6,
      xp_reward: 30,
      gold_reward: 15,
      archetype: 'brute',
      drop_table: [
        { item: 'rat_pelt', chance: 0.8 },
        { item: 'health_potion', chance: 0.5 },
      ],
    },
  },
  {
    gate_id: 'gate_to_the_mines',
    from_zone: 'tomb_halls',
    to_zone: 'the_mines',
    required_level: 20,
    boss_mob: {
      id: 'cursed_champion',
      name: 'Cursed Champion',
      hp: 300,
      atk: 36,
      def: 16,
      spd: 7,
      xp_reward: 55,
      gold_reward: 28,
      element: 'shadow' as const,
      archetype: 'guardian',
      drop_table: [
        { item: 'grave_iron', chance: 0.7 },
        { item: 'bone_dust', chance: 0.8 },
        { item: 'cursed_helm', chance: 0.15 },
      ],
    },
  },
  {
    gate_id: 'gate_to_the_web',
    from_zone: 'the_mines',
    to_zone: 'the_web',
    required_level: 30,
    boss_mob: {
      id: 'troll_warden',
      name: 'Troll Warden',
      hp: 480,
      atk: 52,
      def: 25,
      spd: 5,
      xp_reward: 70,
      gold_reward: 35,
      archetype: 'brute',
      drop_table: [
        { item: 'dark_iron', chance: 0.7 },
        { item: 'troll_hide', chance: 0.5 },
      ],
    },
  },
  {
    gate_id: 'gate_to_forge_of_ruin',
    from_zone: 'the_web',
    to_zone: 'forge_of_ruin',
    required_level: 40,
    boss_mob: {
      id: 'broodmother_queen',
      name: 'Broodmother Queen',
      hp: 650,
      atk: 70,
      def: 34,
      spd: 7,
      xp_reward: 80,
      gold_reward: 40,
      element: 'ice' as const,
      archetype: 'boss',
      drop_table: [
        { item: 'spider_silk', chance: 0.9 },
        { item: 'venom_sac', chance: 0.7 },
        { item: 'shadow_thread', chance: 0.4 },
      ],
    },
  },
  {
    gate_id: 'gate_to_bone_throne',
    from_zone: 'forge_of_ruin',
    to_zone: 'bone_throne',
    required_level: 50,
    boss_mob: {
      id: 'infernal_warden',
      name: 'Infernal Warden',
      hp: 850,
      atk: 90,
      def: 44,
      spd: 8,
      xp_reward: 100,
      gold_reward: 50,
      element: 'fire' as const,
      archetype: 'boss',
      drop_table: [
        { item: 'ember_core', chance: 0.7 },
        { item: 'runic_fragments', chance: 0.5 },
        { item: 'flame_essence', chance: 0.3 },
      ],
    },
  },
  {
    gate_id: 'gate_to_abyss_bridge',
    from_zone: 'bone_throne',
    to_zone: 'abyss_bridge',
    required_level: 60,
    boss_mob: {
      id: 'death_knight_commander',
      name: 'Death Knight Commander',
      hp: 1100,
      atk: 110,
      def: 54,
      spd: 9,
      xp_reward: 150,
      gold_reward: 80,
      element: 'shadow' as const,
      archetype: 'boss',
      drop_table: [
        { item: 'soul_shard', chance: 0.9 },
        { item: 'dark_essence', chance: 0.7 },
        { item: 'death_blade', chance: 0.2 },
      ],
    },
  },
];

/**
 * Find a gate definition for a zone transition
 */
export function findGate(fromZone: string, toZone: string): GateDef | null {
  return ZONE_GATE_DEFS.find(g => g.from_zone === fromZone && g.to_zone === toZone) || null;
}
