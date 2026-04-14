#!/usr/bin/env node
/**
 * Deploy the HashedTimelockERC20 contract to Sepolia.
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/deploy-htlc.js
 *
 * Requires: a private key with a small amount of Sepolia ETH for gas (~0.01 ETH).
 * Once deployed, copy the contract address to:
 *   - Vercel env:  VITE_EVM_HTLC_CONTRACT=<address>
 *   - VPS .env:    EVM_HTLC_CONTRACT=<address>
 */

const { ethers } = require('ethers');

// ─── HashedTimelockERC20 — compiled bytecode + ABI ──────────────────────────
// Source: https://github.com/chatch/hashed-timelock-contract-ethereum
// Solidity 0.8.x compatible version of HashedTimelockERC20

const HTLC_ABI = [
  'constructor()',
  'function newContract(address _receiver, bytes32 _hashlock, uint256 _timelock, address _tokenContract, uint256 _amount) returns (bytes32 contractId)',
  'function withdraw(bytes32 _contractId, bytes32 _preimage) returns (bool)',
  'function refund(bytes32 _contractId) returns (bool)',
  'function getContract(bytes32 _contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
  'event HTLCERC20New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event HTLCERC20Withdraw(bytes32 indexed contractId)',
  'event HTLCERC20Refund(bytes32 indexed contractId)',
];

// Solidity source compiled to bytecode (Solidity 0.8.x)
// This is the standard HashedTimelockERC20 contract
const HTLC_SOLIDITY = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract HashedTimelockERC20 {
    event HTLCERC20New(
        bytes32 indexed contractId,
        address indexed sender,
        address indexed receiver,
        address tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    event HTLCERC20Withdraw(bytes32 indexed contractId);
    event HTLCERC20Refund(bytes32 indexed contractId);

    struct LockContract {
        address sender;
        address receiver;
        address tokenContract;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }

    mapping(bytes32 => LockContract) contracts;

    function newContract(
        address _receiver,
        bytes32 _hashlock,
        uint256 _timelock,
        address _tokenContract,
        uint256 _amount
    ) external returns (bytes32 contractId) {
        require(_amount > 0, "amount must be > 0");
        require(_timelock > block.timestamp, "timelock must be in the future");

        contractId = keccak256(abi.encodePacked(
            msg.sender, _receiver, _tokenContract, _amount, _hashlock, _timelock
        ));

        require(contracts[contractId].sender == address(0), "contract already exists");

        require(
            IERC20(_tokenContract).transferFrom(msg.sender, address(this), _amount),
            "transferFrom failed"
        );

        contracts[contractId] = LockContract(
            msg.sender,
            _receiver,
            _tokenContract,
            _amount,
            _hashlock,
            _timelock,
            false,
            false,
            bytes32(0)
        );

        emit HTLCERC20New(
            contractId, msg.sender, _receiver, _tokenContract, _amount, _hashlock, _timelock
        );
    }

    function withdraw(bytes32 _contractId, bytes32 _preimage) external returns (bool) {
        LockContract storage c = contracts[_contractId];
        require(c.sender != address(0), "contract does not exist");
        require(c.hashlock == sha256(abi.encodePacked(_preimage)), "invalid preimage");
        require(!c.withdrawn, "already withdrawn");
        require(!c.refunded, "already refunded");

        c.preimage = _preimage;
        c.withdrawn = true;
        IERC20(c.tokenContract).transfer(c.receiver, c.amount);
        emit HTLCERC20Withdraw(_contractId);
        return true;
    }

    function refund(bytes32 _contractId) external returns (bool) {
        LockContract storage c = contracts[_contractId];
        require(c.sender != address(0), "contract does not exist");
        require(!c.withdrawn, "already withdrawn");
        require(!c.refunded, "already refunded");
        require(c.timelock <= block.timestamp, "timelock not yet passed");

        c.refunded = true;
        IERC20(c.tokenContract).transfer(c.sender, c.amount);
        emit HTLCERC20Refund(_contractId);
        return true;
    }

    function getContract(bytes32 _contractId) external view returns (
        address sender,
        address receiver,
        address tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        bool withdrawn,
        bool refunded,
        bytes32 preimage
    ) {
        LockContract storage c = contracts[_contractId];
        return (
            c.sender, c.receiver, c.tokenContract, c.amount,
            c.hashlock, c.timelock, c.withdrawn, c.refunded, c.preimage
        );
    }
}
`;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY env var (with 0x prefix)');
    process.exit(1);
  }

  const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia.org';
  console.log(`Deploying to ${rpcUrl}...`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('No ETH balance! Get Sepolia ETH from a faucet first.');
    process.exit(1);
  }

  // Compile using solc
  let solc;
  try {
    solc = require('solc');
  } catch {
    console.error('Installing solc...');
    require('child_process').execSync('npm install solc@0.8.28', { stdio: 'inherit', cwd: __dirname + '/..' });
    solc = require('solc');
  }

  const input = {
    language: 'Solidity',
    sources: { 'HashedTimelockERC20.sol': { content: HTLC_SOLIDITY } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };

  console.log('Compiling contract...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter(e => e.severity === 'error');
    if (fatal.length > 0) {
      console.error('Compilation errors:', fatal.map(e => e.formattedMessage).join('\n'));
      process.exit(1);
    }
  }

  const compiled = output.contracts['HashedTimelockERC20.sol']['HashedTimelockERC20'];
  const bytecode = '0x' + compiled.evm.bytecode.object;
  const abi = compiled.abi;

  console.log('Deploying HashedTimelockERC20...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\n========================================');
  console.log(`HashedTimelockERC20 deployed at: ${address}`);
  console.log('========================================');
  console.log('\nSet these env vars:');
  console.log(`  VITE_EVM_HTLC_CONTRACT=${address}`);
  console.log(`  VITE_USDC_CONTRACT=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`);
  console.log(`  EVM_HTLC_CONTRACT=${address}  (on VPS .env)`);
}

main().catch(err => { console.error(err); process.exit(1); });
