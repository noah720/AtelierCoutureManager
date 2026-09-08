# Environnements et déploiement

## Développement local

- Base : **PostgreSQL embarqué (PGlite)**, données dans `.data/pglite` — aucun serveur à installer.
- Au démarrage : migrations appliquées automatiquement depuis `drizzle/`, puis données de démonstration si la base est vide (marque DISTINCTION).
- Variables : `JWT_SECRET` recommandé en local ; `PORT` (défaut 3000).

## Production Neon

La cible de production est **PostgreSQL hébergé par Neon**, avec le même schéma `pg-core` que le développement — plus aucune divergence MySQL/PostgreSQL.

1. Renseigner `DATABASE_URL` (chaîne `postgresql://…` de Neon) dans l'environnement d'exécution.
2. Renseigner `JWT_SECRET` (sessions).
3. Au démarrage, l'application applique les migrations `drizzle/*.sql` de façon idempotente. Elles peuvent aussi être appliquées manuellement : `pnpm db:migrate`.
4. Recommandé : une base Neon distincte pour le développement, la préproduction et la production.

## Variables d'environnement

| Variable | Utilisation | Requis |
|---|---|---|
| `DATABASE_URL` | `postgresql://…` (Neon) en production ; `pglite://…` ou vide en local | Production |
| `JWT_SECRET` | Signature des sessions | Production |
| `PORT` | Port d'écoute (défaut 3000) | Non |
| `MONEROO_API_KEY` | Paiements en ligne, lorsque le module sera branché | À venir |
| `DHL_API_KEY` | Expéditions internationales, lorsque le module sera branché | À venir |

Les secrets ne doivent jamais être commités : ils se saisissent dans l'interface Netlify / l'hébergeur, jamais dans le dépôt, les issues ou les logs.

## Netlify (cible conservée)

`netlify.toml` définit : build `pnpm build`, publication `dist/public`, Node 22, redirection SPA vers `/index.html`. Pour un déploiement du serveur complet (tRPC + sessions), prévoir un hébergeur Node (le bundle `dist/index.js` est généré par le build) ou des fonctions Netlify dédiées — décision à prendre au moment de la mise en production.

## GitHub

La branche `main` doit rester déployable. Les changements de schéma, de permissions ou de paiement passent par une branche dédiée et une pull request, avec `pnpm test` au vert.
