# Payroll Script

ERC20/ERC4626 payroll distribution script that validates balances and wallets, shows previews, and executes multiple payments.

Payroll files are entered in dUSD amounts. At runtime the script can pay those amounts directly in dUSD or convert the dUSD-denominated payroll into sdUSD share amounts using the sdUSD ERC4626 vault.

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
   - `PRIVATE_KEY`: sender wallet private key, without `0x`
   - `RPC_URL`: blockchain RPC endpoint
   - `DUSD_CONTRACT_ADDRESS`: dUSD token contract address
   - `SDUSD_CONTRACT_ADDRESS`: optional sdUSD ERC4626 vault address; defaults to `0x58AcC2600835211Dcb5847c5Fa422791Fd492409`
   - `EXPLORER_URL`: block explorer transaction URL prefix
   - `CHAIN_ID`: network chain ID

## Usage

```bash
npm start payroll-file.txt
```

The script will:

- Load payroll amounts as dUSD-denominated values.
- Show the dUSD wallet balance before token selection.
- Ask whether to pay in dUSD or sdUSD.
- If sdUSD is selected, fetch the sdUSD balance and vault metadata.
- For sdUSD, verify `sdUSD.asset()` matches the configured dUSD token.
- For sdUSD, use ERC4626 `previewDeposit` to compute each recipient's sdUSD payout amount.
- If the wallet does not have enough sdUSD, preview the dUSD needed for conversion, ask for confirmation, approve if needed, and deposit dUSD into the vault before payroll transfers.
- Show the final recipient preview and require confirmation before sending payroll transfers.

## Input File Format

Tab-separated values with dUSD amount and wallet address. Use tabs, not spaces.

```text
5153.34	0x55e9877c8e66801313607396e7e563391753f800
3845.62	0x2f54f55f498e8db00e35d6a0563c8cb682567e1b
```

Zero or invalid rows are ignored.

## Features

- Balance validation before execution
- Wallet activity validation before execution
- dUSD or sdUSD payment selection
- ERC4626 sdUSD conversion preview
- Approval only when the current dUSD allowance is insufficient
- Transaction preview with confirmation
- Individual transaction status with explorer links
- Final execution summary
- Error handling and recovery
