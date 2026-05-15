export function displayTokenChoice({ dUsdInfo, sdUsdInfo, dUsdBalance, sdUsdBalance, sdUsdAssetAddress, expectedDUsdAddress }) {
  console.log('\n=== AVAILABLE PAYROLL TOKENS ===\n');
  console.log(`dUSD  (${dUsdInfo.address}): ${dUsdBalance.formatted} ${dUsdInfo.symbol}`);
  console.log(`sdUSD (${sdUsdInfo.address}): ${sdUsdBalance.formatted} ${sdUsdInfo.symbol}`);
  console.log(`sdUSD ERC4626 asset(): ${sdUsdAssetAddress}`);

  if (sdUsdAssetAddress.toLowerCase() !== expectedDUsdAddress.toLowerCase()) {
    console.log('⚠️  sdUSD asset() does not match configured dUSD address. Refusing sdUSD payroll is recommended.');
  }
}

export function displayTransactionPreview({ transactions, tokenSymbol, senderAddress, balance, walletValidations = [], inputSymbol = 'dUSD', totalInputFormatted, totalPayoutFormatted }) {
  console.log('\n=== PAYROLL TRANSACTION PREVIEW ===\n');

  console.log(`Sender Address: ${senderAddress}`);
  console.log(`Payroll file amounts: ${inputSymbol}`);
  console.log(`Payment token: ${tokenSymbol}`);
  console.log(`Current Balance: ${balance} ${tokenSymbol}\n`);

  console.log(`Total payroll amount: ${totalInputFormatted} ${inputSymbol}`);
  console.log(`Total to distribute: ${totalPayoutFormatted} ${tokenSymbol}`);
  console.log(`Number of recipients: ${transactions.length}\n`);

  console.log('Recipients:');
  console.log('Payroll Amount       Payment Amount       Address                                     Status');
  console.log('-'.repeat(98));

  transactions.forEach((tx) => {
    const inputAmountStr = `${tx.inputFormatted} ${inputSymbol}`.padEnd(20);
    const payoutAmountStr = `${tx.payoutFormatted} ${tokenSymbol}`.padEnd(20);
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
  console.log(`Total: ${totalPayoutFormatted} ${tokenSymbol}\n`);

  const remainingBalance = Number(balance) - Number(totalPayoutFormatted);
  console.log(`Remaining balance after distribution: ${remainingBalance.toFixed(6)} ${tokenSymbol}\n`);
}

export function displayConversionPreview({ assetSymbol, vaultSymbol, totalAssetFormatted, totalSharesFormatted, dUsdBalance, sdUsdBalance }) {
  console.log('\n=== ERC4626 CONVERSION PREVIEW ===\n');
  console.log(`Need to deposit: ${totalAssetFormatted} ${assetSymbol}`);
  console.log(`Expected shares from previewDeposit: ${totalSharesFormatted} ${vaultSymbol}`);
  console.log(`Current dUSD balance: ${dUsdBalance.formatted} ${assetSymbol}`);
  console.log(`Current sdUSD balance: ${sdUsdBalance.formatted} ${vaultSymbol}\n`);
}

export function displayTransactionResult(index, total, address, amount, tokenSymbol, txHash, explorerUrl) {
  const progress = `[${index + 1}/${total}]`;
  console.log(`${progress} Sent ${amount} ${tokenSymbol} to ${address}`);
  console.log(`Transaction: ${explorerUrl}${txHash}\n`);
}
