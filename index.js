#!/usr/bin/env node

import { loadConfig } from './config.js';
import { WalletManager, VaultWalletManager, formatUnits, parseUnits } from './wallet.js';
import { parsePayrollFile, sumRaw } from './utils.js';
import {
  displaySkippedLines,
  displayTokenOptions,
  displayTransactionPreview,
  displayConversionPreview
} from './display.js';
import { askForChoice, askForConfirmation } from './prompt.js';
import { executeTransactions, displayFinalSummary } from './executor.js';

const HELP = `Simple EVM Payroll — batch-send an ERC20 token to many recipients.

Usage:
  node index.js <recipients-file> [--dry-run]

Arguments:
  <recipients-file>   File with one "<amount> <address>" pair per line.
                      Separators may be tab, comma, or whitespace.
                      Blank lines and lines starting with '#' are ignored.

Options:
  --dry-run           Validate, preview, and price everything without sending
                      any transactions.
  -h, --help          Show this help.

Configuration is read from environment variables (see .env.example).`;

function parseArgs(argv) {
  const args = { file: null, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (!args.file) args.file = arg;
  }
  return args;
}

/**
 * Converts each parsed row into base units of the asset. Throws a clear,
 * row-attributed error if an amount cannot be represented at the token's
 * precision (e.g. too many decimal places).
 */
function buildAssetTransactions(transactions, assetInfo) {
  return transactions.map((tx) => {
    let inputRaw;
    try {
      inputRaw = parseUnits(tx.amountText, assetInfo.decimals);
    } catch {
      throw new Error(
        `Amount "${tx.amountText}" for ${tx.address} has more precision than ` +
        `${assetInfo.symbol} supports (${assetInfo.decimals} decimals).`
      );
    }
    return {
      ...tx,
      inputRaw,
      payoutRaw: inputRaw,
      inputFormatted: formatUnits(inputRaw, assetInfo.decimals),
      payoutFormatted: formatUnits(inputRaw, assetInfo.decimals)
    };
  });
}

async function buildVaultTransactions(transactions, assetInfo, vaultInfo, vaultManager) {
  const assetTransactions = buildAssetTransactions(transactions, assetInfo);
  return Promise.all(
    assetTransactions.map(async (tx) => {
      const payoutRaw = await vaultManager.previewDeposit(tx.inputRaw);
      return {
        ...tx,
        payoutRaw,
        payoutFormatted: formatUnits(payoutRaw, vaultInfo.decimals)
      };
    })
  );
}

async function main() {
  const { file, dryRun, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!file) {
    console.error('Error: no recipients file provided.\n');
    console.error(HELP);
    process.exit(1);
  }

  const config = loadConfig();

  console.log('🔄 Initializing payroll script...\n');

  const { transactions: parsedTransactions, skipped } = parsePayrollFile(file);
  displaySkippedLines(skipped);

  if (parsedTransactions.length === 0) {
    console.error('\nNo valid transactions found in the recipients file.');
    process.exit(1);
  }

  const assetManager = new WalletManager(config.privateKey, config.rpcUrl, config.tokenAddress, {
    gasOverrides: config.gasOverrides
  });

  await assetManager.assertChainId(config.chainId);

  console.log('📊 Fetching token info, balance, and validating recipients...\n');

  const addresses = parsedTransactions.map((tx) => tx.address);
  const [assetInfo, walletValidations] = await Promise.all([
    assetManager.getTokenInfo(),
    assetManager.validateRecipientWallets(addresses)
  ]);

  const assetBalance = await assetManager.getBalance(assetInfo.decimals);

  console.log('\n=== AVAILABLE PAYROLL TOKENS ===\n');
  console.log(`Asset ${assetInfo.symbol} (${assetInfo.address}): ${assetBalance.formatted}`);

  let payInVault = false;
  if (config.vaultAddress) {
    console.log(`Vault (${config.vaultAddress}): available after selection`);
    const choice = await askForChoice(
      `Pay in ${assetInfo.symbol} (asset) or vault shares? (a/v): `,
      ['a', 'v']
    );
    payInVault = choice === 'v';
  }

  let paymentManager = assetManager;
  let paymentInfo = assetInfo;
  let selectedBalance = assetBalance;
  let vaultManager = null;
  let vaultInfo = null;
  let vaultBalance = null;
  let transactions = buildAssetTransactions(parsedTransactions, assetInfo);

  if (payInVault) {
    vaultManager = new VaultWalletManager(config.privateKey, config.rpcUrl, config.vaultAddress, {
      gasOverrides: config.gasOverrides
    });

    console.log('\n📊 Fetching vault information and balance...\n');

    const [fetchedVaultInfo, vaultAssetAddress] = await Promise.all([
      vaultManager.getTokenInfo(),
      vaultManager.getAssetAddress()
    ]);

    vaultInfo = fetchedVaultInfo;
    vaultBalance = await vaultManager.getBalance(vaultInfo.decimals);

    displayTokenOptions({
      assetInfo,
      vaultInfo,
      assetBalance,
      vaultBalance,
      vaultAssetAddress,
      expectedAssetAddress: assetInfo.address
    });

    if (vaultAssetAddress.toLowerCase() !== assetInfo.address.toLowerCase()) {
      console.error("❌ Refusing to pay in vault shares because the vault's asset() does not match TOKEN_ADDRESS.");
      process.exit(1);
    }

    paymentManager = vaultManager;
    paymentInfo = vaultInfo;
    selectedBalance = vaultBalance;
    transactions = await buildVaultTransactions(parsedTransactions, assetInfo, vaultInfo, vaultManager);
  }

  const totalInputRaw = sumRaw(transactions, 'inputRaw');
  const totalPayoutRaw = sumRaw(transactions, 'payoutRaw');
  const totalInputFormatted = formatUnits(totalInputRaw, assetInfo.decimals);
  const totalPayoutFormatted = formatUnits(totalPayoutRaw, paymentInfo.decimals);

  if (!payInVault && assetBalance.raw < totalPayoutRaw) {
    console.error(`❌ Insufficient ${assetInfo.symbol} funds!`);
    console.error(`Required: ${totalPayoutFormatted} ${paymentInfo.symbol}`);
    console.error(`Available: ${assetBalance.formatted} ${paymentInfo.symbol}`);
    process.exit(1);
  }

  if (payInVault && vaultBalance.raw < totalPayoutRaw) {
    const missingSharesRaw = totalPayoutRaw - vaultBalance.raw;
    const assetRequiredForConversionRaw = await vaultManager.previewMint(missingSharesRaw);

    displayConversionPreview({
      assetSymbol: assetInfo.symbol,
      vaultSymbol: vaultInfo.symbol,
      totalAssetFormatted: formatUnits(assetRequiredForConversionRaw, assetInfo.decimals),
      totalSharesFormatted: formatUnits(missingSharesRaw, vaultInfo.decimals),
      assetBalance,
      vaultBalance
    });

    if (assetBalance.raw < assetRequiredForConversionRaw) {
      console.error('❌ Insufficient funds for vault payroll.');
      console.error(`Vault shares shortfall: ${formatUnits(missingSharesRaw, vaultInfo.decimals)} ${vaultInfo.symbol}`);
      console.error(`${assetInfo.symbol} required to convert: ${formatUnits(assetRequiredForConversionRaw, assetInfo.decimals)}`);
      console.error(`Available ${assetInfo.symbol}: ${assetBalance.formatted}`);
      process.exit(1);
    }

    if (dryRun) {
      console.log('🔎 Dry run: would convert asset to vault shares, but skipping the deposit.');
    } else {
      const shouldConvert = await askForConfirmation(
        `Convert ${assetInfo.symbol} to ${vaultInfo.symbol} before payroll? (y/n): `
      );
      if (!shouldConvert) {
        console.log('❌ Payroll distribution cancelled.');
        process.exit(0);
      }

      console.log(`\n🚀 Converting ${assetInfo.symbol} to ${vaultInfo.symbol}...\n`);
      const depositTx = await vaultManager.deposit(assetManager, assetRequiredForConversionRaw);
      console.log('Deposit submitted, waiting for confirmation...');
      const receipt = await depositTx.wait();
      const link = config.explorerUrl ? `${config.explorerUrl}${receipt.hash}` : receipt.hash;
      console.log(`Deposit confirmed: ${link}\n`);

      const refreshedVaultBalance = await vaultManager.getBalance(vaultInfo.decimals);
      selectedBalance = refreshedVaultBalance;
      // previewMint/previewDeposit rounding can leave a sub-unit shortfall; abort
      // cleanly rather than sending a partial payroll.
      if (refreshedVaultBalance.raw < totalPayoutRaw) {
        console.error('❌ Vault balance is still insufficient after conversion. Aborting before payroll transfers.');
        console.error(`Required: ${totalPayoutFormatted} ${vaultInfo.symbol}`);
        console.error(`Available: ${refreshedVaultBalance.formatted} ${vaultInfo.symbol}`);
        process.exit(1);
      }
    }
  }

  displayTransactionPreview({
    transactions,
    paymentSymbol: paymentInfo.symbol,
    paymentDecimals: paymentInfo.decimals,
    senderAddress: paymentManager.getAddress(),
    balance: selectedBalance.formatted,
    balanceRaw: selectedBalance.raw,
    walletValidations,
    inputSymbol: assetInfo.symbol,
    totalInputFormatted,
    totalPayoutFormatted,
    totalPayoutRaw
  });

  if (dryRun) {
    console.log('🔎 Dry run complete. No transactions were sent.');
    process.exit(0);
  }

  const shouldProceed = await askForConfirmation('Do you want to proceed with these transactions? (y/n): ');

  if (!shouldProceed) {
    console.log('❌ Payroll distribution cancelled.');
    process.exit(0);
  }

  console.log('\n🚀 Starting payroll distribution...\n');

  const results = await executeTransactions(paymentManager, transactions, paymentInfo, config.explorerUrl);

  displayFinalSummary(results, paymentInfo);

  const anyFailed = results.some((r) => !r.success);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Error during payroll execution:');
  console.error(error.message);
  process.exit(1);
});
