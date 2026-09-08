/**
 * Primes commerciales (point 14.4 de la présentation).
 *  - 1 point par tranche de 50 000 F CFA vendus ;
 *  - prime automatique de 2 % sur toute vente unique > 1 000 000 F CFA ;
 *  - alerte motivation sous 60 points/mois.
 */

export const POINTS_PER_SLICE_XOF = 50_000;
export const BIG_SALE_THRESHOLD_XOF = 1_000_000;
export const BIG_SALE_RATE_PERCENT = 2;
export const BEST_SELLER_WEEK_PRIZE = 10_000;
export const BEST_SELLER_MONTH_PRIZE = 30_000;
export const MOTIVATION_ALERT_POINTS = 60;

export function salesPoints(totalSalesXof: number): number {
  if (totalSalesXof <= 0) return 0;
  return Math.floor(totalSalesXof / POINTS_PER_SLICE_XOF);
}

export function bigSaleBonus(saleTotalXof: number): number {
  if (saleTotalXof <= BIG_SALE_THRESHOLD_XOF) return 0;
  return Math.round((saleTotalXof * BIG_SALE_RATE_PERCENT) / 100);
}

export function needsMotivationAlert(monthlyPoints: number): boolean {
  return monthlyPoints < MOTIVATION_ALERT_POINTS;
}
