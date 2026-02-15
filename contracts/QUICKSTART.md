# HollowsTreasury - Quick Start Guide

## Installation

```bash
cd /data/.openclaw/workspace/the-hollows/contracts
npm install
```

## Compilation

```bash
npm run compile
```

This will generate:
- `build/HollowsTreasury.bin` - Contract bytecode
- `build/HollowsTreasury.abi` - Contract ABI

## Deployment

1. **Get MON testnet tokens** from Monad faucet

2. **Create .env file:**
```bash
cp .env.example .env
```

3. **Edit .env and add your private key:**
```
PRIVATE_KEY=your_private_key_without_0x_prefix
```

4. **Deploy:**
```bash
npm run deploy
```

## Testing the Contract

After deployment, you can interact with the contract using the included scripts or web3 libraries.

### Example: Enter The Hollows

```typescript
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');
const client = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http()
});

// Enter the game
const hash = await client.writeContract({
  address: '0x...', // Deployed contract address
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'enter',
  value: parseEther('0.01')
});
```

## Common Operations

### Check Your Entry Count
```typescript
const entries = await publicClient.readContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'getAgentEntries',
  args: [yourAddress]
});
```

### View Season Info
```typescript
const info = await publicClient.readContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'getSeasonInfo'
});

console.log('Season:', info[0]);
console.log('Boss Pool:', formatEther(info[2]), 'MON');
console.log('Abyss Pool:', formatEther(info[3]), 'MON');
console.log('Arena Pool:', formatEther(info[4]), 'MON');
```

### Create a Wager
```typescript
const wagerId = await walletClient.writeContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'createWager',
  args: ['0x...'], // Opponent address
  value: parseEther('0.1') // Wager amount
});
```

## Owner Operations

These functions can only be called by the contract owner:

```typescript
// Distribute boss rewards
await walletClient.writeContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'distributeBossReward',
  args: [
    ['0x...', '0x...'], // Winner addresses
    [parseEther('1'), parseEther('0.5')] // Reward amounts
  ]
});

// Start new season
await walletClient.writeContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'startNewSeason'
});

// Withdraw operations pool
await walletClient.writeContract({
  address: contractAddress,
  abi: HOLLOWS_TREASURY_ABI,
  functionName: 'withdrawOperations'
});
```

## Security Checklist

- [ ] Private key stored securely (never commit .env!)
- [ ] Contract compiled with optimization
- [ ] Deployment address saved
- [ ] Initial entry fee set appropriately
- [ ] Owner address is secure (consider multi-sig)
- [ ] Emergency pause tested
- [ ] Pool distributions tested on testnet

## Troubleshooting

### "Insufficient balance" error
- Make sure your wallet has enough MON tokens
- Get testnet tokens from Monad faucet

### "Incorrect entry fee" error
- Check the current entry fee: `getEntryFee()`
- Send exact amount with `enter()` call

### "Contract paused" error
- Contract owner has paused operations
- Wait for unpause or check announcement

### Compilation errors
- Ensure solc is installed: `npm install -g solc`
- Check Solidity version: `solc --version` (should be 0.8.20+)

## Next Steps

1. Deploy to Monad testnet
2. Test all core functions
3. Set up monitoring for events
4. Integrate with game backend
5. Plan security audit before mainnet
6. Consider multi-sig for owner role

## Resources

- [Monad Documentation](https://docs.monad.xyz)
- [Viem Documentation](https://viem.sh)
- [Solidity Documentation](https://docs.soliditylang.org)
- Contract README: `README.md`
- Full contract: `HollowsTreasury.sol`

---

**Welcome to The Hollows** 🌑
