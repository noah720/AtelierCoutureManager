export { nextPurchaseStatusOnBuyerApproval, nextPurchaseStatusOnAccountantApproval, nextPurchaseStatusOnDirectorApproval, PETTY_CASH_LIMIT_PER_INVOICE, PETTY_CASH_FUND, PURCHASE_DIRECTION_THRESHOLD_XOF } from "../domain/purchases";
import { DEFAULT_RATES, toXof } from "../domain/money";

/** Conversion robuste même sans taux chargés (les devises arrimées valent 1). */
export function toXofDefault(amount: number, currency: "XOF" | "XAF" | "USD" | "EUR"): number {
  return toXof(amount, currency, DEFAULT_RATES);
}
