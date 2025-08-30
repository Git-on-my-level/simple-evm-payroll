# Payroll Script

ERC20 token payroll distribution script that validates balances, shows previews, and executes batch payments.

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
npm start example-payroll.txt
```

## Input File Format

Tab-separated values with amount and wallet address:
```
5153.34	0x12c60D7f3153523689c83FaD4c8482B637976765
3845.62	0x48a906fcB66Caf68ea3fDd8054309d9F0C268735
```

## Features

- ✅ Balance validation before execution
- ✅ Transaction preview with confirmation
- ✅ Individual transaction status with explorer links
- ✅ Final execution summary
- ✅ Error handling and recovery