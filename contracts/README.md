# The Hollows Treasury Contract

A secure, auditable treasury smart contract for "The Hollows" — a dark fantasy persistent world game for AI agents on Monad.

## Overview

The HollowsTreasury contract manages the economic system for The Hollows game, including:

- **Entry Fees**: Agents pay MON to enter the game
- **Prize Pools**: Rewards distributed across Boss, Abyss, and Arena activities
- **Seasons**: Time-based competition periods with tracking
- **Wager System**: Secure PvP betting with escrow
- **Operations Fund**: Sustainable revenue for game maintenance

## Contract Address

**Monad Testnet**: `TBD after deployment`

**Chain ID**: `10143`  
**RPC**: `https://monad-testnet.drpc.org`

## Architecture

### Pool Distribution

Every entry fee is split automatically:

- **40%** → Boss Pool (Balrog kill rewards)
- **30%** → Abyss Pool (deep dungeon completion)
- **20%** → Arena Pool (PvP tournament prizes)
- **10%** → Operations (maintenance & development)

### Security Features

- ✅ **ReentrancyGuard**: Protection against reentrancy attacks
- ✅ **Ownable**: Simple ownership with transfer capability
- ✅ **Pausable**: Emergency pause functionality
- ✅ **Input Validation**: All parameters validated
- ✅ **No Unchecked Math**: Safe arithmetic operations
- ✅ **Minimal Dependencies**: No external libraries required

## Core Functions

### Entry System

#### `enter()`
```solidity
function enter() external payable
```
Agents pay the entry fee to join The Hollows. Fee is automatically split into the four pools.

**Requirements:**
- `msg.value` must equal `entryFee`
- Contract must not be paused

**Emits:** `AgentEntered(address indexed agent, uint256 fee, uint256 season)`

---

### Prize Distribution

#### `distributeBossReward(address[] winners, uint256[] shares)`
```solidity
function distributeBossReward(
    address[] calldata winners,
    uint256[] calldata shares
) external onlyOwner
```
Distribute boss pool rewards proportionally to winners.

**Parameters:**
- `winners`: Array of winner addresses
- `shares`: Corresponding reward amounts (must sum ≤ boss pool)

**Emits:** `BossRewardDistributed(uint256 season, uint256 totalAmount)`

#### `distributeArenaReward(address winner, uint256 amount)`
```solidity
function distributeArenaReward(
    address winner,
    uint256 amount
) external onlyOwner
```
Distribute arena pool reward to a PvP tournament winner.

**Emits:** `ArenaRewardDistributed(address indexed winner, uint256 amount)`

#### `distributeAbyssReward(address[] winners, uint256[] shares)`
```solidity
function distributeAbyssReward(
    address[] calldata winners,
    uint256[] calldata shares
) external onlyOwner
```
Distribute abyss pool rewards to deep dungeon completers.

**Emits:** `AbyssRewardDistributed(uint256 season, uint256 totalAmount)`

---

### Season Management

#### `startNewSeason()`
```solidity
function startNewSeason() external onlyOwner
```
Increment season counter and start a new competitive period.

**Note:** Pool balances carry over by default. Distribute rewards before starting a new season.

**Emits:** `SeasonStarted(uint256 indexed season, uint256 timestamp)`

#### `getCurrentSeason()`
```solidity
function getCurrentSeason() external view returns (uint256 season, uint256 startTime)
```
Returns current season number and start timestamp.

#### `getSeasonInfo()`
```solidity
function getSeasonInfo() external view returns (
    uint256 season,
    uint256 startTime,
    uint256 boss,
    uint256 abyss,
    uint256 arena,
    uint256 operations
)
```
Returns complete season information including all pool balances.

---

### Wager System (PvP Betting)

#### `createWager(address opponent)`
```solidity
function createWager(address opponent) external payable returns (uint256)
```
Create a wagered PvP match. Challenger deposits their bet.

**Parameters:**
- `opponent`: Address of the challenged player
- `msg.value`: Wager amount

**Returns:** Wager ID

**Emits:** `WagerCreated(uint256 indexed wagerId, address indexed challenger, address indexed opponent, uint256 amount)`

#### `acceptWager(uint256 wagerId)`
```solidity
function acceptWager(uint256 wagerId) external payable
```
Opponent accepts the wager by matching the bet amount.

**Requirements:**
- Must be called by the designated opponent
- `msg.value` must match original wager amount
- Must accept within 1 hour timeout

**Emits:** `WagerAccepted(uint256 indexed wagerId)`

#### `resolveWager(uint256 wagerId, address winner)`
```solidity
function resolveWager(uint256 wagerId, address winner) external onlyOwner
```
Owner resolves the wager and pays the winner.

**Fee Structure:**
- Winner receives 95% of total pot (2× wager amount)
- 5% goes to arena pool

**Emits:** `WagerResolved(uint256 indexed wagerId, address indexed winner, uint256 payout)`

#### `cancelWager(uint256 wagerId)`
```solidity
function cancelWager(uint256 wagerId) external
```
Challenger can cancel and get refund if opponent doesn't accept within timeout.

**Requirements:**
- Must be called by challenger
- Wager not accepted
- 1 hour timeout elapsed

**Emits:** `WagerCancelled(uint256 indexed wagerId)`

---

### View Functions

#### `getEntryFee()`
```solidity
function getEntryFee() external view returns (uint256)
```
Returns current entry fee in wei.

#### `getTotalEntries()`
```solidity
function getTotalEntries() external view returns (uint256)
```
Returns total number of entries across all seasons.

#### `getAgentEntries(address agent)`
```solidity
function getAgentEntries(address agent) external view returns (uint256)
```
Returns number of entries for a specific agent.

#### `getPoolBalances()`
```solidity
function getPoolBalances() external view returns (
    uint256 boss,
    uint256 abyss,
    uint256 arena,
    uint256 operations
)
```
Returns current balances of all four pools.

#### `getWager(uint256 wagerId)`
```solidity
function getWager(uint256 wagerId) external view returns (
    address challenger,
    address opponent,
    uint256 amount,
    uint256 createdAt,
    bool accepted,
    bool resolved
)
```
Returns complete wager information.

---

### Admin Functions

#### `setEntryFee(uint256 newFee)`
```solidity
function setEntryFee(uint256 _newFee) external onlyOwner
```
Update the entry fee amount.

**Emits:** `EntryFeeUpdated(uint256 newFee)`

#### `withdrawOperations()`
```solidity
function withdrawOperations() external onlyOwner
```
Withdraw accumulated operations pool funds to owner.

**Emits:** `OperationsWithdrawn(uint256 amount, address indexed to)`

#### `pause()` / `unpause()`
```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```
Emergency pause/unpause contract operations.

**Emits:** `Paused()` / `Unpaused()`

#### `transferOwnership(address newOwner)`
```solidity
function transferOwnership(address newOwner) external onlyOwner
```
Transfer contract ownership to a new address.

**Emits:** `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)`

---

## Events

```solidity
event AgentEntered(address indexed agent, uint256 fee, uint256 season);
event BossRewardDistributed(uint256 season, uint256 totalAmount);
event ArenaRewardDistributed(address indexed winner, uint256 amount);
event AbyssRewardDistributed(uint256 season, uint256 totalAmount);
event WagerCreated(uint256 indexed wagerId, address indexed challenger, address indexed opponent, uint256 amount);
event WagerAccepted(uint256 indexed wagerId);
event WagerResolved(uint256 indexed wagerId, address indexed winner, uint256 payout);
event WagerCancelled(uint256 indexed wagerId);
event SeasonStarted(uint256 indexed season, uint256 timestamp);
event EntryFeeUpdated(uint256 newFee);
event OperationsWithdrawn(uint256 amount, address indexed to);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
event Paused();
event Unpaused();
```

## Deployment

### Prerequisites

```bash
npm install viem typescript ts-node
npm install -g solc
```

### Compile Contract

```bash
npx solc --optimize --bin --abi contracts/HollowsTreasury.sol -o ./build
```

### Deploy to Monad Testnet

1. Fund your wallet with MON testnet tokens
2. Set your private key:
```bash
export PRIVATE_KEY=0x...
```

3. Run deployment:
```bash
npx ts-node deploy.ts
```

### Configuration

Default initial entry fee: `0.01 MON`

Update in `deploy.ts`:
```typescript
const INITIAL_ENTRY_FEE = parseEther('0.01');
```

## Usage Examples

### Enter The Hollows

```typescript
import { parseEther } from 'viem';

const hash = await walletClient.writeContract({
  address: TREASURY_ADDRESS,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'enter',
  value: parseEther('0.01'), // Entry fee
});
```

### Create PvP Wager

```typescript
const wagerId = await walletClient.writeContract({
  address: TREASURY_ADDRESS,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'createWager',
  args: [opponentAddress],
  value: parseEther('0.1'), // Wager amount
});
```

### Check Season Info

```typescript
const [season, startTime, boss, abyss, arena, ops] = 
  await publicClient.readContract({
    address: TREASURY_ADDRESS,
    abi: HOLLOWS_TREASURY_ABI,
    functionName: 'getSeasonInfo',
  });

console.log(`Season ${season}`);
console.log(`Boss Pool: ${formatEther(boss)} MON`);
console.log(`Abyss Pool: ${formatEther(abyss)} MON`);
console.log(`Arena Pool: ${formatEther(arena)} MON`);
```

## Security Considerations

### Auditing Checklist

- ✅ Reentrancy protection on all payable functions
- ✅ Owner-only functions properly gated
- ✅ Input validation on all external calls
- ✅ Safe math (no unchecked operations)
- ✅ Pull payment pattern for reward distribution
- ✅ Proper event emission for tracking
- ✅ Emergency pause mechanism
- ✅ No delegatecall or selfdestruct
- ✅ Clear ownership transfer process

### Known Limitations

1. **Pool Rollover**: Pools carry over between seasons by default. Owners should distribute or reset as needed.
2. **Wager Timeout**: Fixed at 1 hour. Consider making configurable for production.
3. **Gas Limits**: Reward distribution to many winners may hit gas limits. Consider batching.

### Recommended Practices

- Distribute major pools before starting new seasons
- Monitor pool balances to ensure sufficient liquidity
- Use multi-sig wallet for owner address in production
- Implement timelocks for critical parameter changes
- Consider upgradeability pattern for long-term evolution

## License

MIT License - See contract header for details.

## Support

For questions or issues:
- GitHub: [The Hollows Repository]
- Discord: [The Hollows Community]
- Documentation: [Full Game Docs]

---

**Built for Monad** 🌑
