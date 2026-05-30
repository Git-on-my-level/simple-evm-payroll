import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

function fail(message) {
  console.error(`❌ Configuration error: ${message}`);
  console.error('\nCopy .env.example to .env and fill in the required values.');
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    fail(`missing required environment variable ${name}`);
  }
  return value.trim();
}

function optionalAddress(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return null;
  }
  if (!ethers.isAddress(value.trim())) {
    fail(`${name} is not a valid address: ${value}`);
  }
  return ethers.getAddress(value.trim());
}

function requiredAddress(name) {
  const value = requireEnv(name);
  if (!ethers.isAddress(value)) {
    fail(`${name} is not a valid address: ${value}`);
  }
  return ethers.getAddress(value);
}

function optionalGweiToWei(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return null;
  }
  try {
    return ethers.parseUnits(value.trim(), 'gwei');
  } catch {
    fail(`${name} must be a number in gwei, got: ${value}`);
  }
}

/**
 * Loads, validates, and normalizes configuration from the environment.
 * Exits the process with a clear message if anything required is missing
 * or malformed, so failures happen before any on-chain action.
 */
export function loadConfig() {
  const privateKey = requireEnv('PRIVATE_KEY');
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  try {
    // Validate without keeping the throwaway wallet around.
    new ethers.Wallet(normalizedKey);
  } catch {
    fail('PRIVATE_KEY is not a valid private key');
  }

  const allowAnyChain = /^(1|true|yes)$/i.test(process.env.ALLOW_ANY_CHAIN?.trim() || '');
  const chainIdRaw = process.env.CHAIN_ID?.trim();
  let chainId = null;
  if (chainIdRaw) {
    chainId = Number(chainIdRaw);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      fail(`CHAIN_ID must be a positive integer, got: ${chainIdRaw}`);
    }
  } else if (!allowAnyChain) {
    fail('CHAIN_ID is required so the script can verify it is on the right network. ' +
      'Set CHAIN_ID in .env, or set ALLOW_ANY_CHAIN=1 to bypass this check (not recommended).');
  }

  let explorerUrl = process.env.EXPLORER_URL?.trim() || null;
  if (explorerUrl && !explorerUrl.endsWith('/')) {
    explorerUrl += '/';
  }

  const maxFeePerGas = optionalGweiToWei('MAX_FEE_PER_GAS_GWEI');
  const maxPriorityFeePerGas = optionalGweiToWei('MAX_PRIORITY_FEE_PER_GAS_GWEI');

  const gasOverrides = {};
  if (maxFeePerGas !== null) gasOverrides.maxFeePerGas = maxFeePerGas;
  if (maxPriorityFeePerGas !== null) gasOverrides.maxPriorityFeePerGas = maxPriorityFeePerGas;

  return {
    privateKey: normalizedKey,
    rpcUrl: requireEnv('RPC_URL'),
    tokenAddress: requiredAddress('TOKEN_ADDRESS'),
    vaultAddress: optionalAddress('VAULT_ADDRESS'),
    explorerUrl,
    chainId,
    gasOverrides
  };
}
