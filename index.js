#!/usr/bin/env node

import dotenv from 'dotenv';
import { WalletManager, VaultWalletManager, SDUSD_CONTRACT_ADDRESS, formatUnits, parseUnits } from './wallet.js';
import { parsePayrollFile, sumRaw } from './utils.js';
import { displayTokenChoice, displayTransactionPreview, displayConversionPreview } from './display.js';
import { askForChoice, askForConfirmation } from './prompt.js';
import { executeTransactions, displayFinalSummary } from './executor.js';

dotenv.config();

function requireEnvVars(names) {
  const missingVars = names.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:');
    missingVars.forEach(varName => console.error(`- ${varName}`));
    console.error('\nPlease copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }
}

async function buildDUsdTransactions(transactions, dUsdInfo) {
  return transactions.map(tx => {
    const inputRaw = parseUnits(tx.amountText, dUsdInfo.decimals);
    return {
      ...tx,
      inputRaw,
      payoutRaw: inputRaw,
      inputFormatted: formatUnits(inputRaw, dUsdInfo.decimals),
      payoutFormatted: formatUnits(inputRaw, dUsdInfo.decimals)
    };
  });
}

async function buildSdUsdTransactions(transactions, dUsdInfo, sdUsdInfo, sdUsdManager) {
  return Promise.all(transactions.map(async (tx) => {
    const inputRaw = parseUnits(tx.amountText, dUsdInfo.decimals);
    const payoutRaw = await sdUsdManager.previewDeposit(inputRaw);
    return {
      ...tx,
      inputRaw,
      payoutRaw,
      inputFormatted: formatUnits(inputRaw, dUsdInfo.decimals),
      payoutFormatted: formatUnits(payoutRaw, sdUsdInfo.decimals)
    };
  }));
}

async function main() {
  const payrollFile = process.argv[2];

  if (!payrollFile) {
    console.error('Usage: node index.js <payroll-file.txt>');
    console.error('Example: node index.js example-payroll.txt');
    process.exit(1);
  }

  requireEnvVars(['PRIVATE_KEY', 'RPC_URL', 'DUSD_CONTRACT_ADDRESS', 'EXPLORER_URL']);

  const dUsdAddress = process.env.DUSD_CONTRACT_ADDRESS;
  const sdUsdAddress = process.env.SDUSD_CONTRACT_ADDRESS || SDUSD_CONTRACT_ADDRESS;

  try {
    console.log('🔄 Initializing payroll script...\n');

    const parsedTransactions = parsePayrollFile(payrollFile);

    if (parsedTransactions.length === 0) {
      console.error('No valid transactions found in the payroll file.');
      process.exit(1);
    }

    const dUsdManager = new WalletManager(process.env.PRIVATE_KEY, process.env.RPC_URL, dUsdAddress);

    console.log('📊 Fetching dUSD information, balance, and validating recipients...\n');

    const addresses = parsedTransactions.map(tx => tx.address);
    const [dUsdInfo, walletValidations] = await Promise.all([
      dUsdManager.getTokenInfo(),
      dUsdManager.validateRecipientWallets(addresses)
    ]);

    const dUsdBalance = await dUsdManager.getBalance(dUsdInfo.decimals);

    console.log('\n=== AVAILABLE PAYROLL TOKENS ===\n');
    console.log(`dUSD  (${dUsdInfo.address}): ${dUsdBalance.formatted} ${dUsdInfo.symbol}`);
    console.log(`sdUSD (${sdUsdAddress}): available after selection`);

    const paymentChoice = await askForChoice('Pay in dUSD or sdUSD? (d/s): ', ['d', 's']);
    const payInSdUsd = paymentChoice === 's';

    let paymentManager = dUsdManager;
    let tokenInfo = dUsdInfo;
    let selectedBalance = dUsdBalance;
    let sdUsdManager = null;
    let sdUsdInfo = null;
    let sdUsdBalance = null;
    let transactions = await buildDUsdTransactions(parsedTransactions, dUsdInfo);

    if (payInSdUsd) {
      sdUsdManager = new VaultWalletManager(process.env.PRIVATE_KEY, process.env.RPC_URL, sdUsdAddress);

      console.log('\n📊 Fetching sdUSD vault information and balance...\n');

      const [fetchedSdUsdInfo, sdUsdAssetAddress] = await Promise.all([
        sdUsdManager.getTokenInfo(),
        sdUsdManager.getAssetAddress()
      ]);

      sdUsdInfo = fetchedSdUsdInfo;
      sdUsdBalance = await sdUsdManager.getBalance(sdUsdInfo.decimals);

      displayTokenChoice({
        dUsdInfo,
        sdUsdInfo,
        dUsdBalance,
        sdUsdBalance,
        sdUsdAssetAddress,
        expectedDUsdAddress: dUsdInfo.address
      });

      if (sdUsdAssetAddress.toLowerCase() !== dUsdInfo.address.toLowerCase()) {
        console.error('❌ Refusing to pay in sdUSD because vault asset() does not match configured dUSD.');
        process.exit(1);
      }

      paymentManager = sdUsdManager;
      tokenInfo = sdUsdInfo;
      selectedBalance = sdUsdBalance;
      transactions = await buildSdUsdTransactions(parsedTransactions, dUsdInfo, sdUsdInfo, sdUsdManager);
    }

    const totalInputRaw = sumRaw(transactions, 'inputRaw');
    const totalPayoutRaw = sumRaw(transactions, 'payoutRaw');
    const totalInputFormatted = formatUnits(totalInputRaw, dUsdInfo.decimals);
    const totalPayoutFormatted = formatUnits(totalPayoutRaw, tokenInfo.decimals);

    if (!payInSdUsd && dUsdBalance.raw < totalPayoutRaw) {
      console.error('❌ Insufficient dUSD funds!');
      console.error(`Required: ${totalPayoutFormatted} ${tokenInfo.symbol}`);
      console.error(`Available: ${dUsdBalance.formatted} ${tokenInfo.symbol}`);
      process.exit(1);
    }

    if (payInSdUsd && sdUsdBalance.raw < totalPayoutRaw) {
      const missingSharesRaw = totalPayoutRaw - sdUsdBalance.raw;
      const dUsdRequiredForConversionRaw = await sdUsdManager.previewMint(missingSharesRaw);

      displayConversionPreview({
        assetSymbol: dUsdInfo.symbol,
        vaultSymbol: sdUsdInfo.symbol,
        totalAssetFormatted: formatUnits(dUsdRequiredForConversionRaw, dUsdInfo.decimals),
        totalSharesFormatted: formatUnits(missingSharesRaw, sdUsdInfo.decimals),
        dUsdBalance,
        sdUsdBalance
      });

      if (dUsdBalance.raw < dUsdRequiredForConversionRaw) {
        console.error('❌ Insufficient funds for sdUSD payroll.');
        console.error(`Need sdUSD shortfall: ${formatUnits(missingSharesRaw, sdUsdInfo.decimals)} ${sdUsdInfo.symbol}`);
        console.error(`dUSD required to convert: ${formatUnits(dUsdRequiredForConversionRaw, dUsdInfo.decimals)} ${dUsdInfo.symbol}`);
        console.error(`Available dUSD: ${dUsdBalance.formatted} ${dUsdInfo.symbol}`);
        process.exit(1);
      }

      const shouldConvert = await askForConfirmation('Convert dUSD to sdUSD before payroll? (y/n): ');
      if (!shouldConvert) {
        console.log('❌ Payroll distribution cancelled.');
        process.exit(0);
      }

      console.log('\n🚀 Converting dUSD to sdUSD...\n');
      const depositTx = await sdUsdManager.deposit(dUsdManager, dUsdRequiredForConversionRaw);
      console.log('Deposit submitted, waiting for confirmation...');
      const receipt = await depositTx.wait();
      console.log(`Deposit confirmed: ${process.env.EXPLORER_URL}${receipt.hash}\n`);

      const refreshedSdUsdBalance = await sdUsdManager.getBalance(sdUsdInfo.decimals);
      selectedBalance = refreshedSdUsdBalance;
      if (refreshedSdUsdBalance.raw < totalPayoutRaw) {
        console.error('❌ sdUSD balance is still insufficient after conversion. Aborting before payroll transfers.');
        console.error(`Required: ${totalPayoutFormatted} ${sdUsdInfo.symbol}`);
        console.error(`Available: ${refreshedSdUsdBalance.formatted} ${sdUsdInfo.symbol}`);
        process.exit(1);
      }
    }

    displayTransactionPreview({
      transactions,
      tokenSymbol: tokenInfo.symbol,
      senderAddress: paymentManager.getAddress(),
      balance: selectedBalance.formatted,
      walletValidations,
      inputSymbol: dUsdInfo.symbol,
      totalInputFormatted,
      totalPayoutFormatted
    });

    const shouldProceed = await askForConfirmation('Do you want to proceed with these transactions? (y/n): ');

    if (!shouldProceed) {
      console.log('❌ Payroll distribution cancelled.');
      process.exit(0);
    }

    console.log('\n🚀 Starting payroll distribution...\n');

    const results = await executeTransactions(
      paymentManager,
      transactions,
      tokenInfo,
      process.env.EXPLORER_URL
    );

    displayFinalSummary(results, tokenInfo);
  } catch (error) {
    console.error('❌ Error during payroll execution:');
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);
