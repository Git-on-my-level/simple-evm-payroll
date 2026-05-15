import { ethers } from 'ethers';

export const SDUSD_CONTRACT_ADDRESS = '0x58AcC2600835211Dcb5847c5Fa422791Fd492409';

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
    this.tokenContract = new ethers.Contract(
      tokenAddress,
      options.isVault ? ERC4626_ABI : ERC20_ABI,
      this.wallet
    );
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

  async checkSufficientFundsRaw(totalRequired) {
    const balance = await this.getBalance();
    return balance.raw >= totalRequired;
  }

  async sendTokenRaw(toAddress, amountRaw) {
    return this.tokenContract.transfer(toAddress, amountRaw);
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
    const validations = await Promise.all(
      addresses.map(async (address) => {
        const activity = await this.checkWalletActivity(address);
        return {
          address,
          ...activity
        };
      })
    );

    return validations;
  }

  getAddress() {
    return this.wallet.address;
  }
}

export class VaultWalletManager extends WalletManager {
  constructor(privateKey, rpcUrl, vaultAddress) {
    super(privateKey, rpcUrl, vaultAddress, { isVault: true });
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

  async deposit(assetTokenManager, assetAmountRaw) {
    const allowance = await assetTokenManager.tokenContract.allowance(
      this.wallet.address,
      this.tokenAddress
    );

    if (allowance < assetAmountRaw) {
      console.log('Approving vault to pull dUSD for sdUSD deposit...');
      const approveTx = await assetTokenManager.tokenContract.approve(this.tokenAddress, assetAmountRaw);
      console.log('Approval submitted, waiting for confirmation...');
      await approveTx.wait();
    }

    return this.tokenContract.deposit(assetAmountRaw, this.wallet.address);
  }
}
