#!/usr/bin/env node

import dotenv from 'dotenv';
import { WalletManager } from './wallet.js';
import { parsePayrollFile, getTotalAmount } from './utils.js';
import { displayTransactionPreview } from './display.js';
import { askForConfirmation } from './prompt.js';
import { executeTransactions, displayFinalSummary } from './executor.js';

dotenv.config();

async function main() {
  const payrollFile = process.argv[2];
  
  if (!payrollFile) {
    console.error('Usage: node index.js <payroll-file.txt>');
    console.error('Example: node index.js example-payroll.txt');
    process.exit(1);
  }
  
  const requiredEnvVars = ['PRIVATE_KEY', 'RPC_URL', 'TOKEN_CONTRACT_ADDRESS', 'EXPLORER_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:');
    missingVars.forEach(varName => console.error(`- ${varName}`));
    console.error('\nPlease copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }
  
  try {
    console.log('🔄 Initializing payroll script...\n');
    
    const transactions = parsePayrollFile(payrollFile);
    
    if (transactions.length === 0) {
      console.error('No valid transactions found in the payroll file.');
      process.exit(1);
    }
    
    const walletManager = new WalletManager(
      process.env.PRIVATE_KEY,
      process.env.RPC_URL,
      process.env.TOKEN_CONTRACT_ADDRESS
    );
    
    console.log('📊 Fetching token information, wallet balance, and validating recipients...\n');
    
    const addresses = transactions.map(tx => tx.address);
    
    const [tokenInfo, balance, walletValidations] = await Promise.all([
      walletManager.getTokenInfo(),
      walletManager.getBalance(),
      walletManager.validateRecipientWallets(addresses)
    ]);
    
    const totalAmount = getTotalAmount(transactions);
    
    const hasSufficientFunds = await walletManager.checkSufficientFunds(totalAmount, tokenInfo.decimals);
    
    if (!hasSufficientFunds) {
      console.error(`❌ Insufficient funds!`);
      console.error(`Required: ${totalAmount.toFixed(2)} ${tokenInfo.symbol}`);
      console.error(`Available: ${balance.formatted} ${tokenInfo.symbol}`);
      process.exit(1);
    }
    
    displayTransactionPreview(
      transactions,
      tokenInfo.symbol,
      walletManager.getAddress(),
      balance.formatted,
      walletValidations
    );
    
    const shouldProceed = await askForConfirmation('Do you want to proceed with these transactions? (y/n): ');
    
    if (!shouldProceed) {
      console.log('❌ Payroll distribution cancelled.');
      process.exit(0);
    }
    
    console.log('\n🚀 Starting payroll distribution...\n');
    
    const results = await executeTransactions(
      walletManager,
      transactions,
      tokenInfo,
      process.env.EXPLORER_URL
    );
    
    displayFinalSummary(results, tokenInfo.symbol);
    
  } catch (error) {
    console.error('❌ Error during payroll execution:');
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);