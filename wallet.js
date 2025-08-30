import { ethers } from 'ethers';

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
    const totalRequired = ethers.parseUnits(totalAmount.toString(), decimals);
    return balance.raw >= totalRequired;
  }

  async sendToken(toAddress, amount, decimals) {
    const amountWei = ethers.parseUnits(amount.toString(), decimals);
    const tx = await this.tokenContract.transfer(toAddress, amountWei);
    return tx;
  }

  getAddress() {
    return this.wallet.address;
  }
}