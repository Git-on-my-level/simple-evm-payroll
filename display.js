export function displayTransactionPreview(transactions, tokenSymbol, senderAddress, balance) {
  console.log('\n=== PAYROLL TRANSACTION PREVIEW ===\n');
  
  console.log(`Sender Address: ${senderAddress}`);
  console.log(`Token: ${tokenSymbol}`);
  console.log(`Current Balance: ${balance} ${tokenSymbol}\n`);
  
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  console.log(`Total to distribute: ${totalAmount.toFixed(2)} ${tokenSymbol}`);
  console.log(`Number of recipients: ${transactions.length}\n`);
  
  console.log('Recipients:');
  console.log('Amount\t\t\tAddress');
  console.log('-'.repeat(60));
  
  transactions.forEach((tx, index) => {
    const amountStr = tx.amount.toFixed(2).padEnd(15);
    console.log(`${amountStr}\t${tx.address}`);
  });
  
  console.log('-'.repeat(60));
  console.log(`Total: ${totalAmount.toFixed(2)} ${tokenSymbol}\n`);
  
  const remainingBalance = parseFloat(balance) - totalAmount;
  console.log(`Remaining balance after distribution: ${remainingBalance.toFixed(2)} ${tokenSymbol}\n`);
  
  return totalAmount;
}

export function displayTransactionResult(index, total, address, amount, tokenSymbol, txHash, explorerUrl) {
  const progress = `[${index + 1}/${total}]`;
  console.log(`${progress} Sent ${amount} ${tokenSymbol} to ${address}`);
  console.log(`Transaction: ${explorerUrl}${txHash}\n`);
}