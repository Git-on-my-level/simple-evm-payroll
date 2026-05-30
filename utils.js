import fs from 'fs';
import { ethers } from 'ethers';

/**
 * Parses a payroll/recipients file into normalized transactions.
 *
 * Each non-empty, non-comment line must contain an amount and a recipient
 * address separated by a tab, comma, or whitespace, e.g.:
 *
 *   1250.50    0xabc...
 *   1250.50,0xabc...
 *
 * Returns `{ transactions, skipped }`. `skipped` lists lines that were ignored
 * (with a reason) so the caller can surface them instead of silently
 * underpaying. Amounts are kept as their original text to preserve precision;
 * they are converted to base units later once token decimals are known.
 */
export function parsePayrollFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const transactions = [];
  const skipped = [];
  const seen = new Map();

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      return;
    }

    const parts = line.split(/[\t,\s]+/).filter(Boolean);
    if (parts.length < 2) {
      skipped.push({ lineNumber, line, reason: 'expected "<amount> <address>"' });
      return;
    }

    const amountText = parts[0];
    const addressText = parts[1];
    const amount = Number(amountText);

    if (!Number.isFinite(amount) || amount <= 0) {
      skipped.push({ lineNumber, line, reason: `invalid or non-positive amount "${amountText}"` });
      return;
    }

    if (!ethers.isAddress(addressText)) {
      skipped.push({ lineNumber, line, reason: `invalid address "${addressText}"` });
      return;
    }

    const address = ethers.getAddress(addressText);

    if (seen.has(address)) {
      skipped.push({
        lineNumber,
        line,
        reason: `duplicate address (first seen on line ${seen.get(address)})`
      });
      return;
    }
    seen.set(address, lineNumber);

    transactions.push({ amount, amountText, address });
  });

  return { transactions, skipped };
}

export function sumRaw(transactions, field) {
  return transactions.reduce((sum, tx) => sum + tx[field], 0n);
}
