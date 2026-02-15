import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseEther,
  formatEther,
  type Address,
  type Hash
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Monad Mainnet
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
    },
    public: {
      http: ['https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://monadscan.com' },
  },
});

const INITIAL_ENTRY_FEE = parseEther('10'); // 10 MON initial entry fee

async function main() {
  console.log('🌑 Deploying HollowsTreasury to Monad Mainnet...\n');

  // Check if contract is compiled
  const artifactsPath = path.join(__dirname, 'artifacts', 'HollowsTreasury.json');
  if (!fs.existsSync(artifactsPath)) {
    console.error('❌ Contract not compiled!');
    console.error('Run: npm run compile');
    process.exit(1);
  }

  // Load compiled contract
  const artifact = JSON.parse(fs.readFileSync(artifactsPath, 'utf-8'));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode as `0x${string}`;

  console.log('✅ Contract artifacts loaded');
  console.log(`📊 Bytecode size: ${bytecode.length / 2 - 1} bytes\n`);

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`📍 Deploying from: ${account.address}\n`);

  // Create clients
  const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadMainnet,
    transport: http(),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Account balance: ${formatEther(balance)} MON`);
  
  if (balance === 0n) {
    throw new Error('Insufficient balance. Please fund your account with MON tokens.');
  }

  console.log(`\n🚀 Deploying contract with initial entry fee: ${formatEther(INITIAL_ENTRY_FEE)} MON`);
  console.log('⏳ Waiting for transaction...\n');

  // Deploy contract
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [INITIAL_ENTRY_FEE],
  });

  console.log(`📤 Transaction hash: ${hash}`);
  console.log('⏳ Waiting for confirmation...\n');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    console.log('✅ Contract deployed successfully!');
    console.log(`📍 Contract address: ${receipt.contractAddress}`);
    console.log(`🔗 Explorer: https://monadscan.com/address/${receipt.contractAddress}`);
    console.log(`⚙️  Initial entry fee: ${formatEther(INITIAL_ENTRY_FEE)} MON`);
    
    // Save deployment info
    const deploymentInfo = {
      network: 'monad-mainnet',
      chainId: 143,
      contractAddress: receipt.contractAddress,
      deployer: account.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      timestamp: new Date().toISOString(),
      initialEntryFee: formatEther(INITIAL_ENTRY_FEE),
      gasUsed: receipt.gasUsed.toString(),
    };
    
    const deploymentPath = path.join(__dirname, 'deployment.json');
    fs.writeFileSync(
      deploymentPath,
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(`\n💾 Deployment info saved to ${deploymentPath}`);
    
    // Also save to .env for easy access
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    
    // Remove old CONTRACT_ADDRESS if exists
    envContent = envContent.split('\n').filter(line => !line.startsWith('CONTRACT_ADDRESS=')).join('\n');
    envContent += `\nCONTRACT_ADDRESS=${receipt.contractAddress}\n`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('💾 Contract address saved to .env');
  } else {
    console.error('❌ Deployment failed');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment error:', error);
    process.exit(1);
  });
