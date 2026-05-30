import { displayTransactionResult } from './display.js';
import { formatUnits } from './wallet.js';
import { formatError } from './errors.js';

export async function executeTransactions(walletManager, transactions, tokenInfo, explorerUrl, journal = null) {
  const results = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    try {
      console.log(`Processing transaction ${i + 1}/${transactions.length}...`);

      const txResponse = await walletManager.sendTokenRaw(tx.address, tx.payoutRaw);

      console.log('Transaction submitted, waiting for confirmation...');
      const receipt = await txResponse.wait();

      // Persist immediately so an interruption after this point is recoverable.
      if (journal) {
        journal.record(tx.address, {
          inputRaw: tx.inputRaw,
          payoutRaw: tx.payoutRaw,
          txHash: receipt.hash
        });
      }

      displayTransactionResult(
        i,
        transactions.length,
        tx.address,
        tx.payoutFormatted,
        tokenInfo.symbol,
        receipt.hash,
        explorerUrl
      );

      results.push({
        success: true,
        address: tx.address,
        inputRaw: tx.inputRaw,
        payoutRaw: tx.payoutRaw,
        payoutFormatted: tx.payoutFormatted,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
      });
    } catch (error) {
      const reason = formatError(error);
      console.error(`❌ Failed to send ${tx.payoutFormatted} ${tokenInfo.symbol} to ${tx.address}`);
      console.error(`Error: ${reason}\n`);

      results.push({
        success: false,
        address: tx.address,
        inputRaw: tx.inputRaw,
        payoutRaw: tx.payoutRaw,
        payoutFormatted: tx.payoutFormatted,
        error: reason
      });
    }
  }

  return results;
}

export function displayFinalSummary(results, tokenInfo) {
  const tokenSymbol = tokenInfo.symbol;
  console.log('\n=== PAYROLL EXECUTION SUMMARY ===\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful transactions: ${successful.length}`);
  console.log(`❌ Failed transactions: ${failed.length}`);

  if (successful.length > 0) {
    const totalSent = successful.reduce((sum, r) => sum + r.payoutRaw, 0n);
    console.log(`💰 Total sent: ${formatUnits(totalSent, tokenInfo.decimals)} ${tokenSymbol}`);
    console.log(`Base units sent: ${totalSent.toString()}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed transactions (safe to re-run; confirmed payments are skipped):');
    failed.forEach(r => {
      console.log(`- ${r.address}: ${r.payoutFormatted} ${tokenSymbol} (${r.error})`);
    });
  }

  console.log('\nPayroll distribution complete!');
}
