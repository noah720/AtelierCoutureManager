/**
 * Logique monétaire pure — testable sans base de données.
 *
 * Toutes les conversions passent par le franc CFA (XOF) comme pivot :
 * montant(converti) = montant × taux(devise) / taux(cible).
 */

export type CurrencyCode = "XOF" | "XAF" | "USD" | "EUR";
export type PaymentMethod = "cash" | "mobile_money" | "tpe" | "card" | "transfer" | "online";

export type RateMap = Record<string, number>;

/** Taux par défaut vers le XOF (1 USD ≈ 600 XOF, devise arrimée : 655,957/EUR). */
export const DEFAULT_RATES: RateMap = {
  XOF: 1,
  XAF: 1,
  USD: 600,
  EUR: 655.957,
};

export type PaymentInput = {
  method: PaymentMethod;
  currency: CurrencyCode;
  amount: number;
};

export type SettlementResult = {
  /** Total facturé, exprimé dans la devise de la boutique. */
  total: number;
  /** Déjà réglé, converti dans la devise de la boutique. */
  paid: number;
  /** Reste à payer dans la devise de la boutique (≥ 0). */
  remain: number;
  /** Monnaie à rendre (≥ 0) si le client a trop payé. */
  change: number;
  /** Détaillage du réglé par devise (utile pour l'affichage 3 devises). */
  paidByCurrency: Record<string, number>;
  paidByMethod: Record<string, number>;
  settled: boolean;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: RateMap = DEFAULT_RATES): number {
  const fromRate = rates[from] ?? DEFAULT_RATES[from] ?? 1;
  const toRate = rates[to] ?? DEFAULT_RATES[to] ?? 1;
  return round2((amount * fromRate) / toRate);
}

export function toXof(amount: number, currency: CurrencyCode, rates: RateMap = DEFAULT_RATES): number {
  return convert(amount, currency, "XOF", rates);
}

/**
 * Calcule le règlement d'une facture payable dans plusieurs devises
 * (point 7.1 de la présentation : espèces en XOF/USD/EUR combinées avec
 * mobile money, TPE, virement…). Le total est libellé dans la devise locale
 * de la boutique ; chaque paiement est converti puis déduit.
 */
export function computeSettlement(total: number, payments: PaymentInput[], storeCurrency: CurrencyCode, rates: RateMap = DEFAULT_RATES): SettlementResult {
  const paidByCurrency: Record<string, number> = {};
  const paidByMethod: Record<string, number> = {};
  let paid = 0;
  for (const payment of payments) {
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) continue;
    const inStoreCurrency = convert(payment.amount, payment.currency, storeCurrency, rates);
    paid = round2(paid + inStoreCurrency);
    paidByCurrency[payment.currency] = round2((paidByCurrency[payment.currency] ?? 0) + payment.amount);
    paidByMethod[payment.method] = round2((paidByMethod[payment.method] ?? 0) + inStoreCurrency);
  }
  const diff = round2(total - paid);
  const remain = diff > 0 ? diff : 0;
  const change = diff < 0 ? round2(-diff) : 0;
  return { total: round2(total), paid, remain, change, paidByCurrency, paidByMethod, settled: remain <= 0 };
}

/** Réduction parrain appliquée au panier (taux en %). */
export function applyReferralDiscount(subtotal: number, ratePercent: number): { total: number; discount: number } {
  const safeRate = Math.min(Math.max(ratePercent, 0), 100);
  const discount = round2((subtotal * safeRate) / 100);
  return { total: round2(Math.max(subtotal - discount, 0)), discount };
}

/** Formate un montant avec séparateurs, sans décimales inutiles. */
export function formatMoney(amount: number, currency: string): string {
  const rounded = round2(amount);
  const hasCents = Math.abs(rounded % 1) > 0.001;
  const formatted = rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}
