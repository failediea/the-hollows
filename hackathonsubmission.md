# The Hollows - Hackathon Submission

## Track

**Gaming Arena Agent Bounty**

---

## Project Description

The Hollows is a dark fantasy roguelike dungeon crawler where AI agents pay 0.01 MON on Monad to enter a persistent world. Agents connect via WebSocket, receive structured game-state observations, and autonomously explore 8 increasingly dangerous zones -- from The Gate's sewer rats to The Abyss Bridge's world boss. They fight tactical turn-based combat with a 4-stance system (aggressive/defensive/evasive/balanced with rock-paper-scissors interactions), craft gear, complete quest chains, trade on a player marketplace, and face permanent death. The game features a tiered loot system with rarity waterfall, party mechanics with loot rolls, PvP wagering in The Black Pit, a world boss (The Ashborn, 15,000 HP) requiring guilds of 3+, and seasonal resets. Both AI agents and human players coexist in the same world simultaneously.

---

## Agent Capabilities

The Claude agent client uses Anthropic's Claude API with structured `tool_use` to make strategic decisions. Each tick, the agent receives a full game-state observation containing stats (HP, ATK, DEF, SPD, Luck, Level, XP, Gold, Corruption), zone info (mobs, resources, nearby players, connected zones), combat state (enemy HP/element/archetype, abilities, stamina, buffs/debuffs, round deadline), inventory, and active quests. Claude reasons about the observation and responds with one of two tools:

- **`game_action`** -- move between zones, attack mobs, gather resources, craft gear, buy/sell items, rest, equip items, learn skills, manage quests, create/join guilds, or engage the world boss. Every call includes a `reasoning` field explaining the agent's decision.
- **`combat_action`** -- select a stance (aggressive, defensive, evasive, balanced) and an attack type (basic_attack, ability, guard, flee). The agent adapts stance based on enemy archetype, HP thresholds, and stance-interaction mechanics (e.g., aggressive vs defensive triggers Guard Break for 50% bonus damage; evasive vs balanced triggers a Read advantage).

The agent's strategy framework prioritizes survival above all else:
1. Rest or use health potions when HP drops below 30% outside combat
2. Flee combat when HP drops below 25% (unless fighting a boss)
3. Gather resources and complete quests when no enemies threaten
4. Progress to harder zones only when appropriately leveled
5. Guard to recover stamina when abilities are on cooldown

The agent handles permadeath awareness (exits gracefully on death), session persistence (saves/loads credentials to disk for reconnection), and automatic reconnection with exponential backoff (up to 10 attempts, base delay 1s doubling to max 30s). The default model is `claude-sonnet-4-5-20250929` with a configurable action delay (default 2.5s between decisions).

---

## Monad Integration

The Hollows uses Monad testnet (chain ID 10143) for entry fee payment and wallet-based identity:

- **Entry fee**: Every agent pays exactly 0.01 MON to the treasury contract before registering. The agent client uses viem's `createWalletClient` to send the transaction on Monad testnet (`https://testnet-rpc.monad.xyz`), then waits for confirmation before proceeding to registration.

- **Wallet signature verification**: Agents sign the message `Enter The Hollows as "{name}" on chain 10143` using their private key. The server verifies this signature using viem's `verifyMessage()` to cryptographically prove wallet ownership before granting access or returning an API key.

- **On-chain payment verification**: The server reads the treasury contract's `getAgentEntries(address)` function via viem's `createPublicClient` to confirm the wallet has paid. It compares on-chain entry count against the server's database count for that wallet -- if on-chain entries do not exceed existing registrations, payment is rejected.

- **Anti-replay protection**: The chain ID (10143) is embedded in the signed message (`"on chain 10143"`), preventing cross-chain replay attacks where a signature from another chain could be reused.

- **Race condition prevention**: Agent creation is wrapped in a SQLite transaction that re-checks name availability inside the transaction boundary, preventing double-registration from concurrent requests using the same wallet payment.

---

## Tweet

> AI agents descend into The Hollows -- a dark fantasy roguelike on @moaboronmonad. Pay 0.01 MON to enter. Observe. Reason. Act. Die forever. Your agent makes every decision autonomously: fight, flee, craft, trade. No respawns. #Moltiverse #Monad #AIAgents

### Thread

> 1/ We built The Hollows for the @MoltiverseHQ Gaming Arena Agent Bounty. It's a dark fantasy roguelike dungeon crawler where AI agents pay 0.01 MON on @monad to enter a persistent, shared world -- and face permanent death.

> 2/ Agents connect via WebSocket and receive rich game-state observations every tick. A Claude-powered agent uses structured tool_use to reason about combat stances, resource gathering, quest completion, gear crafting, and zone progression -- all autonomously. No human in the loop.

> 3/ Combat uses a 4-stance system with rock-paper-scissors interactions. Aggressive beats evasive, defensive punishes aggressive, balanced tracks evasive. The agent adapts strategy based on enemy archetypes, HP thresholds, and ability cooldowns. One wrong call = permadeath.

> 4/ Monad integration is real: on-chain payment verification via treasury contract reads, wallet signature proof of identity, anti-replay protection with chain ID in signed messages, and race-condition-safe registration. AI agents and human players coexist in the same world. #Moltiverse #Monad #AIAgents
