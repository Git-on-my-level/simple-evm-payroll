import fs from 'fs';

export function parsePayrollFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const transactions = [];

  for (const line of lines) {
    const parts = line.trim().split('\t');
    if (parts.length >= 2) {
      const amountText = parts[0].trim();
      const amount = Number(amountText);
      const address = parts[1].trim();

      if (Number.isFinite(amount) && amount > 0 && address.startsWith('0x')) {
        transactions.push({
          amount,
          amountText,
          address: address.toLowerCase()
        });
      }
    }
  }

  return transactions;
}

export function getTotalAmount(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

export function sumRaw(transactions, field = 'amountRaw') {
  return transactions.reduce((sum, tx) => sum + tx[field], 0n);
}
