const solc = require('solc');
const fs = require('fs');
const path = require('path');

// Create artifacts directory if it doesn't exist
const artifactsDir = path.join(__dirname, 'artifacts');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

// Read the contract source
const contractPath = path.join(__dirname, 'HollowsTreasury.sol');
const source = fs.readFileSync(contractPath, 'utf8');

// Prepare input for Solidity compiler
const input = {
  language: 'Solidity',
  sources: {
    'HollowsTreasury.sol': {
      content: source
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
      }
    }
  }
};

console.log('🔨 Compiling HollowsTreasury.sol...');

// Compile the contract
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  let hasError = false;
  output.errors.forEach((error) => {
    if (error.severity === 'error') {
      console.error('❌ Error:', error.formattedMessage);
      hasError = true;
    } else {
      console.warn('⚠️  Warning:', error.formattedMessage);
    }
  });
  
  if (hasError) {
    console.error('\n❌ Compilation failed with errors');
    process.exit(1);
  }
}

// Extract contract data
const contract = output.contracts['HollowsTreasury.sol']['HollowsTreasury'];

if (!contract) {
  console.error('❌ Contract not found in compilation output');
  process.exit(1);
}

const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

// Save artifacts
const abiPath = path.join(artifactsDir, 'HollowsTreasury.abi.json');
const bytecodePath = path.join(artifactsDir, 'HollowsTreasury.bin');
const combinedPath = path.join(artifactsDir, 'HollowsTreasury.json');

fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
fs.writeFileSync(bytecodePath, bytecode);
fs.writeFileSync(combinedPath, JSON.stringify({
  contractName: 'HollowsTreasury',
  abi: abi,
  bytecode: '0x' + bytecode
}, null, 2));

console.log('✅ Compilation successful!');
console.log(`📄 ABI saved to: ${abiPath}`);
console.log(`📄 Bytecode saved to: ${bytecodePath}`);
console.log(`📄 Combined artifact saved to: ${combinedPath}`);
console.log(`\n📊 Contract size: ${bytecode.length / 2} bytes`);
