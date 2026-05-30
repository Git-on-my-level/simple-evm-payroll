/**
 * Produces a concise, human-readable message from an error.
 *
 * ethers v6 packs the full transaction and serialized receipt into `message`
 * for on-chain reverts, which is multiple kilobytes and floods the console.
 * `shortMessage` / `reason` carry the useful summary, so prefer those.
 */
export function formatError(error) {
  if (!error) return 'Unknown error';
  const parts = [];
  if (error.shortMessage) parts.push(error.shortMessage);
  else if (error.reason) parts.push(error.reason);
  else if (error.message) parts.push(error.message.split('\n')[0]);
  else parts.push(String(error));

  if (error.code && !parts[0].includes(error.code)) {
    parts.push(`[${error.code}]`);
  }
  return parts.join(' ');
}
