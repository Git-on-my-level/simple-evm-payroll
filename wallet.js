import { ethers } from 'ethers';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

const ERC4626_ABI = [
  ...ERC20_ABI,
  'function asset() view returns (address)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewMint(uint256 shares) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256)'
];

// Pad the estimated gas to absorb state-dependent variance. aTokens and other
// hook-bearing tokens run extra logic on transfer (e.g. the lending pool's
// finalizeTransfer), and a bare estimate can land just below actual usage,
// causing an out-of-gas revert. 25% headroom comfortably covers this.
const GAS_LIMIT_BUFFER_PCT = 125n;

export function formatUnits(amount, decimals) {
  return ethers.formatUnits(amount, decimals);
}

export function parseUnits(amount, decimals) {
  return ethers.parseUnits(amount, decimals);
}

export class WalletManager {
  constructor(privateKey, rpcUrl, tokenAddress, options = {}) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.tokenAddress = tokenAddress;
    this.gasOverrides = options.gasOverrides || {};
    this.tokenContract = new ethers.Contract(
      tokenAddress,
      options.isVault ? ERC4626_ABI : ERC20_ABI,
      this.wallet
    );
  }

  /**
   * Verifies the RPC is connected to the expected chain. Guards against the
   * footgun of broadcasting payroll on the wrong network.
   */
  async assertChainId(expectedChainId) {
    if (expectedChainId == null) return;
    const network = await this.provider.getNetwork();
    if (network.chainId !== BigInt(expectedChainId)) {
      throw new Error(
        `RPC chain ID is ${network.chainId} but CHAIN_ID is set to ${expectedChainId}. ` +
        'Refusing to continue to avoid sending on the wrong network.'
      );
    }
  }

  async getTokenInfo() {
    const [decimals, symbol] = await Promise.all([
      this.tokenContract.decimals(),
      this.tokenContract.symbol()
    ]);
    return {
      address: this.tokenAddress,
      decimals: Number(decimals),
      symbol
    };
  }

  async getBalance(decimals = null) {
    const balance = await this.tokenContract.balanceOf(this.wallet.address);
    const resolvedDecimals = decimals ?? (await this.getTokenInfo()).decimals;
    return {
      raw: balance,
      formatted: ethers.formatUnits(balance, resolvedDecimals)
    };
  }

  /**
   * Builds transaction overrides (configured gas fees plus a buffered gasLimit).
   * If estimation fails, omits gasLimit and lets the node estimate, so the real
   * revert reason surfaces rather than a confusing estimation error.
   */
  async buildOverrides(methodName, args) {
    const overrides = { ...this.gasOverrides };
    try {
      const estimate = await this.tokenContract[methodName].estimateGas(...args, this.gasOverrides);
      overrides.gasLimit = (estimate * GAS_LIMIT_BUFFER_PCT) / 100n;
    } catch {
      // Leave gasLimit unset; the subsequent send will surface any real error.
    }
    return overrides;
  }

  async sendTokenRaw(toAddress, amountRaw) {
    const overrides = await this.buildOverrides('transfer', [toAddress, amountRaw]);
    return this.tokenContract.transfer(toAddress, amountRaw, overrides);
  }

  async checkWalletActivity(address) {
    const [balance, nonce] = await Promise.all([
      this.provider.getBalance(address),
      this.provider.getTransactionCount(address)
    ]);

    return {
      hasNativeBalance: balance > 0n,
      nonce,
      isActive: balance > 0n || nonce > 0
    };
  }

  async validateRecipientWallets(addresses) {
    return Promise.all(
      addresses.map(async (address) => ({
        address,
        ...(await this.checkWalletActivity(address))
      }))
    );
  }

  getAddress() {
    return this.wallet.address;
  }
}

/**
 * Wallet manager for an ERC4626 vault. The vault's shares are themselves an
 * ERC20 token (so transfers work the same), with extra deposit/preview methods.
 */
export class VaultWalletManager extends WalletManager {
  constructor(privateKey, rpcUrl, vaultAddress, options = {}) {
    super(privateKey, rpcUrl, vaultAddress, { ...options, isVault: true });
  }

  async getAssetAddress() {
    return this.tokenContract.asset();
  }

  async previewDeposit(assetAmountRaw) {
    return this.tokenContract.previewDeposit(assetAmountRaw);
  }

  async previewMint(shareAmountRaw) {
    return this.tokenContract.previewMint(shareAmountRaw);
  }

  /**
   * Deposits `assetAmountRaw` of the underlying asset into the vault, approving
   * the vault to pull the asset first only when the existing allowance is too
   * low. Returns the pending deposit transaction.
   */
  async deposit(assetTokenManager, assetAmountRaw) {
    const allowance = await assetTokenManager.tokenContract.allowance(
      this.wallet.address,
      this.tokenAddress
    );

    if (allowance < assetAmountRaw) {
      // Some tokens (e.g. USDT) revert when changing a non-zero allowance to
      // another non-zero value, so reset to zero first when needed.
      if (allowance > 0n) {
        const resetOverrides = await assetTokenManager.buildOverrides('approve', [this.tokenAddress, 0n]);
        const resetTx = await assetTokenManager.tokenContract.approve(this.tokenAddress, 0n, resetOverrides);
        console.log('Resetting existing allowance to zero...');
        await resetTx.wait();
      }
      console.log('Approving vault to pull the asset for deposit...');
      const approveOverrides = await assetTokenManager.buildOverrides('approve', [this.tokenAddress, assetAmountRaw]);
      const approveTx = await assetTokenManager.tokenContract.approve(
        this.tokenAddress,
        assetAmountRaw,
        approveOverrides
      );
      console.log('Approval submitted, waiting for confirmation...');
      await approveTx.wait();
    }

    const depositOverrides = await this.buildOverrides('deposit', [assetAmountRaw, this.wallet.address]);
    return this.tokenContract.deposit(assetAmountRaw, this.wallet.address, depositOverrides);
  }
}
