/**
 * Format a bigint amount (in 7-decimal smallest units) to a human-readable string.
 *
 * @example formatAmount(150000000n) // "15.0000000"
 */
export function formatAmount(val: bigint, decimals = 7): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = val / divisor;
  const frac = val % divisor;
  return `${whole}.${String(frac).padStart(decimals, "0")}`;
}

/**
 * Format a duration in seconds into a human-readable string.
 *
 * @example formatDuration(90061) // "1d 01h 01m 01s"
 */
export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  parts.push(`${String(h).padStart(2, "0")}h`);
  parts.push(`${String(m).padStart(2, "0")}m`);
  parts.push(`${String(s).padStart(2, "0")}s`);
  return parts.join(" ");
}
