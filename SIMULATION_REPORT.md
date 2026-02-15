# The Hollows - Gameplay Simulation Report

**Date:** 2026-02-12T21:56:58.075Z
**Simulation:** 5 test agents with different playstyles
**Rate limit:** 2200ms between actions (2s server limit)

## World State

| Zone | Danger | Max Level | Description |
|------|--------|-----------|-------------|
| 🕯️ The Gate | 1 | 3 | Last outpost of the surface world. Torches flicker against encroaching darkness. |
| 🪦 Tomb Halls | 2 | 6 | Burial chambers of the first Deepkings. Cold enough to see your breath. |
| ⛏️ The Mines | 2 | 6 | Abandoned Starsilver mines. The rock itself seems to breathe. |
| 🕸️ The Web | 3 | 10 | Silk-choked tunnels where the Broodmothers nest. |
| 🔥 Forge of Ruin | 3 | 10 | The great foundry where Starsilver was once smelted. Cursed flames burn eternal. |
| 💀 The Bone Throne | 4 | 15 | Throne room of the last Deepking. A cathedral of bone and shadow. |
| 🌑 The Abyss Bridge | 5 | ∞ | WORLD BOSS: The Ashborn. A narrow bridge spanning an endless chasm. |
| ⚔️ The Black Pit | 0 | ∞ | The deepest point. Impossible geometry. Time moves wrong. PvP zone. |

---

## Agent: Sim Tank (tank)

**Stance:** defensive

### Final State
| Stat | Value |
|------|-------|
| Level | 1 |
| HP | 0/70 |
| ATK | 6 |
| DEF | 3 |
| SPD | 4 |
| LUCK | 3 |
| Gold | 38 |
| Zone | the_gate |
| Status | dead |
| Corruption | 0 |
| Equip ATK Bonus | 0 |
| Equip DEF Bonus | 0 |
| Equip HP Bonus | 0 |

### Level Progression
| Action # | Level | XP |
|----------|-------|----|
| 0 | 1 | 0 |

### Combat Summary
| Metric | Value |
|--------|-------|
| Total Fights | 4 |
| Wins | 3 |
| Losses | 1 |
| Win Rate | 75.0% |
| Total XP Earned | 27 |
| Total Gold Earned | 16 |
| Avg Damage Dealt/Fight | 19.3 |
| Avg Damage Taken/Fight | 24.0 |
| Avg Rounds/Fight | 7.5 |
| XP-Capped Fights | 0 |
| Deaths | 1 |

#### the_gate Combat
Win rate: 75.0% (3/4)

| Enemy | Fights | Wins | Losses | Avg Dealt | Avg Taken | Avg Rounds |
|-------|--------|------|--------|-----------|-----------|------------|
| Cave Bat | 1 | 1 | 0 | 15.0 | 18.0 | 5.0 |
| Giant Rat | 2 | 2 | 0 | 20.5 | 10.5 | 7.0 |
| Plague Rat | 1 | 0 | 1 | 21.0 | 57.0 | 11.0 |

### Gathering Summary
| Metric | Value |
|--------|-------|
| Total Attempts | 10 |
| Successful | 10 |
| Total Items | 21 |

| Resource | Times Found | Total Qty |
|----------|-------------|----------|
| torchwood | 6 | 14 |
| iron_scraps | 3 | 6 |
| herbs | 1 | 1 |

### Inventory
| Item | Qty | Rarity | Equipped |
|------|-----|--------|----------|
| Torchwood | 14 | common |  |
| Iron Scraps | 6 | common |  |
| Medicinal Herbs | 1 | common |  |
| Bat Wing | 1 | common |  |
| Rat Pelt | 2 | common |  |

---

## Agent: Sim DPS (dps)

**Stance:** aggressive

### Final State
| Stat | Value |
|------|-------|
| Level | 1 |
| HP | 0/70 |
| ATK | 6 |
| DEF | 3 |
| SPD | 4 |
| LUCK | 3 |
| Gold | 37 |
| Zone | the_gate |
| Status | dead |
| Corruption | 0 |
| Equip ATK Bonus | 0 |
| Equip DEF Bonus | 0 |
| Equip HP Bonus | 0 |

### Level Progression
| Action # | Level | XP |
|----------|-------|----|
| 0 | 1 | 0 |

### Combat Summary
| Metric | Value |
|--------|-------|
| Total Fights | 3 |
| Wins | 2 |
| Losses | 1 |
| Win Rate | 66.7% |
| Total XP Earned | 22 |
| Total Gold Earned | 13 |
| Avg Damage Dealt/Fight | 25.7 |
| Avg Damage Taken/Fight | 27.0 |
| Avg Rounds/Fight | 3.7 |
| XP-Capped Fights | 0 |
| Deaths | 1 |

#### the_gate Combat
Win rate: 66.7% (2/3)

| Enemy | Fights | Wins | Losses | Avg Dealt | Avg Taken | Avg Rounds |
|-------|--------|------|--------|-----------|-----------|------------|
| Plague Rat | 1 | 1 | 0 | 26.0 | 17.0 | 3.0 |
| Giant Rat | 1 | 1 | 0 | 23.0 | 10.0 | 3.0 |
| Wandering Ghost | 1 | 0 | 1 | 28.0 | 54.0 | 5.0 |

### Gathering Summary
| Metric | Value |
|--------|-------|
| Total Attempts | 10 |
| Successful | 10 |
| Total Items | 22 |

| Resource | Times Found | Total Qty |
|----------|-------------|----------|
| torchwood | 5 | 12 |
| iron_scraps | 3 | 7 |
| herbs | 2 | 3 |

### Inventory
| Item | Qty | Rarity | Equipped |
|------|-----|--------|----------|
| Torchwood | 12 | common |  |
| Iron Scraps | 7 | common |  |
| Medicinal Herbs | 3 | common |  |
| Rat Pelt | 1 | common |  |
| Venom Sac | 1 | uncommon |  |

---

## Agent: Sim Explorer (explorer)

**Stance:** evasive

### Final State
| Stat | Value |
|------|-------|
| Level | 1 |
| HP | 0/70 |
| ATK | 6 |
| DEF | 3 |
| SPD | 4 |
| LUCK | 3 |
| Gold | 31 |
| Zone | the_gate |
| Status | dead |
| Corruption | 0 |
| Equip ATK Bonus | 0 |
| Equip DEF Bonus | 0 |
| Equip HP Bonus | 0 |

### Level Progression
| Action # | Level | XP |
|----------|-------|----|
| 0 | 1 | 0 |

### Combat Summary
| Metric | Value |
|--------|-------|
| Total Fights | 4 |
| Wins | 3 |
| Losses | 1 |
| Win Rate | 75.0% |
| Total XP Earned | 37 |
| Total Gold Earned | 22 |
| Avg Damage Dealt/Fight | 15.3 |
| Avg Damage Taken/Fight | 23.5 |
| Avg Rounds/Fight | 5.3 |
| XP-Capped Fights | 0 |
| Deaths | 1 |

#### the_gate Combat
Win rate: 75.0% (3/4)

| Enemy | Fights | Wins | Losses | Avg Dealt | Avg Taken | Avg Rounds |
|-------|--------|------|--------|-----------|-----------|------------|
| Giant Rat | 1 | 1 | 0 | 17.0 | 10.0 | 4.0 |
| Plague Rat | 1 | 1 | 0 | 23.0 | 34.0 | 8.0 |
| Wandering Ghost | 2 | 1 | 1 | 10.5 | 25.0 | 4.5 |

### Gathering Summary
| Metric | Value |
|--------|-------|
| Total Attempts | 10 |
| Successful | 10 |
| Total Items | 19 |

| Resource | Times Found | Total Qty |
|----------|-------------|----------|
| herbs | 3 | 5 |
| iron_scraps | 3 | 6 |
| torchwood | 4 | 8 |

### Inventory
| Item | Qty | Rarity | Equipped |
|------|-----|--------|----------|
| Medicinal Herbs | 5 | common |  |
| Iron Scraps | 6 | common |  |
| Torchwood | 8 | common |  |
| Rat Pelt | 2 | common |  |

---

## Agent: Sim Gatherer (gatherer)

**Stance:** balanced

### Final State
| Stat | Value |
|------|-------|
| Level | 1 |
| HP | 0/70 |
| ATK | 6 |
| DEF | 3 |
| SPD | 4 |
| LUCK | 3 |
| Gold | 38 |
| Zone | the_gate |
| Status | dead |
| Corruption | 0 |
| Equip ATK Bonus | 0 |
| Equip DEF Bonus | 0 |
| Equip HP Bonus | 0 |

### Level Progression
| Action # | Level | XP |
|----------|-------|----|
| 0 | 1 | 0 |

### Combat Summary
| Metric | Value |
|--------|-------|
| Total Fights | 4 |
| Wins | 3 |
| Losses | 1 |
| Win Rate | 75.0% |
| Total XP Earned | 26 |
| Total Gold Earned | 15 |
| Avg Damage Dealt/Fight | 15.8 |
| Avg Damage Taken/Fight | 21.8 |
| Avg Rounds/Fight | 3.8 |
| XP-Capped Fights | 0 |
| Deaths | 1 |

#### the_gate Combat
Win rate: 75.0% (3/4)

| Enemy | Fights | Wins | Losses | Avg Dealt | Avg Taken | Avg Rounds |
|-------|--------|------|--------|-----------|-----------|------------|
| Cave Bat | 2 | 2 | 0 | 17.0 | 15.5 | 3.5 |
| Plague Rat | 1 | 1 | 0 | 25.0 | 33.0 | 6.0 |
| Wandering Ghost | 1 | 0 | 1 | 4.0 | 23.0 | 2.0 |

### Gathering Summary
| Metric | Value |
|--------|-------|
| Total Attempts | 10 |
| Successful | 10 |
| Total Items | 14 |

| Resource | Times Found | Total Qty |
|----------|-------------|----------|
| iron_scraps | 4 | 7 |
| torchwood | 3 | 4 |
| herbs | 3 | 3 |

### Inventory
| Item | Qty | Rarity | Equipped |
|------|-----|--------|----------|
| Iron Scraps | 7 | common |  |
| Torchwood | 4 | common |  |
| Medicinal Herbs | 3 | common |  |

---

## Agent: Sim Balanced (balanced)

**Stance:** balanced

### Final State
| Stat | Value |
|------|-------|
| Level | 1 |
| HP | 0/70 |
| ATK | 6 |
| DEF | 3 |
| SPD | 4 |
| LUCK | 3 |
| Gold | 71 |
| Zone | the_gate |
| Status | dead |
| Corruption | 1 |
| Equip ATK Bonus | 0 |
| Equip DEF Bonus | 0 |
| Equip HP Bonus | 0 |

### Level Progression
| Action # | Level | XP |
|----------|-------|----|
| 0 | 1 | 0 |

### Combat Summary
| Metric | Value |
|--------|-------|
| Total Fights | 5 |
| Wins | 4 |
| Losses | 1 |
| Win Rate | 80.0% |
| Total XP Earned | 36 |
| Total Gold Earned | 21 |
| Avg Damage Dealt/Fight | 18.6 |
| Avg Damage Taken/Fight | 17.6 |
| Avg Rounds/Fight | 4.6 |
| XP-Capped Fights | 0 |
| Deaths | 1 |

#### the_gate Combat
Win rate: 80.0% (4/5)

| Enemy | Fights | Wins | Losses | Avg Dealt | Avg Taken | Avg Rounds |
|-------|--------|------|--------|-----------|-----------|------------|
| Giant Rat | 2 | 1 | 1 | 16.0 | 8.5 | 4.0 |
| Cave Bat | 2 | 2 | 0 | 18.0 | 16.0 | 4.5 |
| Plague Rat | 1 | 1 | 0 | 25.0 | 39.0 | 6.0 |

### Gathering Summary
| Metric | Value |
|--------|-------|
| Total Attempts | 10 |
| Successful | 10 |
| Total Items | 20 |

| Resource | Times Found | Total Qty |
|----------|-------------|----------|
| iron_scraps | 4 | 9 |
| torchwood | 1 | 2 |
| herbs | 5 | 9 |

### Inventory
| Item | Qty | Rarity | Equipped |
|------|-----|--------|----------|
| Iron Scraps | 9 | common |  |
| Torchwood | 2 | common |  |
| Medicinal Herbs | 9 | common |  |

---

## Overall Analysis

### Progression Comparison
| Agent | Style | Final Level | Total Fights | Win Rate | Gold | Status |
|-------|-------|-------------|--------------|----------|------|--------|
| Sim Tank | tank | 1 | 4 | 75% | 38 | dead |
| Sim DPS | dps | 1 | 3 | 67% | 37 | dead |
| Sim Explorer | explorer | 1 | 4 | 75% | 31 | dead |
| Sim Gatherer | gatherer | 1 | 4 | 75% | 38 | dead |
| Sim Balanced | balanced | 1 | 5 | 80% | 71 | dead |

### XP & Leveling Analysis

**The Gate:**
- Average XP per win: 9.9
- Average Gold per win: 5.8
- XP per level: 100 → ~11 wins to level up
- XP-capped wins: 0/15

### Stance Analysis

| Stance | Fights | Win Rate | Avg Dealt | Avg Taken |
|--------|--------|----------|-----------|----------|
| defensive | 4 | 75.0% | 19.3 | 24.0 |
| aggressive | 3 | 66.7% | 25.7 | 27.0 |
| evasive | 4 | 75.0% | 15.3 | 23.5 |
| balanced | 9 | 77.8% | 17.3 | 19.4 |

### Balance Recommendations

#### ☠️ Permadeath Rate
5/5 agents died during simulation. With permadeath and no revive, this is extremely punishing. Deaths: Sim Tank, Sim DPS, Sim Explorer, Sim Gatherer, Sim Balanced

#### General Observations

1. **Combat System:** Multi-round tactical combat with stances works well. Fights average 3-5 rounds.
2. **Rest Cooldown:** 5-minute rest cooldown is reasonable for real play but makes simulation slow.
3. **Zone Events:** 20% chance per action adds unpredictability. Need to verify events don't deal excessive damage.
4. **Economy:** Early gold is tight. Health potions are essential for survival.
5. **Equipment:** Weapon/armor provide meaningful stat bonuses (check equipment effect tables above).
6. **Gathering:** Resources come in quantities of 1-3 per gather. Crafting viability depends on recipe costs.
7. **Corruption:** Not a factor in early game (threshold 100, gold accumulation is slow).

---
*Report generated by automated gameplay simulation*
