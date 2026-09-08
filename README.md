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
| **Assistant Commercial & Marketing IA** — publications WhatsApp/Facebook/Instagram générées depuis les vraies données, boîte de réception multi-canal avec suggestions de réponse, 3 modes (brouillon / semi-autonome / autonome) avec journal d'activité | ✅ Opérationnel |
| **Comptabilité SYSCOHADA** — écritures automatiques (ventes, achats, règlements, ventes en ligne, paie, virements), balance équilibrée, compte de résultat, bilan simplifié, plan comptable | ✅ Opérationnel |
| **Rapprochement bancaire** — lignes de relevé, rapprochement automatique (montant/sens/date), écarts signalés | ✅ Opérationnel |
| **Reçus clients** — PDF généré sans dépendance (vente boutique ou commande en ligne), envoi par e-mail (Resend/SMTP) ou mode simulation journalisé | ✅ Opérationnel |
| Intégration Moneroo réelle (mobile money, carte, PayPal) | 🚧 Prochaines étapes |

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
2. Pointage par géolocalisation et horaires détaillés (majoration 20 % hors horaires).
4. Primes automatiques planifiées (hebdo / mensuel / annuel / fidélité 2 %), remboursements partiels en pourcentage avec écriture de réversion.

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

## Assistant IA (formule complète)

L'onglet **Assistant IA** du back-office pilote un assistant commercial & marketing (point 6) :

- **Publications** : générées à partir des vraies données de la marque (produit, gamme, prix, stock, zones de livraison, code de parrainage) et adaptées au canal — WhatsApp (réponse directe), Facebook (narratif + lien boutique), Instagram (visuel + hashtags). Circuit brouillon → approuvé → publié, avec copie en un clic.
- **Messages clients** : boîte de réception multi-canal (conversations de démonstration incluses). L'assistant suggère une réponse contextualisée (prix, disponibilité, livraison, sur mesure, commande) ; vous l'éditez et l'envoyez.
- **Trois modes** : *Brouillon* (tout est validé par l'humain), *Semi-autonome* (réponses automatiques aux questions simples, publications à valider), *Autonome* (publication automatique des posts approuvés + réponses automatiques). Chaque action figure dans le journal.
- **LLM optionnel** : avec `OPENAI_API_KEY` (et `OPENAI_MODEL` optionnel), les textes sont rehaussés par un LLM ; sans clé ou en cas d'échec réseau, les gabarits internes sont utilisés tels quels — l'assistant fonctionne toujours.

> Les taux de change sont globaux : seule l'administration ENVOL peut les modifier (Point 12).

## Comptabilité SYSCOHADA & rapprochement (points 10-11)

L'onglet **Comptabilité** génère les écritures automatiques aux normes **SYSCOHADA révisé** (plan simplifié affiché dans l'application) :

- **Ventes** : encaissements débités par compte de trésorerie (caisse boutique 572, mobile money 531, TPE 532, banque 521…), reste client au débit 411 si la vente est partiellement payée, produits crédités en 701 (couture) ou 707 (accessoires) — les réductions de parrainage sont réparties proportionnellement.
- **Achats** : D 6021 (matières premières) ou 6011 (marchandises revendues) / C 401 Fournisseurs dès l'approbation, puis D 401 / C trésorerie au paiement.
- **Ventes en ligne** : D 533 Caisse en ligne / C produits, depuis les mouvements Moneroo.
- **Divers** : paie → 641, abonnement → 628, virements internes → 585, ajustements → 6581/7581.
- La synchronisation est **idempotente** (une opération = une écriture, index unique) et les écritures sont toujours **équilibrées**.
- **États** : balance générale (totaux débit = crédit), compte de résultat, bilan simplifié.
- **Rapprochement bancaire (11)** : importez les lignes de votre relevé, l'assistant rapproche automatiquement (même montant, même sens, ±7 jours), et signale les écarts (lignes ou mouvements non rapprochés) — vérification que la banque correspond à la trésorerie saisie.

## Reçus clients PDF + e-mail (point 13)

- **Génération PDF sans dépendance** : le serveur produit un PDF 1.4 natif (polices Helvetica, WinAnsi) — aucun paquet externe, fonctionne aussi bien en local que sur un hébergeur serverless. Le reçu contient la marque, la boutique, le client, les articles (taille · couleur), les frais de livraison, la réduction de parrainage, le **net à payer**, les règlements et le **reste à payer** éventuel.
- **Ventilation** : vente boutique → bouton « Reçu PDF » et « Envoyer par e-mail » dans la fenêtre de fin de vente de la **Caisse** ; commande en ligne payée → boutons « Reçu » et « E-mail » dans **Opérations → Commandes clients** (destinataire par défaut : l'e-mail du paiement en ligne).
- **Envoi d'e-mail** : `RESEND_API_KEY` (API HTTP, pièce jointe base64) ou `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` (nodemailer s'il est installé). **Sans fournisseur configuré**, l'envoi est **simulé et journalisé** — l'application reste 100 % utilisable en démonstration.
- Chaque téléchargement et chaque envoi est tracé dans le journal des reçus (`receipts.logs`).

## Pointage géolocalisé, horaires & primes planifiées (point 14)

- **Horaires hebdomadaires** par employé (7 jours éditables dans Personnel → « Horaires & majorations ») ; les heures travaillées hors créneau sont **majorées de 20 %** et l'estimation de la majoration du mois s'affiche par employé.
- **Pointage géolocalisé** : les boutons Arrivée/Sortie captent la position du téléphone (navigator.geolocation) et la confrontent au point de vente (rayon de tolérance configurable, 150 m par défaut — coordonnées réelles Lomé/Douala en démo). Hors zone → incident sur la session ; retard au pointage d'ouverture → signalé.
- **Oublis de pointage** : une session encore ouverte plus de 15 minutes après la fin du créneau est **clôturée automatiquement** avec incident (bouton « Détecter les oublis », détection à 15 h d'ouverture continue hors horaire défini).
- **Primes planifiées** (exécution idempotente par clé de période) : meilleur vendeur **hebdomadaire** (5 000 F), **mensuel** (10 000 F), **fidélité trimestrielle** (2 % du CA individuel dès 50 000 F), **prime annuelle voiture/moto** (25 % du salaire de base, chaque employé actif). Aperçu avant exécution, aucune double attribution possible.

## Remboursements, onboarding marques & support admin (points 12 & 15)

- **Remboursements partiels en %** (`sales.refund`) : depuis Opérations → « Ventes & remboursements », remboursement de 1 à 100 % du reste dû sur une vente, avec motif. Génère automatiquement la sortie de trésorerie (caisse de la boutique si elle existe, sinon caisse centrale) puis, à la synchronisation comptable, l'écriture de réversion SYSCOHADA « RMB-XXXX » (débit 701 / crédit compte de trésorerie), idempotente. La vente affiche son taux remboursé et passe en « Remboursée » à 100 %.
- **Parcours d'onboarding des nouvelles marques** (`/onboarding`) : assistant en 3 étapes (marque + formule 50 000 / 150 000 / 250 000 F CFA, premier point de vente avec devise, récapitulatif). Crée le compte, la marque en essai gratuit 30 jours et le premier point de vente ; les utilisateurs sans marque sont redirigés automatiquement vers l'assistant.
- **Réponse support côté admin ENVOL** : l'administration voit tous les tickets, répond en ligne (le ticket passe « en cours », réponse signée « Équipe ENVOL ») puis clôture ; le badge d'état suit ouvert / en cours / résolu / fermé.

## Pointage géolocalisé, horaires & primes planifiées (point 14)