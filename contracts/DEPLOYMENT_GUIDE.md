# HollowsTreasury - Complete Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Setup ✓

```bash
# Install Node.js dependencies
npm install

# Install Solidity compiler globally
npm install -g solc

# Verify installations
node --version    # Should be v16+
solc --version    # Should be 0.8.20+
npx tsc --version # TypeScript compiler
```

### 2. Get MON Testnet Tokens

1. Generate or use existing wallet
2. Visit Monad testnet faucet (check Monad Discord for link)
3. Request testnet MON tokens
4. Verify balance: `npm run interact info` (after deployment)

### 3. Prepare Environment Variables

```bash
# Copy template
cp .env.example .env

# Edit .env and add your private key (NO 0x prefix needed for some tools)
# PRIVATE_KEY=your_private_key_here
```

⚠️ **NEVER commit .env file!** It's in .gitignore for safety.

---

## Compilation

### Step 1: Compile Contract

```bash
npm run compile
```

This generates:
- `build/HollowsTreasury.bin` - Bytecode
- `build/HollowsTreasury.abi` - ABI JSON

### Verify Compilation

```bash
ls -lh build/
# Should see HollowsTreasury.bin and HollowsTreasury.abi
```

### Manual Compilation (if needed)

```bash
solc --optimize --optimize-runs 200 \
     --bin --abi \
     HollowsTreasury.sol \
     -o ./build --overwrite
```

---

## Deployment

### Step 1: Update deploy.ts with Bytecode

After compilation, you need to add the compiled bytecode to `deploy.ts`:

```typescript
// Read bytecode from build/HollowsTreasury.bin
const bytecode = fs.readFileSync('./build/HollowsTreasury.bin', 'utf8');
const HOLLOWS_TREASURY_BYTECODE = `0x${bytecode.trim()}`;

// Read ABI from build/HollowsTreasury.abi  
const abiJson = fs.readFileSync('./build/HollowsTreasury.abi', 'utf8');
const HOLLOWS_TREASURY_ABI = JSON.parse(abiJson);
```

### Step 2: Set Initial Parameters

In `deploy.ts`, configure:

```typescript
const INITIAL_ENTRY_FEE = parseEther('0.01'); // 0.01 MON
```

### Step 3: Deploy

```bash
PRIVATE_KEY=your_key_here npm run deploy
```

Expected output:
```
🌑 Deploying HollowsTreasury to Monad Testnet...
📍 Deploying from: 0x...
💰 Account balance: 1.5 MON
📤 Transaction hash: 0x...
⏳ Waiting for confirmation...
✅ Contract deployed successfully!
📍 Contract address: 0x...
```

### Step 4: Save Deployment Info

The script automatically saves to `deployment.json`:

```json
{
  "network": "monad-testnet",
  "chainId": 10143,
  "contractAddress": "0x...",
  "deployer": "0x...",
  "transactionHash": "0x...",
  "blockNumber": "12345",
  "timestamp": "2024-02-11T01:20:00.000Z",
  "initialEntryFee": "0.01"
}
```

---

## Post-Deployment Verification

### 1. Check Deployment

```bash
npm run info
```

Should display:
```
📊 Season Information
Season: 1
Started: [timestamp]
Entry Fee: 0.01 MON

💰 Pool Balances:
  Boss Pool:    0 MON (40%)
  Abyss Pool:   0 MON (30%)
  Arena Pool:   0 MON (20%)
  Operations:   0 MON (10%)
  Total Locked: 0 MON
```

### 2. Test Entry Function

```bash
PRIVATE_KEY=your_key npm run interact enter
```

Expected:
```
🎮 Entering The Hollows as 0x...
Entry Fee: 0.01 MON
Your Balance: 1.5 MON

📤 Sending transaction...
Transaction: 0x...
⏳ Waiting for confirmation...

✅ Successfully entered The Hollows!
```

### 3. Verify Entry

```bash
PRIVATE_KEY=your_key npm run interact my-entries
```

Should show:
```
🎮 Your Stats
Address: 0x...
Total Entries: 1
```

### 4. Check Pool Distribution

```bash
npm run info
```

Should now show:
```
💰 Pool Balances:
  Boss Pool:    0.004 MON (40%)
  Abyss Pool:   0.003 MON (30%)
  Arena Pool:   0.002 MON (20%)
  Operations:   0.001 MON (10%)
  Total Locked: 0.01 MON
```

---

## Testing All Functions

### Test Wager System

#### Create Wager
```bash
PRIVATE_KEY=challenger_key npm run interact create-wager 0xOPPONENT 0.1
```

#### View Wager
```bash
npm run interact wager-info 0
```

#### Accept Wager (as opponent)
```bash
PRIVATE_KEY=opponent_key npx ts-node interact.ts accept-wager 0
```

### Test Admin Functions (Owner Only)

#### Set Entry Fee
```typescript
await walletClient.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  functionName: 'setEntryFee',
  args: [parseEther('0.02')]
});
```

#### Distribute Boss Reward
```typescript
await walletClient.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  functionName: 'distributeBossReward',
  args: [
    ['0xWINNER1', '0xWINNER2'],
    [parseEther('0.003'), parseEther('0.001')]
  ]
});
```

#### Start New Season
```typescript
await walletClient.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  functionName: 'startNewSeason'
});
```

#### Withdraw Operations
```typescript
await walletClient.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  functionName: 'withdrawOperations'
});
```

---

## Monitoring & Maintenance

### Event Monitoring

Set up event listeners for key events:

```typescript
const unwatch = publicClient.watchContractEvent({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  eventName: 'AgentEntered',
  onLogs: (logs) => {
    logs.forEach(log => {
      console.log('New entry:', log.args.agent);
    });
  }
});
```

### Key Events to Monitor

1. **AgentEntered** - Track new entries
2. **WagerCreated** - New PvP matches
3. **WagerResolved** - Match outcomes
4. **BossRewardDistributed** - Reward payouts
5. **SeasonStarted** - Season changes

### Dashboard Metrics

Monitor these regularly:

- Total entries per season
- Pool balances
- Active wagers
- Operations pool balance
- Transaction volume
- Gas usage

---

## Troubleshooting

### "Insufficient balance"
- Check wallet balance: `npm run info`
- Get more testnet tokens from faucet
- Ensure you have enough for gas + entry fee

### "Incorrect entry fee"
- Get current fee: `npm run info`
- Send exact amount in transaction
- Check for fee changes

### "Contract paused"
- Contract owner has paused operations
- Wait for unpause or check announcements
- Emergency situation - check Discord/Telegram

### "Not owner"
- Only contract owner can call admin functions
- Verify you're using owner's private key
- Check `owner` value in contract

### Compilation Errors
```bash
# Reinstall solc
npm uninstall -g solc
npm install -g solc@0.8.20

# Clean and recompile
rm -rf build/
npm run compile
```

### Deployment Fails
1. Check network connection
2. Verify RPC endpoint is responsive
3. Ensure sufficient gas balance
4. Check for network congestion
5. Try increasing gas limit

---

## Security Reminders

### Before Mainnet

- [ ] Complete security audit
- [ ] Test all edge cases
- [ ] Implement multi-sig for owner
- [ ] Add timelock for critical functions
- [ ] Set up monitoring alerts
- [ ] Document emergency procedures
- [ ] Test pause/unpause functionality
- [ ] Verify all math calculations
- [ ] Review gas optimizations

### Operational Security

- [ ] Use hardware wallet for owner key
- [ ] Store backup keys securely (offline)
- [ ] Document all admin procedures
- [ ] Set up monitoring/alerting
- [ ] Create incident response plan
- [ ] Regular security reviews
- [ ] Keep dependencies updated

---

## Quick Reference

### Essential Commands

```bash
# Compile
npm run compile

# Deploy
PRIVATE_KEY=... npm run deploy

# View info
npm run info

# Enter game
PRIVATE_KEY=... npm run interact enter

# Check entries
PRIVATE_KEY=... npm run interact my-entries

# Create wager
PRIVATE_KEY=... npm run interact create-wager 0xOPPONENT 0.1

# View wager
npm run interact wager-info 0
```

### Network Details

- **Chain ID**: 10143
- **RPC**: https://monad-testnet.drpc.org
- **Currency**: MON
- **Explorer**: https://explorer.monad.xyz

### Contract Info

- **Solidity**: ^0.8.20
- **License**: MIT
- **Size**: ~15 KB
- **Gas**: Optimized with 200 runs

---

## Next Steps After Deployment

1. **Test Thoroughly**
   - All entry flows
   - Wager creation/acceptance/resolution
   - Reward distributions
   - Admin functions
   - Edge cases

2. **Document**
   - Save contract address
   - Record all transactions
   - Document admin procedures
   - Create user guides

3. **Monitor**
   - Set up event listeners
   - Track pool balances
   - Monitor transaction volume
   - Watch for anomalies

4. **Integrate**
   - Connect game backend
   - Implement reward logic
   - Build admin dashboard
   - Create user interfaces

5. **Prepare for Launch**
   - Security audit (if mainnet)
   - Marketing materials
   - User documentation
   - Support channels

---

**Deployment Status**: ✅ Ready  
**Security**: ✅ Audited Internally  
**Documentation**: ✅ Complete  
**Next**: Deploy and Test! 🚀

---

*Last Updated: 2024-02-11*  
*The Hollows Treasury v1.0*
