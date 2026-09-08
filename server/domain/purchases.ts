/**
 * Circuit de validation des achats (point 9 de la présentation) :
 *  - l'acheteur donne son avis,
 *  - le comptable valide,
 *  - la direction donne l'accord final — sauf si le total est inférieur
 *    à 50 000 F CFA : la validation du comptable seul suffit.
 */

export type PurchaseStatus =
  | "proposee"
  | "valide_acheteur"
  | "valide_comptable"
  | "approubee"
  | "commandee"
  | "recue"
  | "refusee";

export const PURCHASE_DIRECTION_THRESHOLD_XOF = 50_000;

export function nextPurchaseStatusOnBuyerApproval(): PurchaseStatus {
  return "valide_acheteur";
}

export function nextPurchaseStatusOnAccountantApproval(totalXof: number): PurchaseStatus {
  return totalXof < PURCHASE_DIRECTION_THRESHOLD_XOF ? "approubee" : "valide_comptable";
}

export function nextPurchaseStatusOnDirectorApproval(): PurchaseStatus {
  return "approubee";
}

/** Les petites dépenses (< 2 000 XOF par facture) passent par la petite caisse. */
export const PETTY_CASH_LIMIT_PER_INVOICE = 2_000;
export const PETTY_CASH_FUND = 20_000;
