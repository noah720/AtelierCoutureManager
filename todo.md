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
- [x] Assistant Commercial & Marketing IA (6) : publications WhatsApp/Facebook/Instagram générées depuis les vraies données (produits, prix, zones, parrainage), circuit brouillon → approuvé → publié, boîte de réception multi-canal avec suggestions de réponse, 3 modes (brouillon / semi-autonome / autonome), journal d'activité, rehaussement LLM optionnel (OPENAI_API_KEY)
- [x] Taux de change : mise à jour réservée à l'administration ENVOL (rates.update admin-only)
- [x] Comptabilité SYSCOHADA révisé (10) : écritures automatiques et idempotentes (ventes multi-comptes + reste client 411, achats 6011/6021 + 401, règlements, ventes en ligne 533, paie 641, abonnement 628, virements 585), balance générale équilibrée, compte de résultat, bilan simplifié, plan comptable affiché
- [x] Rapprochement bancaire (11) : lignes de relevé, rapprochement automatique (montant/sens/±7 jours), association manuelle, écarts signalés (point 11)
- [x] Pointage géolocalisé + horaires (14.2) : géorepérage haversine par point de vente (rayon configurable), horaires hebdomadaires par employé, majoration +20 % des heures hors créneau, retard signalé, oubli de pointage clôturé automatiquement (> 15 min), résumé mensuel des majorations
- [x] Primes planifiées (14.3) : meilleur vendeur hebdo (5 000 F) et mensuel (10 000 F), fidélité trimestrielle (2 % du CA dès 50 000 F), prime annuelle voiture/moto (25 % du salaire), exécution idempotente par clé de période
- [x] Remboursements partiels en % (15) : `sales.refund` (1–100 % du reste dû, motif), sortie de trésorerie auto + écriture de réversion SYSCOHADA RMB (701 / trésorerie) idempotente, badge « Remboursé X % » dans Opérations
- [x] Onboarding des nouvelles marques (15) : assistant /onboarding en 3 étapes (marque + formule 50k/150k/250k, premier point de vente + devise, récap), essai 30 j, redirection auto des comptes sans marque
- [x] Support admin ENVOL (12) : vue de tous les tickets, réponse en ligne (ticket → en cours, signée Équipe ENVOL), clôture, badges d'état
- [x] Reçus clients PDF + e-mail (13) : générateur PDF sans dépendance (articles, livraison, parrainage, net à payer, reste à payer), téléchargement depuis la Caisse (ventes) et Opérations (commandes en ligne payées), envoi Resend/SMTP ou simulation journalisée

## À faire (prochaines étapes)

- [ ] Intégration Moneroo réelle (mobile money, carte, PayPal) et reversement des ventes aux marques
- [ ] Frais de livraison par zone/ville + calcul DHL au panier
- [ ] Gestion documentaire sécurisée (pièces d’identité, documents d’existence) via stockage externe
- [ ] Configuration finale Netlify/Neon + domaine de la plateforme et domaines personnalisés des marques
