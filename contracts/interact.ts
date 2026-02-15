import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseEther,
  formatEther,
  type Address
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import * as fs from 'fs';
import * as path from 'path';

// Define Monad Testnet
const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://monad-testnet.drpc.org'],
    },
    public: {
      http: ['https://monad-testnet.drpc.org'],
    },
  },
  testnet: true,
});

// Load deployment info
let deploymentInfo: any;
try {
  const deploymentPath = path.join(__dirname, 'deployment.json');
  deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
} catch (error) {
  console.error('❌ Deployment info not found. Deploy the contract first.');
  process.exit(1);
}

const CONTRACT_ADDRESS = deploymentInfo.contractAddress as Address;

// Minimal ABI for interaction
const ABI = [
  {
    type: 'function',
    name: 'enter',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getEntryFee',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSeasonInfo',
    inputs: [],
    outputs: [
      { name: 'season', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'boss', type: 'uint256' },
      { name: 'abyss', type: 'uint256' },
      { name: 'arena', type: 'uint256' },
      { name: 'operations', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentEntries',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createWager',
    inputs: [{ name: 'opponent', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getWager',
    inputs: [{ name: 'wagerId', type: 'uint256' }],
    outputs: [
      { name: 'challenger', type: 'address' },
      { name: 'opponent', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'accepted', type: 'bool' },
      { name: 'resolved', type: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('📖 HollowsTreasury Interaction Script\n');
    console.log('Usage: npx ts-node interact.ts <command> [args]\n');
    console.log('Commands:');
    console.log('  info              - Display contract and season info');
    console.log('  enter             - Enter The Hollows (pay entry fee)');
    console.log('  my-entries        - Check your entry count');
    console.log('  create-wager <opponent> <amount> - Create a PvP wager');
    console.log('  wager-info <id>   - Get wager details');
    console.log('\nExample:');
    console.log('  npx ts-node interact.ts info');
    console.log('  npx ts-node interact.ts enter');
    console.log('  PRIVATE_KEY=0x... npx ts-node interact.ts create-wager 0xABC... 0.1');
    return;
  }

  // Create public client
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  console.log(`\n🌑 The Hollows Treasury`);
  console.log(`📍 Contract: ${CONTRACT_ADDRESS}\n`);

  switch (command) {
    case 'info':
      await displayInfo(publicClient);
      break;
    
    case 'enter':
      await enterHollows(publicClient);
      break;
    
    case 'my-entries':
      await checkMyEntries(publicClient);
      break;
    
    case 'create-wager':
      await createWager(publicClient, args[1], args[2]);
      break;
    
    case 'wager-info':
      await wagerInfo(publicClient, args[1]);
      break;
    
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Run without arguments to see available commands.');
  }
}

async function displayInfo(publicClient: any) {
  console.log('📊 Season Information\n');
  
  const entryFee = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getEntryFee',
  });
  
  const seasonInfo = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getSeasonInfo',
  });
  
  const [season, startTime, boss, abyss, arena, ops] = seasonInfo;
  
  console.log(`Season: ${season}`);
  console.log(`Started: ${new Date(Number(startTime) * 1000).toLocaleString()}`);
  console.log(`Entry Fee: ${formatEther(entryFee)} MON\n`);
  
  console.log('💰 Pool Balances:');
  console.log(`  Boss Pool:    ${formatEther(boss)} MON (40%)`);
  console.log(`  Abyss Pool:   ${formatEther(abyss)} MON (30%)`);
  console.log(`  Arena Pool:   ${formatEther(arena)} MON (20%)`);
  console.log(`  Operations:   ${formatEther(ops)} MON (10%)`);
  console.log(`  Total Locked: ${formatEther(boss + abyss + arena + ops)} MON`);
}

async function enterHollows(publicClient: any) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('❌ PRIVATE_KEY environment variable required');
    console.log('Usage: PRIVATE_KEY=0x... npx ts-node interact.ts enter');
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log(`🎮 Entering The Hollows as ${account.address}\n`);

  const entryFee = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getEntryFee',
  });

  console.log(`Entry Fee: ${formatEther(entryFee)} MON`);
  
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Your Balance: ${formatEther(balance)} MON\n`);

  if (balance < entryFee) {
    console.log('❌ Insufficient balance!');
    return;
  }

  console.log('📤 Sending transaction...');

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'enter',
    value: entryFee,
  });

  console.log(`Transaction: ${hash}`);
  console.log('⏳ Waiting for confirmation...\n');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    console.log('✅ Successfully entered The Hollows!');
    console.log(`Block: ${receipt.blockNumber}`);
  } else {
    console.log('❌ Transaction failed');
  }
}

async function checkMyEntries(publicClient: any) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('❌ PRIVATE_KEY environment variable required');
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  const entries = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getAgentEntries',
    args: [account.address],
  });

  console.log(`🎮 Your Stats\n`);
  console.log(`Address: ${account.address}`);
  console.log(`Total Entries: ${entries}`);
}

async function createWager(publicClient: any, opponent: string, amount: string) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !opponent || !amount) {
    console.log('❌ Usage: PRIVATE_KEY=0x... npx ts-node interact.ts create-wager <opponent> <amount>');
    console.log('Example: PRIVATE_KEY=0x... npx ts-node interact.ts create-wager 0xABC... 0.1');
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  const wagerAmount = parseEther(amount);

  console.log(`⚔️  Creating PvP Wager\n`);
  console.log(`Challenger: ${account.address}`);
  console.log(`Opponent: ${opponent}`);
  console.log(`Amount: ${amount} MON\n`);

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'createWager',
    args: [opponent as Address],
    value: wagerAmount,
  });

  console.log(`Transaction: ${hash}`);
  console.log('⏳ Waiting for confirmation...\n');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    console.log('✅ Wager created successfully!');
    console.log('Opponent has 1 hour to accept.');
  }
}

async function wagerInfo(publicClient: any, wagerIdStr: string) {
  if (!wagerIdStr) {
    console.log('❌ Usage: npx ts-node interact.ts wager-info <wagerId>');
    return;
  }

  const wagerId = BigInt(wagerIdStr);
  
  const wagerData = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getWager',
    args: [wagerId],
  });

  const [challenger, opponent, amount, createdAt, accepted, resolved] = wagerData;

  console.log(`⚔️  Wager #${wagerId}\n`);
  console.log(`Challenger: ${challenger}`);
  console.log(`Opponent: ${opponent}`);
  console.log(`Amount: ${formatEther(amount)} MON each`);
  console.log(`Total Pot: ${formatEther(amount * 2n)} MON`);
  console.log(`Created: ${new Date(Number(createdAt) * 1000).toLocaleString()}`);
  console.log(`Status: ${resolved ? '✅ Resolved' : accepted ? '⚔️ In Progress' : '⏳ Awaiting Acceptance'}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
