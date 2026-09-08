export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** Paiement Moneroo : sans clé, la boutique en ligne paie en mode simulation. */
  monerooApiKey: process.env.MONEROO_API_KEY ?? "",
  monerooWebhookSecret: process.env.MONEROO_WEBHOOK_SECRET ?? "",
};
