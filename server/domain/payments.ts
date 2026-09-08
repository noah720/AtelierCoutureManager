/**
 * Paiement en ligne Moneroo (point 5.6).
 *
 * Un seul intégrateur : Moneroo propose au client, selon son pays, le mobile
 * money, la carte bancaire ou PayPal. Tant que `MONEROO_API_KEY` n'est pas
 * configurée, l'application utilise un mode **simulation** (page de paiement
 * intégrée) afin que tout le parcours soit testable de bout en bout ; le
 * passage en production ne demande que la clé.
 *
 * Les fonctions ici sont pures et testées sans réseau.
 */

export type MonerooCustomer = {
  email: string;
  firstName: string;
  lastName: string;
};

export type MonerooPayload = {
  amount: number;
  currency: string;
  customer: MonerooCustomer;
  description: string;
  return_url: string;
  metadata: Record<string, unknown>;
};

/** Construit la charge utile d'une demande de paiement Moneroo (POST /v1/payments). */
export function buildMonerooPayload(input: {
  paymentId: number;
  amount: number;
  currency: string;
  customer: MonerooCustomer;
  orderReference: string;
  returnUrl: string;
}): MonerooPayload {
  return {
    amount: input.amount,
    currency: input.currency,
    customer: input.customer,
    description: `Commande ${input.orderReference}`,
    return_url: input.returnUrl,
    metadata: { paymentId: input.paymentId, reference: input.orderReference },
  };
}

/** Extrait l'URL de caisse d'une réponse Moneroo, quelle que soit sa forme. */
export function parseCheckoutUrl(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const root = response as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const url = data.checkout_url ?? data.checkoutUrl ?? root.checkout_url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

export type MonerooWebhookEvent = {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
};

/** Retourne l'identifiant de paiement interne si l'événement annonce un succès. */
export function extractSucceededPaymentId(event: MonerooWebhookEvent): number | null {
  const name = (event.event ?? "").toLowerCase();
  const status = (event.data?.status ?? "").toLowerCase();
  const success = name.includes("success") || name.includes("completed") || status === "success" || status === "completed";
  if (!success) return null;
  const raw = event.data?.metadata?.paymentId ?? event.data?.id;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
