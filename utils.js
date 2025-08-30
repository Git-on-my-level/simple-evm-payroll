import fs from 'fs';

export function parsePayrollFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  const transactions = [];
  
  for (const line of lines) {
    const parts = line.trim().split('\t');
    if (parts.length >= 2) {
      const amount = parseFloat(parts[0]);
      const address = parts[1];
      
      if (!isNaN(amount) && amount > 0 && address.startsWith('0x')) {
        transactions.push({
          amount,
          address: address.toLowerCase()
        });
      }
    }
  }
  
  return transactions;
}

export function formatAmount(amount, decimals = 18) {
  return (amount * Math.pow(10, decimals)).toString();
}

export function formatDisplayAmount(amount, decimals = 18) {
  return (amount / Math.pow(10, decimals)).toFixed(2);
}

export function getTotalAmount(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}