/**
 * Cycle de vie de l'abonnement d'une marque (point 3 de la présentation) :
 * 30 jours d'essai gratuit, puis formule payante. Sans paiement après
 * l'essai, l'accès se réduit puis se bloque après une semaine de tolérance.
 */

export type OrgStatus = "trial" | "active" | "grace" | "blocked" | "suspended";

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;

export const PLANS = {
  boutique: { label: "Boutique", monthly: 50_000, annualDiscountPercent: 20 },
  atelier_boutique: { label: "Atelier + Boutique", monthly: 150_000, annualDiscountPercent: 25 },
  complet: { label: "Atelier + Boutique + Boutique en ligne", monthly: 250_000, annualDiscountPercent: 30 },
} as const;

export type PlanKey = keyof typeof PLANS;

export const AI_ASSISTANT_MONTHLY = 100_000;

export function trialEndsFrom(createdAt: Date = new Date()): Date {
  const ends = new Date(createdAt);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  return ends;
}

/**
 * Statut effectif de l'abonnement à une date donnée :
 *  - essai en cours → `trial`
 *  - abonnement payé non expiré → `active`
 *  - essai ou abonnement expiré depuis moins de GRACE_DAYS → `grace`
 *  - au-delà → `blocked`
 * `suspended` (décision ENVOL) n'est jamais déduit automatiquement.
 */
export function effectiveOrgStatus(input: { status: OrgStatus; trialEndsAt: Date; subscriptionEndsAt: Date | null; now?: Date }): OrgStatus {
  if (input.status === "suspended") return "suspended";
  const now = input.now ?? new Date();
  if (input.status === "active" && input.subscriptionEndsAt && input.subscriptionEndsAt > now) return "active";
  if (input.status === "active" && input.subscriptionEndsAt) {
    return inGrace(input.subscriptionEndsAt, now) ? "grace" : "blocked";
  }
  if (input.trialEndsAt > now) return "trial";
  return inGrace(input.trialEndsAt, now) ? "grace" : "blocked";
}

function inGrace(endsAt: Date, now: Date): boolean {
  const graceEnd = new Date(endsAt);
  graceEnd.setDate(graceEnd.getDate() + GRACE_DAYS);
  return now <= graceEnd;
}

/** Prix d'un plan : mensuel ou annuel avec sa réduction. */
export function planPrice(plan: PlanKey, months: 1 | 12): number {
  const config = PLANS[plan];
  if (months === 12) {
    const full = config.monthly * 12;
    return Math.round(full * (1 - config.annualDiscountPercent / 100));
  }
  return config.monthly;
}
