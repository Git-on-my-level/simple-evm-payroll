# Payroll Script

ERC20 token payroll distribution script that validates balances and wallets, shows previews, and executes multiple payments.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Fill in your configuration in `.env`:
   - `PRIVATE_KEY`: Your wallet's private key (without 0x prefix)
   - `RPC_URL`: Blockchain RPC endpoint
   - `TOKEN_CONTRACT_ADDRESS`: ERC20 token contract address
   - `EXPLORER_URL`: Block explorer URL for transaction links
   - `CHAIN_ID`: Network chain ID

## Usage

```bash
npm start payroll-file.txt
```

## Input File Format

Tab-separated values with amount and wallet address (make sure to use tabs and not spaces):
```
5153.34	0x55e9877c8e66801313607396e7e563391753f800
3845.62	0x2f54f55f498e8db00e35d6a0563c8cb682567e1b
```

## Features

- ✅ Balance validation before execution
- ✅ Wallet validation before execution
- ✅ Transaction preview with confirmation
- ✅ Individual transaction status with explorer links
- ✅ Final execution summary
- ✅ Error handling and recovery