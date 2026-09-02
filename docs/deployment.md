# Environnements et déploiement

## Développement local

Le template Manus utilise actuellement TiDB/MySQL dans le sandbox. La configuration Drizzle locale reste donc en dialecte MySQL afin de permettre les migrations et les tests dans cet environnement.

## Production Neon

La cible de production est PostgreSQL hébergé par Neon. Avant la mise en production, il faudra soit exécuter une migration PostgreSQL équivalente, soit adopter une configuration de build dédiée à PostgreSQL (`pg-core`, pilote Neon et dialecte PostgreSQL). Les noms de tables et de colonnes du modèle métier sont déjà documentés dans `drizzle/schema.ts` ; aucune donnée de production ne doit être copiée automatiquement depuis TiDB vers Neon sans procédure de migration contrôlée.

## Variables Netlify

Configurer dans Netlify les variables suivantes, avec des valeurs différentes entre les contextes de préproduction et de production :

| Variable | Utilisation |
|---|---|
| `DATABASE_URL` | Connexion à la base de données de l’environnement |
| `JWT_SECRET` | Signature des sessions |
| `VITE_APP_ID` | Identifiant de l’application OAuth |
| `OAUTH_SERVER_URL` | Serveur OAuth |
| `VITE_OAUTH_PORTAL_URL` | Portail de connexion |
| `MONEROO_API_KEY` | Paiements, lorsque le module sera activé |
| `DHL_API_KEY` | Calcul des expéditions, lorsque le module sera activé |
| `AI_API_KEY` | Assistant commercial, lorsque le module sera activé |

Les secrets sont à saisir dans l’interface Netlify ou via son gestionnaire de variables. Ils ne doivent jamais être ajoutés à GitHub, aux logs ou à une capture d’écran.

## GitHub

La branche `main` doit rester déployable. Les changements de schéma, de permissions ou de paiement doivent être proposés dans une branche dédiée et validés par pull request. Les migrations doivent être versionnées avec le code et testées sur une base de préproduction avant d’être appliquées à Neon.

## Netlify

Le fichier `netlify.toml` définit la commande `pnpm build`, le répertoire de sortie et Node.js 22. Les réglages du site Netlify doivent être vérifiés avec le framework effectivement retenu par le projet avant le premier déploiement public.
