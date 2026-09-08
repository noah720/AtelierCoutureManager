export const COOKIE_NAME = "app_session_id";
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

export const CURRENCIES = ["XOF", "XAF", "USD", "EUR"] as const;
export type ClientCurrency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  XOF: "Franc CFA (XOF)",
  XAF: "Franc CFA (XAF)",
  USD: "Dollar US",
  EUR: "Euro",
};

export const GAMME_LABELS: Record<string, string> = {
  leader: "Leader",
  vip: "VIP",
  royale: "Royale",
  presidentiel: "Présidentiel",
};

export const GENRE_LABELS: Record<string, string> = {
  femme: "Femme",
  homme: "Homme",
  enfant: "Enfant",
};

export const SIZES_ADULT = ["S", "M", "MK", "L", "XL", "2XL", "3XL", "Sur mesure"];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_production: "En production",
  ready: "Prête",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const STAGE_LABELS: Record<string, string> = {
  coupe: "Coupe",
  couture: "Couture",
  broderie: "Broderie",
  finition: "Finition & repassage",
  controle_qualite: "Contrôle qualité",
  emballage: "Emballage",
  livraison: "Livraison boutique",
};

export const PRODUCTION_TYPE_LABELS: Record<string, string> = {
  commande: "Commande client",
  confection: "Confection (tissu client)",
  retouche: "Retouche",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  tpe: "Terminal TPE",
  card: "Carte bancaire",
  transfer: "Virement",
  online: "En ligne (Moneroo)",
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  caisse_boutique: "Caisse boutique",
  caisse_centrale: "Caisse centrale",
  banque: "Banque",
  mobile_money: "Mobile Money",
  tpe: "Terminal TPE",
  boutique_en_ligne: "Boutique en ligne",
  petite_caisse: "Petite caisse",
};

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  proposee: "Proposée (avis acheteur requis)",
  valide_acheteur: "Avis acheteur donné (visa comptable requis)",
  valide_comptable: "Validée comptable (accord direction requis)",
  approubee: "Approuvée",
  commandee: "Commandée",
  recue: "Reçue / payée",
  refusee: "Refusée",
};

export const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  boutique: "Boutique",
  administration: "Administration",
  atelier: "Atelier",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  ouvert: "Ouverte",
  en_cours: "En cours",
  resolu: "Résolue",
  ferme: "Fermée",
};

export function formatXof(value: number | string | null | undefined, currency = "XOF"): string {
  const amount = Number(value ?? 0);
  const hasCents = Math.abs(amount % 1) > 0.001;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })} ${currency}`;
}
