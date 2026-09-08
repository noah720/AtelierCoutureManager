# AtelierManager

**Plateforme SaaS de gestion pour les marques de couture, les ateliers et les boutiques de mode africaines.**

> AtelierManager centralise les ventes, les clients, les stocks, la production, les achats, le personnel, la trésorerie et la comptabilité dans un espace de travail unique — avec, pour la formule complète, une boutique en ligne connectée aux stocks physiques.

## État du projet (MVP fonctionnel)

L'application tourne de bout en bout : authentification locale, espace de marque multi-tenant avec rôles, et les modules cœur de la présentation produit.

| Module | État |
|---|---|
| Comptes & connexion (e-mail + mot de passe, sessions JWT) | ✅ Opérationnel |
| Marques multi-tenant (essai 30 j, rôles owner/manager/staff, isolation des données) | ✅ Opérationnel |
| Boutiques & agences (multi-pays, multi-devises XOF/XAF/USD/EUR) | ✅ Opérationnel |
| Clients avec mensurations, notes et fiches détaillées | ✅ Opérationnel |
| Catalogue (familles, genres, gammes Leader/VIP/Royale/Présidentiel, tailles S→3XL + sur mesure, variantes SKU) | ✅ Opérationnel |
| Stock par boutique avec journal des mouvements | ✅ Opérationnel |
| **Caisse multidevises** — espèces XOF/USD/EUR combinées + mobile money (demande de paiement sur numéro) + TPE (référence) + reste à payer & monnaie à rendre en temps réel | ✅ Opérationnel |
| Parrainage (codes + lien, réduction client et commission configurables) | ✅ Opérationnel |
| Commandes clients → fiche de fabrication automatique à l'atelier | ✅ Opérationnel |
| **Atelier** — circuit Coupe → Couture → Broderie → Finition → Contrôle qualité → Emballage → Livraison, barème de paye à la tâche, paie hebdomadaire | ✅ Opérationnel |
| **Achats** — circuit acheteur → comptable → direction (< 50 000 F CFA : comptable seul), petite caisse 20 000 XOF pour les achats < 2 000 XOF | ✅ Opérationnel |
| **Trésorerie** — caisses boutiques, caisse centrale, banque, mobile money, TPE, boutique en ligne, petite caisse ; mouvements automatiques des ventes et achats | ✅ Opérationnel |
| **Personnel** — effectifs par poste, pointage arrivée/sortie, primes (gros achat automatique 2 %, meilleur vendeur, alerte < 60 points/mois) | ✅ Opérationnel |
| **Abonnements** — 3 formules (50 k / 150 k / 250 k F CFA), réductions annuelles 20/25/30 %, semaine de tolérance, validation ENVOL | ✅ Opérationnel |
| **Administration ENVOL** — validation des marques, paiements d'abonnement, suspension/réactivation | ✅ Opérationnel |
| Assistance — bouton permanent sur toutes les pages, contexte pré-rempli, historique | ✅ Opérationnel |
| **Boutique en ligne publique** — vitrine sans compte (`/boutique/<marque>`), panier, tailles S→3XL ou sur mesure, stocks agrégés multi-boutiques, zones de livraison (dont DHL international), code parrainage, paiement Moneroo (simulation si clé absente) | ✅ Opérationnel |
| Intégration Moneroo réelle (mobile money, carte, PayPal), reçu PDF + e-mail, Assistant IA | 🚧 Prochaines étapes |

## Démarrage rapide

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Au premier démarrage, l'application crée automatiquement une base **PostgreSQL embarquée (PGlite)** dans `.data/`, applique les migrations puis installe les données de démonstration de la marque test **DISTINCTION** (section 16 de la présentation).

### Comptes de démonstration

| Compte | Mot de passe | Rôle |
|---|---|---|
| `proprietaire@distinction.tg` | `demo2026` | Propriétaire DISTINCTION (formule complète) |
| `chef.atelier@distinction.tg` | `demo2026` | Chef d'atelier |
| `comptable@distinction.tg` | `demo2026` | Comptable (validations d'achats) |
| `vendeuse@distinction.tg` | `demo2026` | Vendeuse (caisse) |
| `admin@envol.africa` | `envol2026` | Administration plateforme ENVOL |

### Scripts

```bash
pnpm dev           # serveur de développement (API + interface)
pnpm test          # tests Vitest (logique métier + contrats tRPC)
pnpm build         # build de production (interface + serveur)
pnpm check         # vérification TypeScript
pnpm db:generate   # génère les migrations Drizzle après modification du schéma
pnpm db:seed       # réinstalle les données de démonstration
pnpm db:reset      # repart d'une base vide + démonstration
```

## Architecture

| Composant | Technologie |
|---|---|
| Interface | React 19, Vite 7, Tailwind 4, shadcn/ui, wouter, TanStack Query |
| API | tRPC v11 sur Express (`/api/trpc`), validation Zod |
| Base de données | **PostgreSQL** via Drizzle ORM — PGlite (embarqué) en local, **Neon** en production |
| Authentification | E-mail + mot de passe (scrypt), session JWT httpOnly |
| Tests | Vitest — règlement multidevises, circuit d'achats, abonnements, primes, isolation tenant |
| Déploiement | Netlify (`netlify.toml`) — cible conservée |

```
client/src            Interface (pages, composants, thème)
server/_core          Serveur Express, tRPC, auth, sessions
server/routers        Modules tRPC par domaine métier
server/domain         Règles métier pures (testées sans base)
shared                Code partagé client/serveur (dont la logique monétaire)
drizzle               Schéma PostgreSQL + migrations
```

La logique monétaire (conversions, reste à payer, monnaie à rendre, réduction de parrainage) vit dans `shared/money.ts` : client et serveur calculent exactement pareil.

## Production avec Neon

1. Renseigner `DATABASE_URL` (chaîne `postgresql://…` Neon) dans l'environnement — les migrations sont appliquées au démarrage.
2. `JWT_SECRET` : secret de signature des sessions.
3. Déployer sur Netlify (`pnpm build`, publication `dist/public`) ou tout hébergeur Node 22.

Les migrations sont versionnées dans `drizzle/` (`pnpm db:generate` après toute modification de `drizzle/schema.ts`).

## Feuille de route (prochaines étapes)

1. Intégration Moneroo réelle (mobile money, carte, PayPal) + reversement des ventes — la caisse de simulation est déjà en place (`MONEROO_API_KEY` + `MONEROO_WEBHOOK_SECRET`).
2. Expédition du reçu client par e-mail (PDF).
3. Comptabilité SYSCOHADA (plan comptable, écritures automatiques, états) + rapprochement bancaire.
4. Assistant Commercial & Marketing IA (WhatsApp / réseaux sociaux, modes brouillon / semi-autonome / autonome).
5. Pointage par géolocalisation et horaires détaillés (majoration 20 % hors horaires).
6. Primes automatiques planifiées (hebdo / mensuel / annuel / fidélité 2 %), remboursements partiels.

## Boutique en ligne (formule complète)

La marque publiée expose une vitrine **publique, sans compte** sur `/boutique/<slug>` :

- **Catalogue** : produits actifs de la marque, recherche + catégories, badge « Disponible » ou « À fabriquer » (stock agrégé de toutes les boutiques actives).
- **Panier** : localStorage (`am_cart_<slug>`), tailles S→3XL, **sur mesure** avec mensurations (poitrine, taille, hanches, longueur) et couleur libre.
- **Livraison** : zones tarifées de la marque (Lomé, Reste du Togo, Douala, Dakar, **International DHL** en démo). La ligne part de la boutique qui livre : même ville d'abord, sinon plus grand stock, sinon **demande de fabrication à l'atelier** (5.3).
- **Code parrainage** : réduction client appliquée aux articles uniquement (le taux est celui configuré par la marque, 10 % par défaut).
- **Paiement** : sans `MONEROO_API_KEY`, caisse de **simulation** (MTN, Moov, Orange, Wave, carte) qui encaisse immédiatement ; avec la clé, redirige vers Moneroo et le webhook signé `POST /api/webhooks/moneroo` (HMAC-SHA512 du corps brut, en-tête `x-moneroo-signature`) confirme le paiement.
- **Encaissement** : commande `WEB-xxxx` (statut `confirmée`, paiement `payé`) + mouvement de trésorerie automatique dans le compte **« Boutique en ligne (Moneroo) »** ; rupture → fiche de production « commande » avec les mensurations du client.
- **Réglages** : le propriétaire gère ses zones de livraison et voit le lien de sa vitrine dans Paramètres → « Boutique en ligne & livraison ».
8. Prime annuelle (voiture / moto) et fidélité trimestrielle.

## Contribution

Petites branches thématiques et pull requests vers `main`. Toute évolution touchant aux paiements, aux permissions ou au schéma doit être accompagnée de tests (`pnpm test`).

## Licence

MIT.
