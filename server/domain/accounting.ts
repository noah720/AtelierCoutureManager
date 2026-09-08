/**
 * Comptabilité SYSCOHADA révisée — plan simplifié (points 10-11).
 *
 * Le plan ci-dessous retient les comptes utiles à une maison de couture :
 * il est affiché comme « simplifié » dans l'interface et couvre ventes,
 * achats, personnel, trésorerie et virements internes. Les écritures sont
 * toujours équilibrées (somme des débits = somme des crédits).
 *
 * Rapprochement bancaire (11) : les lignes de relevé sont associées aux
 * mouvements de trésorerie du compte « banque » — une ligne non rapprochée
 * ou un mouvement non rapproché signale un écart à investiguer.
 */

export type ChartEntry = { label: string; class: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 };

/** Plan comptable simplifié (comptes réellement produits par l'application). */
export const CHART: Record<string, ChartEntry> = {
  "411": { label: "Clients", class: 4 },
  "401": { label: "Fournisseurs", class: 4 },
  "521": { label: "Banques locales", class: 5 },
  "531": { label: "Établissements financiers — Mobile money", class: 5 },
  "532": { label: "Établissements financiers — Compte TPE", class: 5 },
  "533": { label: "Établissements financiers — Caisse en ligne (Moneroo)", class: 5 },
  "571": { label: "Caisse siège social", class: 5 },
  "572": { label: "Caisses boutiques", class: 5 },
  "573": { label: "Petite caisse (régie d'avances)", class: 5 },
  "585": { label: "Virements de fonds", class: 5 },
  "6011": { label: "Achats de marchandises revendues", class: 6 },
  "6021": { label: "Achats de matières premières (tissus, fils, broderie)", class: 6 },
  "628": { label: "Frais de télécommunications et services numériques", class: 6 },
  "641": { label: "Rémunérations directes du personnel", class: 6 },
  "6581": { label: "Charges diverses", class: 6 },
  "701": { label: "Ventes de produits finis (couture)", class: 7 },
  "707": { label: "Ventes de marchandises (accessoires)", class: 7 },
  "7581": { label: "Produits divers", class: 7 },
};

export function accountLabel(accountNumber: string): string {
  return CHART[accountNumber]?.label ?? "Compte";
}

/** Type de compte de trésorerie → compte SYSCOHADA. */
export const TREASURY_TYPE_ACCOUNT: Record<string, string> = {
  caisse_centrale: "571",
  caisse_boutique: "572",
  petite_caisse: "573",
  banque: "521",
  mobile_money: "531",
  tpe: "532",
  boutique_en_ligne: "533",
};

/** Mode de règlement d'une vente → type de compte de trésorerie. */
export const METHOD_TREASURY_TYPE: Record<string, string> = {
  cash: "caisse_boutique",
  mobile_money: "mobile_money",
  tpe: "tpe",
  card: "tpe",
  online: "boutique_en_ligne",
  transfer: "banque",
};

/** Contrepartie des mouvements de trésorerie hors ventes/achats. */
export const MOVEMENT_COUNTER_ACCOUNT: Record<string, { entree: string; sortie: string }> = {
  paie: { entree: "571", sortie: "641" },
  abonnement: { entree: "7581", sortie: "628" },
  petite_caisse: { entree: "585", sortie: "585" },
  ajustement: { entree: "7581", sortie: "6581" },
  autre: { entree: "7581", sortie: "6581" },
};

/** Journal adapté au compte principal de l'écriture. */
export function journalFor(kind: "sale" | "purchase" | "purchase_payment" | "online_payment" | "movement", treasuryAccountNumber: string | null): string {
  if (kind === "sale") return "VT";
  if (kind === "purchase" || kind === "purchase_payment") return "AC";
  if (kind === "online_payment") return "BQ";
  if (treasuryAccountNumber === "521" || treasuryAccountNumber === "531" || treasuryAccountNumber === "532" || treasuryAccountNumber === "533") return "BQ";
  if (treasuryAccountNumber === "571" || treasuryAccountNumber === "572" || treasuryAccountNumber === "573") return "CA";
  return "OD";
}

/** Ligne comptable : compte, débit ou crédit (montants arrondis à 2 décimales). */
export type RawLine = { accountNumber: string; debit?: number; credit?: number };

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Transforme des lignes brutes en lignes validées (débit XOR crédit, > 0). */
export function finalizeLines(raw: RawLine[]): Array<{ accountNumber: string; accountLabel: string; debit: number; credit: number }> {
  const merged = new Map<string, { debit: number; credit: number }>();
  for (const line of raw) {
    const current = merged.get(line.accountNumber) ?? { debit: 0, credit: 0 };
    current.debit = round2(current.debit + Math.max(0, line.debit ?? 0));
    current.credit = round2(current.credit + Math.max(0, line.credit ?? 0));
    merged.set(line.accountNumber, current);
  }
  const lines: Array<{ accountNumber: string; accountLabel: string; debit: number; credit: number }> = [];
  for (const [accountNumber, amounts] of merged) {
    const net = round2(amounts.debit - amounts.credit);
    if (Math.abs(net) < 0.005) continue;
    lines.push({ accountNumber, accountLabel: accountLabel(accountNumber), debit: net > 0 ? net : 0, credit: net < 0 ? round2(-net) : 0 });
  }
  return lines.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}

/** Lignes d'une écriture de vente : encaissements par compte + reste client + produits. */
export function buildSaleLines(input: {
  totalNetOrg: number; // total net (après réduction) en devise de la marque
  payments: Array<{ accountNumber: string; amountOrg: number }>;
  revenueOrg: { vetement: number; accessoire: number }; // répartition par famille (net)
}): RawLine[] {
  const lines: RawLine[] = [];
  for (const payment of input.payments) lines.push({ accountNumber: payment.accountNumber, debit: round2(payment.amountOrg) });
  const receipts = round2(input.payments.reduce((sum, payment) => sum + payment.amountOrg, 0));
  const rest = round2(input.totalNetOrg - receipts);
  if (rest > 0.005) lines.push({ accountNumber: "411", debit: rest });
  if (rest < -0.005) lines.push({ accountNumber: "411", credit: round2(-rest) });
  // Crédit des comptes de produits, ajusté sur le dernier poste pour équilibrer exactement.
  const shares: Array<{ account: string; share: number }> = [
    { account: "701", share: input.revenueOrg.vetement },
    { account: "707", share: input.revenueOrg.accessoire },
  ].filter((entry) => entry.share > 0.005);
  const shareSum = round2(shares.reduce((sum, entry) => sum + entry.share, 0));
  let allocated = 0;
  shares.forEach((entry, index) => {
    if (index === shares.length - 1) {
      lines.push({ accountNumber: entry.account, credit: round2(input.totalNetOrg - allocated) });
    } else {
      const amount = round2((entry.share / shareSum) * input.totalNetOrg);
      allocated = round2(allocated + amount);
      lines.push({ accountNumber: entry.account, credit: amount });
    }
  });
  if (!shares.length) lines.push({ accountNumber: "701", credit: input.totalNetOrg });
  return lines;
}

/**
 * Compte d'achat adapté : marchandises revendues (6011) si les libellés
 * évoquent des accessoires, sinon matières premières pour l'atelier (6021).
 */
export function purchaseAccount(itemLabels: string[]): string {
  const merchandise = /(sac|lunette|montre|foulard|bijou|accessoire|chaussure|chet|chettes)/i;
  return itemLabels.length && itemLabels.every((label) => merchandise.test(label)) ? "6011" : "6021";
}

/** Écriture d'un mouvement de trésorerie « divers » (paie, abonnement, virement…). */
export function buildMovementLines(input: { treasuryAccountNumber: string; direction: "entree" | "sortie"; category: string; amountOrg: number }): RawLine[] {
  const counter = MOVEMENT_COUNTER_ACCOUNT[input.category] ?? MOVEMENT_COUNTER_ACCOUNT.autre;
  const amount = round2(input.amountOrg);
  if (input.direction === "entree") {
    return [
      { accountNumber: input.treasuryAccountNumber, debit: amount },
      { accountNumber: counter.entree, credit: amount },
    ];
  }
  return [
    { accountNumber: counter.sortie, debit: amount },
    { accountNumber: input.treasuryAccountNumber, credit: amount },
  ];
}

/** Les catégories de mouvement déjà couvertes par les écritures ventes/achats. */
export function isCoveredBySaleOrPurchase(refType: string | null): boolean {
  return refType === "sale" || refType === "purchase";
}

/** Équilibre d'une écriture : |débit − crédit| < centime. */
export function isBalanced(lines: Array<{ debit: number; credit: number }>): boolean {
  const debit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  return Math.abs(debit - credit) < 0.005;
}
