import { formatUnits } from './wallet.js';

export function displaySkippedLines(skipped) {
  if (skipped.length === 0) return;
  console.log(`\n⚠️  Ignored ${skipped.length} line(s) in the input file:`);
  skipped.forEach(({ lineNumber, line, reason }) => {
    console.log(`  - line ${lineNumber}: ${reason} (${line})`);
  });
}

export function displayTokenOptions({ assetInfo, vaultInfo, assetBalance, vaultBalance, vaultAssetAddress, expectedAssetAddress }) {
  console.log('\n=== AVAILABLE PAYROLL TOKENS ===\n');
  console.log(`Asset  ${assetInfo.symbol} (${assetInfo.address}): ${assetBalance.formatted}`);
  console.log(`Vault  ${vaultInfo.symbol} (${vaultInfo.address}): ${vaultBalance.formatted}`);
  console.log(`Vault ERC4626 asset(): ${vaultAssetAddress}`);

  if (vaultAssetAddress.toLowerCase() !== expectedAssetAddress.toLowerCase()) {
    console.log('⚠️  Vault asset() does not match the configured token address.');
  }
}

export function displayTransactionPreview({
  transactions,
  paymentSymbol,
  paymentDecimals,
  senderAddress,
  balance,
  balanceRaw,
  walletValidations = [],
  inputSymbol,
  totalInputFormatted,
  totalPayoutFormatted,
  totalPayoutRaw
}) {
  console.log('\n=== PAYROLL TRANSACTION PREVIEW ===\n');

  console.log(`Sender address: ${senderAddress}`);
  console.log(`Input amounts denominated in: ${inputSymbol}`);
  console.log(`Payment token: ${paymentSymbol}`);
  console.log(`Current balance: ${balance} ${paymentSymbol}\n`);

  console.log(`Total input amount: ${totalInputFormatted} ${inputSymbol}`);
  console.log(`Total to distribute: ${totalPayoutFormatted} ${paymentSymbol}`);
  console.log(`Number of recipients: ${transactions.length}\n`);

  console.log('Recipients:');
  console.log('Input Amount         Payment Amount       Address                                     Status');
  console.log('-'.repeat(98));

  transactions.forEach((tx) => {
    const inputAmountStr = `${tx.inputFormatted} ${inputSymbol}`.padEnd(20);
    const payoutAmountStr = `${tx.payoutFormatted} ${paymentSymbol}`.padEnd(20);
    const validation = walletValidations.find(v => v.address === tx.address);

    let statusStr = '';
    if (validation && !validation.isActive) {
      statusStr = '⚠️  INACTIVE';
    } else if (validation) {
      statusStr = '✅ Active';
    }

    console.log(`${inputAmountStr} ${payoutAmountStr} ${tx.address} ${statusStr}`);
  });

  console.log('-'.repeat(98));
  console.log(`Total: ${totalPayoutFormatted} ${paymentSymbol}\n`);

  const remainingRaw = balanceRaw - totalPayoutRaw;
  console.log(`Remaining balance after distribution: ${formatUnits(remainingRaw, paymentDecimals)} ${paymentSymbol}\n`);
}

export function displayConversionPreview({ assetSymbol, vaultSymbol, totalAssetFormatted, totalSharesFormatted, assetBalance, vaultBalance }) {
  console.log('\n=== ERC4626 CONVERSION PREVIEW ===\n');
  console.log(`Need to deposit: ${totalAssetFormatted} ${assetSymbol}`);
  console.log(`Expected shares from previewMint: ${totalSharesFormatted} ${vaultSymbol}`);
  console.log(`Current ${assetSymbol} balance: ${assetBalance.formatted}`);
  console.log(`Current ${vaultSymbol} balance: ${vaultBalance.formatted}\n`);
}

export function displayTransactionResult(index, total, address, amount, tokenSymbol, txHash, explorerUrl) {
  const progress = `[${index + 1}/${total}]`;
  console.log(`${progress} Sent ${amount} ${tokenSymbol} to ${address}`);
  if (explorerUrl) {
    console.log(`Transaction: ${explorerUrl}${txHash}\n`);
  } else {
    console.log(`Transaction hash: ${txHash}\n`);
  }
}
