import { ethers } from 'ethers';

// Fix JavaScript floating-point precision errors before passing to ethers.parseUnits()
function toFixedDecimals(amount, decimals) {
  return amount.toFixed(decimals);
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

export class WalletManager {
  constructor(privateKey, rpcUrl, tokenAddress) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
  }

  async getTokenInfo() {
    const [decimals, symbol] = await Promise.all([
      this.tokenContract.decimals(),
      this.tokenContract.symbol()
    ]);
    return { decimals: Number(decimals), symbol };
  }

  async getBalance() {
    const balance = await this.tokenContract.balanceOf(this.wallet.address);
    const { decimals } = await this.getTokenInfo();
    return {
      raw: balance,
      formatted: ethers.formatUnits(balance, decimals)
    };
  }

  async checkSufficientFunds(totalAmount, decimals) {
    const balance = await this.getBalance();
    const totalRequired = ethers.parseUnits(toFixedDecimals(totalAmount, decimals), decimals);
    return balance.raw >= totalRequired;
  }

  async sendToken(toAddress, amount, decimals) {
    const amountWei = ethers.parseUnits(toFixedDecimals(amount, decimals), decimals);
    const tx = await this.tokenContract.transfer(toAddress, amountWei);
    return tx;
  }

  async checkWalletActivity(address) {
    const [balance, nonce] = await Promise.all([
      this.provider.getBalance(address),
      this.provider.getTransactionCount(address)
    ]);
    
    return {
      hasNativeBalance: balance > 0n,
      nonce: nonce,
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