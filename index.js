#!/usr/bin/env node

import { loadConfig } from './config.js';
import { WalletManager, VaultWalletManager, formatUnits, parseUnits } from './wallet.js';
import { parsePayrollFile, sumRaw } from './utils.js';
import { PaymentJournal } from './journal.js';
import {
  displaySkippedLines,
  displayTokenOptions,
  displayTransactionPreview,
  displayConversionPreview,
  displayAlreadyPaid
} from './display.js';
import { askForChoice, askForConfirmation } from './prompt.js';
import { executeTransactions, displayFinalSummary } from './executor.js';
import { formatError } from './errors.js';

const EXIT = { OK: 0, ERROR: 1, CANCELLED: 2 };

const HELP = `Simple EVM Payroll — batch-send an ERC20 token to many recipients.

Usage:
  node index.js <recipients-file> [--dry-run]

Arguments:
  <recipients-file>   File with one "<amount> <address>" pair per line.
                      Separators may be tab, comma, or whitespace.
                      Blank lines and lines starting with '#' are ignored.

Options:
  --dry-run           Validate, preview, and price everything without sending
                      any transactions. (Or set DRY_RUN=1.)
  -h, --help          Show this help.

Note: when running via npm, pass args after '--', e.g.
  npm start -- recipients.tsv --dry-run

Re-runs are safe: each confirmed payment is recorded in
<recipients-file>.journal.json and skipped on subsequent runs, so an
interrupted or partially failed payroll resumes where it left off.

Configuration is read from environment variables (see .env.example).`;

function parseArgs(argv) {
  const args = { file: null, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}\n`);
      console.error(HELP);
      process.exit(EXIT.ERROR);
    } else if (!args.file) args.file = arg;
  }
  return args;
}

function countDecimals(amountText) {
  const dot = amountText.indexOf('.');
  return dot === -1 ? 0 : amountText.length - dot - 1;
}

/**
 * Converts each parsed row into base units of the asset, attributing failures
 * to the offending recipient with an accurate reason.
 */
function buildAssetTransactions(transactions, assetInfo) {
  return transactions.map((tx) => {
    let inputRaw;
    try {
      inputRaw = parseUnits(tx.amountText, assetInfo.decimals);
    } catch (err) {
      if (countDecimals(tx.amountText) > assetInfo.decimals) {
        throw new Error(
          `Amount "${tx.amountText}" for ${tx.address} has more precision than ` +
          `${assetInfo.symbol} supports (${assetInfo.decimals} decimals).`
        );
      }
      throw new Error(`Could not parse amount "${tx.amountText}" for ${tx.address}: ${formatError(err)}`);
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
  const { file, dryRun: dryRunFlag, help } = parseArgs(process.argv.slice(2));
  const dryRun = dryRunFlag || /^(1|true|yes)$/i.test(process.env.DRY_RUN?.trim() || '');

  if (help) {
    console.log(HELP);
    process.exit(EXIT.OK);
  }

  if (!file) {
    console.error('Error: no recipients file provided.\n');
    console.error(HELP);
    process.exit(EXIT.ERROR);
  }

  const config = loadConfig();

  console.log(dryRun ? '🔎 DRY RUN — no transactions will be sent.\n' : '🔄 Initializing payroll script...\n');

  const { transactions: parsedTransactions, skipped } = parsePayrollFile(file);
  displaySkippedLines(skipped);

  if (parsedTransactions.length === 0) {
    console.error('\nNo valid transactions found in the recipients file.');
    process.exit(EXIT.ERROR);
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
  let allTransactions = buildAssetTransactions(parsedTransactions, assetInfo);

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
      process.exit(EXIT.ERROR);
    }

    paymentManager = vaultManager;
    paymentInfo = vaultInfo;
    selectedBalance = vaultBalance;
    allTransactions = await buildVaultTransactions(parsedTransactions, assetInfo, vaultInfo, vaultManager);
  }

  // Load the per-file journal and skip recipients already paid for this token.
  const journal = PaymentJournal.load(file, {
    chainId: config.chainId ?? 0,
    paymentToken: paymentInfo.address,
    paymentSymbol: paymentInfo.symbol
  });

  if (journal.staleIgnored) {
    console.log(`\n⚠️  An existing journal at ${journal.path} is for a different chain/token and will be ignored.`);
  }

  const alreadyPaid = [];
  const transactions = [];
  for (const tx of allTransactions) {
    const entry = journal.getConfirmed(tx.address, tx.inputRaw, (prev) => {
      console.log(
        `⚠️  ${tx.address} was previously paid for input ` +
        `${formatUnits(BigInt(prev.inputRaw), assetInfo.decimals)} ${assetInfo.symbol}, ` +
        `but the file now lists ${tx.inputFormatted} ${assetInfo.symbol}; it will be paid again.`
      );
    });
    if (entry) alreadyPaid.push({ ...tx, txHash: entry.txHash });
    else transactions.push(tx);
  }

  displayAlreadyPaid(alreadyPaid, assetInfo.symbol, journal.path, config.explorerUrl);

  if (transactions.length === 0) {
    console.log('\n✅ All recipients are already paid according to the journal. Nothing to do.');
    process.exit(EXIT.OK);
  }

  const totalInputRaw = sumRaw(transactions, 'inputRaw');
  const totalPayoutRaw = sumRaw(transactions, 'payoutRaw');
  const totalInputFormatted = formatUnits(totalInputRaw, assetInfo.decimals);
  const totalPayoutFormatted = formatUnits(totalPayoutRaw, paymentInfo.decimals);

  if (!payInVault && assetBalance.raw < totalPayoutRaw) {
    console.error(`❌ Insufficient ${assetInfo.symbol} funds!`);
    console.error(`Required: ${totalPayoutFormatted} ${paymentInfo.symbol}`);
    console.error(`Available: ${assetBalance.formatted} ${paymentInfo.symbol}`);
    if (!dryRun) process.exit(EXIT.ERROR);
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
      if (!dryRun) process.exit(EXIT.ERROR);
    } else if (dryRun) {
      console.log(`🔎 Dry run: would convert ${assetInfo.symbol} to ${vaultInfo.symbol} before payroll.`);
    } else {
      const shouldConvert = await askForConfirmation(
        `Convert ${assetInfo.symbol} to ${vaultInfo.symbol} before payroll? (y/n): `
      );
      if (!shouldConvert) {
        console.log('❌ Payroll distribution cancelled.');
        process.exit(EXIT.CANCELLED);
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
        process.exit(EXIT.ERROR);
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
    process.exit(EXIT.OK);
  }

  console.log(
    `⚠️  LIVE RUN: about to send ${transactions.length} transfer(s) totaling ` +
    `${totalPayoutFormatted} ${paymentInfo.symbol} on chain ${config.chainId ?? 'unknown'}.`
  );

  const shouldProceed = await askForConfirmation('Do you want to proceed with these transactions? (y/n): ');

  if (!shouldProceed) {
    console.log('❌ Payroll distribution cancelled.');
    process.exit(EXIT.CANCELLED);
  }

  console.log('\n🚀 Starting payroll distribution...\n');

  const results = await executeTransactions(paymentManager, transactions, paymentInfo, config.explorerUrl, journal);

  displayFinalSummary(results, paymentInfo);

  const anyFailed = results.some((r) => !r.success);
  process.exit(anyFailed ? EXIT.ERROR : EXIT.OK);
}

main().catch((error) => {
  console.error('❌ Error during payroll execution:');
  console.error(formatError(error));
  process.exit(EXIT.ERROR);
});
