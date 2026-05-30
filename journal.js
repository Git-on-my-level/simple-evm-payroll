import fs from 'fs';

const JOURNAL_VERSION = 1;

/**
 * A write-through ledger of confirmed payments for a single payroll run, stored
 * next to the input file as `<input-file>.journal.json`.
 *
 * It makes re-runs idempotent and resumable: if a run is interrupted or some
 * transfers fail (e.g. a permissioned token reverts for some recipients), the
 * confirmed ones are recorded immediately and skipped on the next run, so only
 * the outstanding recipients are attempted again.
 *
 * A recipient is considered already paid when an entry exists for its address
 * whose recorded input amount and payment token match the current run. The
 * input amount (denominated in the asset, straight from the file) is used as
 * the identity because it is stable across runs — unlike vault share payouts,
 * which drift with the vault's share price.
 */
export class PaymentJournal {
  constructor(path, context) {
    this.path = path;
    this.chainId = context.chainId;
    this.paymentToken = context.paymentToken.toLowerCase();
    this.paymentSymbol = context.paymentSymbol;
    this.entries = new Map();
    this.staleIgnored = false;
  }

  static pathFor(payrollFile) {
    return `${payrollFile}.journal.json`;
  }

  /**
   * Loads an existing journal for `payrollFile`, if any. Entries recorded for a
   * different chain or payment token are ignored (and flagged) so a journal is
   * never applied to a payroll it doesn't belong to.
   */
  static load(payrollFile, context) {
    const path = PaymentJournal.pathFor(payrollFile);
    const journal = new PaymentJournal(path, context);

    if (!fs.existsSync(path)) {
      return journal;
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch {
      throw new Error(`Journal file ${path} exists but is not valid JSON. Inspect or remove it before continuing.`);
    }

    const sameRun =
      Number(data.chainId) === context.chainId &&
      (data.paymentToken || '').toLowerCase() === context.paymentToken.toLowerCase();

    if (!sameRun) {
      journal.staleIgnored = true;
      return journal;
    }

    for (const [address, entry] of Object.entries(data.entries || {})) {
      journal.entries.set(address.toLowerCase(), entry);
    }
    return journal;
  }

  /**
   * Returns the recorded payment for `address` only if it matches the planned
   * input amount for the current token. Returns null when there is no match
   * (not paid, amount changed, or different token), and the optional
   * `onAmountChanged` callback is invoked when an entry exists but its amount
   * differs from `inputRaw`, so the caller can warn instead of silently re-paying.
   */
  getConfirmed(address, inputRaw, onAmountChanged) {
    const entry = this.entries.get(address.toLowerCase());
    if (!entry) return null;
    if (entry.paymentToken?.toLowerCase() !== this.paymentToken) return null;
    if (entry.inputRaw !== inputRaw.toString()) {
      if (onAmountChanged) onAmountChanged(entry);
      return null;
    }
    return entry;
  }

  /** Records a confirmed payment and immediately persists the journal. */
  record(address, { inputRaw, payoutRaw, txHash }) {
    this.entries.set(address.toLowerCase(), {
      inputRaw: inputRaw.toString(),
      payoutRaw: payoutRaw.toString(),
      txHash,
      paymentToken: this.paymentToken,
      paymentSymbol: this.paymentSymbol,
      confirmedAt: new Date().toISOString()
    });
    this.flush();
  }

  flush() {
    const data = {
      version: JOURNAL_VERSION,
      chainId: this.chainId,
      paymentToken: this.paymentToken,
      paymentSymbol: this.paymentSymbol,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(this.entries)
    };
    fs.writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`);
  }
}
