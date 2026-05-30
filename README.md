# Simple EVM Payroll

A small, dependency-light CLI for distributing an **ERC20 token** to many
recipients in one run on any EVM chain. It validates configuration, balances,
and recipient addresses, shows a full preview, and asks for confirmation before
sending anything.

It also supports an optional **ERC4626 vault** path: input amounts stay
denominated in the underlying asset, but you can choose to pay recipients in
vault shares. The script converts amounts to shares, and (if needed) deposits
the asset into the vault first.

> ⚠️ This tool signs and broadcasts real transactions that move funds. Read the
> [Safety](#safety) section before using it on mainnet.

## Requirements

- Node.js >= 18
- A funded sender wallet (native gas token + the ERC20 you intend to send)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Fill in `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `PRIVATE_KEY` | yes | Sender wallet private key (`0x` prefix optional). |
| `RPC_URL` | yes | JSON-RPC endpoint for the target network. |
| `TOKEN_ADDRESS` | yes | ERC20 token to distribute (input amounts are in this token). |
| `VAULT_ADDRESS` | no | ERC4626 vault whose `asset()` is `TOKEN_ADDRESS`. Enables the vault payout option. |
| `CHAIN_ID` | recommended | Expected chain ID; the run aborts if the RPC reports a different network. |
| `EXPLORER_URL` | no | Block explorer tx URL prefix for printing links. |
| `MAX_FEE_PER_GAS_GWEI` | no | EIP-1559 max fee override (gwei). |
| `MAX_PRIORITY_FEE_PER_GAS_GWEI` | no | EIP-1559 priority fee override (gwei). |

## Usage

```bash
node index.js <recipients-file> [--dry-run]
```

Or via npm:

```bash
npm start -- recipients.tsv
```

Options:

- `--dry-run` — validate, preview, and price everything (including any vault
  conversion) without sending a single transaction. Recommended before every
  real run.
- `-h`, `--help` — show usage.

### What the script does

1. Loads and validates configuration, failing fast on bad input.
2. Parses the recipients file, reporting any ignored lines.
3. Confirms the RPC chain matches `CHAIN_ID` (if set).
4. Fetches token info and balance, and flags inactive recipient wallets.
5. If `VAULT_ADDRESS` is set, asks whether to pay in the asset or in vault
   shares. For shares it verifies `vault.asset() == TOKEN_ADDRESS`, converts
   amounts via `previewDeposit`, and offers to deposit the asset into the vault
   when share balance is short (approving only when allowance is insufficient).
6. Shows a full preview and requires confirmation before sending.
7. Sends transfers sequentially, printing per-transaction status, then a
   summary.

The process exits non-zero if any transfer fails, so it is safe to use in
scripts.

## Recipients File Format

One `<amount> <address>` pair per line. The separator may be a **tab, comma, or
any whitespace**. Blank lines and lines starting with `#` are ignored.

```text
# amount    address
5153.34     0x55e9877c8e66801313607396e7e563391753f800
3845.62,0x2f54f55f498e8db00e35d6a0563c8cb682567e1b
```

See [`recipients.example.tsv`](recipients.example.tsv).

Lines are ignored (and reported) when they have a non-positive/invalid amount,
an invalid address, or a duplicate address. Amounts are parsed at the token's
exact precision; an amount with more decimal places than the token supports is a
hard error (no silent rounding).

## Safety

- **Never commit secrets.** `.env` and recipient lists are git-ignored. Only
  `.env.example` and `recipients.example.tsv` are tracked.
- **The private key controls funds.** Prefer a dedicated payout wallet holding
  only what's needed, and consider exporting the key only for the run.
- **Set `CHAIN_ID`** so the script refuses to run against the wrong network.
- **Always `--dry-run` first** and review the preview, totals, and any
  `INACTIVE` recipient warnings.
- **Addresses are checksum-validated** and duplicates are rejected, but the tool
  cannot know if an address is *correct* — verify your source data.
- Transfers are sent **one at a time**; if one fails the rest still proceed, and
  the summary lists failures for retry.

## How it works (files)

| File | Responsibility |
| --- | --- |
| `index.js` | CLI entry point and orchestration. |
| `config.js` | Environment loading and validation. |
| `wallet.js` | ERC20 / ERC4626 wallet managers (ethers). |
| `utils.js` | Recipients-file parsing and validation. |
| `display.js` | Console previews and tables. |
| `prompt.js` | Interactive confirmations. |
| `executor.js` | Sequential transfer execution and summary. |

## License

[MIT](LICENSE)
