import { displayTransactionResult } from './display.js';

export async function executeTransactions(walletManager, transactions, tokenInfo, explorerUrl) {
  const results = [];
  
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    
    try {
      console.log(`Processing transaction ${i + 1}/${transactions.length}...`);
      
      const txResponse = await walletManager.sendToken(
        tx.address,
        tx.amount,
        tokenInfo.decimals
      );
      
      console.log('Transaction submitted, waiting for confirmation...');
      const receipt = await txResponse.wait();
      
      displayTransactionResult(
        i,
        transactions.length,
        tx.address,
        tx.amount.toFixed(2),
        tokenInfo.symbol,
        receipt.hash,
        explorerUrl
      );
      
      results.push({
        success: true,
        address: tx.address,
        amount: tx.amount,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
      });
      
    } catch (error) {
      console.error(`❌ Failed to send ${tx.amount} ${tokenInfo.symbol} to ${tx.address}`);
      console.error(`Error: ${error.message}\n`);
      
      results.push({
        success: false,
        address: tx.address,
        amount: tx.amount,
        error: error.message
      });
    }
  }
  
  return results;
}

export function displayFinalSummary(results, tokenSymbol) {
  console.log('\n=== PAYROLL EXECUTION SUMMARY ===\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful transactions: ${successful.length}`);
  console.log(`❌ Failed transactions: ${failed.length}`);
  
  if (successful.length > 0) {
    const totalSent = successful.reduce((sum, r) => sum + r.amount, 0);
    console.log(`💰 Total sent: ${totalSent.toFixed(2)} ${tokenSymbol}`);
  }
  
  if (failed.length > 0) {
    console.log('\nFailed transactions:');
    failed.forEach(r => {
      console.log(`- ${r.address}: ${r.amount} ${tokenSymbol} (${r.error})`);
    });
  }
  
  console.log('\nPayroll distribution complete!');
}