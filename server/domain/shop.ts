/**
 * Boutique en ligne (point 5 de la présentation) — logique pure.
 *
 * Stock affiché = somme des stocks des boutiques physiques (5.3). À la
 * commande, le système choisit la boutique qui livre : en priorité une
 * boutique de la même ville que la zone de livraison, sinon celle qui a le
 * plus de stock. La méthode exacte de « proximité » reste paramétrable
 * (point 17 de la présentation) — ce point de passage unique permettra de
 * brancher plus tard une vraie matrice de distances.
 */

export type CandidateStore = { id: number; city: string | null };

/**
 * Choisit la boutique qui traitera la livraison d'une ligne de commande.
 * `remainingStock` est muté (décrémenté) pour enchaîner plusieurs lignes.
 * Retourne null si aucune boutique ne peut servir toute la quantité :
 * la ligne part alors en fabrication à l'atelier.
 */
export function pickSourceStore(
  deliveryZoneName: string,
  stores: CandidateStore[],
  remainingStock: Map<number, number>,
  quantity: number,
): number | null {
  const zone = deliveryZoneName.trim().toLowerCase();
  const available = stores
    .map((store) => ({ ...store, stock: remainingStock.get(store.id) ?? 0 }))
    .filter((store) => store.stock >= quantity);
  if (!available.length) return null;

  const sameCity = available.filter(
    (store) => store.city && (zone.includes(store.city.toLowerCase()) || store.city.toLowerCase().includes(zone)),
  );
  const pool = sameCity.length ? sameCity : available;
  return pool.sort((a, b) => b.stock - a.stock)[0].id;
}

export function decrementStock(remainingStock: Map<number, number>, storeId: number, quantity: number): void {
  remainingStock.set(storeId, Math.max((remainingStock.get(storeId) ?? 0) - quantity, 0));
}

export type OnlineTotals = {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  /** Total à payer : sous-total − réduction parrain + frais de livraison. */
  total: number;
};

/** Totaux d'une commande en ligne ; la réduction parrain ne s'applique pas aux frais de livraison. */
export function computeOnlineTotals(subtotal: number, referralRatePercent: number, deliveryFee: number): OnlineTotals {
  const discount = Math.round(((subtotal * Math.min(Math.max(referralRatePercent, 0), 100)) / 100) * 100) / 100;
  const total = Math.round((Math.max(subtotal - discount, 0) + deliveryFee) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, discount, deliveryFee, total };
}
