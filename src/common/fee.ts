import config from '../utils/config'

export function calculateFee(amount: number): number {
  const pct = parseFloat(config.MOMOTRUST_FEE_PERCENT ?? '0.01')
  return Math.max(100, Math.min(2000, Math.round(amount * pct)))
}
