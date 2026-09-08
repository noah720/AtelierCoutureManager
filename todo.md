# Project TODO

## Réalisé (MVP fonctionnel)

- [x] Définir la direction visuelle et les tokens de design de l’application
- [x] Mettre en place le modèle multi-tenant des marques et l’isolation des données
- [x] Ajouter les rôles et permissions d’accès par marque (owner / manager / staff)
- [x] Migrer le schéma vers PostgreSQL (`pg-core`) — PGlite en local, Neon en production (fin de la divergence MySQL/TiDB)
- [x] Authentification locale e-mail + mot de passe (scrypt + session JWT) — indépendante de tout fournisseur externe
- [x] Schéma complet : organisations, membres, boutiques multi-devises, clients (mensurations), produits (familles/genres/gammes/tailles), variantes, stock par boutique + journal
- [x] Caisse multidevises (7.1) : espèces XOF/USD/EUR combinées, mobile money avec demande de paiement sur numéro, TPE avec référence, reste à payer et monnaie à rendre en temps réel (logique partagée client/serveur)
- [x] Parrainage (5.5) : codes + réduction client/commission configurables, application en caisse
- [x] Commandes clients (7.2) avec articles + fiche de fabrication automatique à l’atelier
- [x] Atelier (8) : circuit en 7 étapes, fiches (commande / confection / retouche), assignation des tâches au barème, paie hebdomadaire à la tâche
- [x] Achats (9) : circuit acheteur → comptable → direction (< 50 000 F CFA : comptable seul), paiement, petite caisse 20 000 XOF (< 2 000 XOF par facture, renflouement)
- [x] Trésorerie (11.1) : caisses boutiques, caisse centrale, banque, mobile money, TPE, boutique en ligne ; mouvements automatiques des ventes et achats
- [x] Personnel (14) : effectifs, pointage arrivée/sortie, paie hebdomadaire (tâche) et mensuelle, primes (gros achat auto 2 %, meilleur vendeur semaine/mois, alerte < 60 points)
- [x] Abonnements (3) : 3 formules, tarifs annuels réduits (20/25/30 %), essai 30 j + semaine de tolérance, demandes de paiement validées par ENVOL
- [x] Administration ENVOL (2) : statistiques, marques, validation des paiements, suspension/réactivation
- [x] Assistance (12) : bouton permanent toutes pages, contexte pré-rempli, historique et réponses
- [x] Données de démonstration DISTINCTION (16) : atelier Lomé, 5 boutiques (Lomé + Douala XAF), personnel, barème (7.4), catalogue, clients, ventes, trésorerie
- [x] Tests Vitest : règlement multidevises, circuit d’achats, cycle d’abonnement, primes, étapes de fabrication, isolation tenant, contrats tRPC
- [x] Vérifier le build, les tests et le rendu desktop/mobile

## À faire (prochaines étapes)

- [ ] Boutique en ligne publique (vitrine, panier, tailles/gammes/couleurs ou sur mesure) branchée sur les stocks agrégés multi-boutiques
- [ ] Intégration Moneroo réelle (mobile money, carte, PayPal) et reversement des ventes aux marques
- [ ] Frais de livraison par zone/ville + calcul DHL au panier
- [ ] Reçu client en PDF envoyé par e-mail à la clôture de la vente
- [ ] Comptabilité SYSCOHADA révisé : plan comptable, écritures automatiques, états financiers
- [ ] Vérification que les comptes en banque correspondent à la trésorerie saisie (rapprochement)
- [ ] Assistant Commercial & Marketing IA (WhatsApp/Facebook/Instagram, modes brouillon / semi-autonome / autonome)
- [ ] Pointage par géolocalisation + horaires détaillés et majoration 20 % hors horaires
- [ ] Prime annuelle (voiture/moto) et fidélité trimestrielle (2 %)
- [ ] Gestion documentaire sécurisée (pièces d’identité, documents d’existence) via stockage externe
- [ ] Configuration finale Netlify/Neon + domaine de la plateforme et domaines personnalisés des marques
