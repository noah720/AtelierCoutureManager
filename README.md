# AtelierManager

Plateforme SaaS de gestion pour les marques de couture, les ateliers et les boutiques de mode africaines.

> **AtelierManager** centralise les ventes, les clients, les stocks, la production, les achats, le personnel, la trésorerie et la comptabilité dans un espace de travail unique. La formule complète permet également de publier une boutique en ligne connectée aux stocks physiques.

## Sommaire

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Formules d’abonnement](#formules-dabonnement)
- [Architecture technique](#architecture-technique)
- [Développement local](#développement-local)
- [Variables d’environnement](#variables-denvironnement)
- [Déploiement sur Netlify](#déploiement-sur-netlify)
- [Base de données Neon](#base-de-données-neon)
- [Organisation recommandée](#organisation-recommandée)
- [Sécurité](#sécurité)
- [Feuille de route](#feuille-de-route)
- [Contribution](#contribution)
- [Licence](#licence)

## Présentation

AtelierManager est conçu pour les entreprises de mode qui souhaitent gérer leur activité sans multiplier les outils. La plateforme s’adresse à deux profils principaux : les boutiques qui revendent des vêtements et accessoires, et les marques disposant à la fois d’un atelier de fabrication et de points de vente.

Chaque marque dispose de son propre espace de travail. Elle peut y enregistrer ses établissements, inviter ses collaborateurs, définir les rôles et piloter ses opérations selon la formule choisie. L’équipe opératrice d’ENVOL AFRICA GROUPE dispose, quant à elle, d’un espace d’administration global destiné à la validation des marques, au suivi des abonnements, à l’assistance et à la supervision de la plateforme.

## Fonctionnalités

### Gestion commerciale et boutiques physiques

La plateforme prévoit une caisse pour les ventes en boutique, la gestion des clients et de leurs mensurations, le suivi des commandes et la génération de justificatifs. Une même facture peut combiner plusieurs moyens de paiement. Les paiements en espèces peuvent être saisis dans plusieurs devises, tandis que les paiements électroniques restent exprimés dans la devise locale de la boutique.

Les responsables peuvent gérer plusieurs boutiques ou agences et consulter les ventes, les statistiques, les stocks et les performances des collaborateurs selon leurs autorisations.

### Atelier et production

Pour les marques disposant d’un atelier, les commandes, retouches et demandes de confection sont transformées en fiches de travail. Le circuit de fabrication suit les étapes suivantes :

```text
Coupe → Couture → Broderie → Finition et repassage → Contrôle qualité → Emballage → Livraison
```

Le chef d’atelier peut affecter les tâches aux ouvriers, suivre l’avancement et calculer une rémunération à la tâche à partir d’un barème configurable.

### Stocks et approvisionnement

AtelierManager prévoit la gestion des articles, des matières premières et des fournitures. Pour une boutique en ligne, le stock affiché peut agréger les stocks de plusieurs boutiques physiques. Lorsqu’une pièce n’est disponible dans aucun point de vente, une demande de fabrication peut être transmise à l’atelier.

### Boutique en ligne

La formule complète inclut une vitrine moderne adaptée aux téléphones, un catalogue de vêtements et d’accessoires, la gestion des tailles, couleurs, gammes et options sur mesure, ainsi qu’un programme de parrainage configurable.

Une marque peut utiliser une adresse fournie par la plateforme ou connecter son propre nom de domaine. Les frais de livraison peuvent être configurés par zone et une intégration DHL est prévue pour le calcul des expéditions internationales.

### Paiements

L’intégration de paiement prévue repose sur **Moneroo**, afin de proposer selon le pays du client le mobile money, la carte bancaire ou PayPal. La formule complète pourra également permettre à une marque de connecter son propre compte de paiement pour recevoir directement ses encaissements.

### Personnel et administration

Les droits d’accès dépendent du rôle de chaque collaborateur. Une vendeuse, un chef d’atelier, un magasinier, un responsable de boutique ou un administrateur ne voient que les fonctions nécessaires à leur activité.

Les modules prévus couvrent les horaires, la présence, la paie, les primes commerciales, la trésorerie, la comptabilité et la gestion de plusieurs devises.

### Assistance et intelligence artificielle

Un bouton d’assistance doit rester accessible dans l’espace de travail afin de faciliter les demandes d’aide. Une option indépendante d’**Assistant Commercial et Marketing IA** est également prévue pour accompagner les marques dans leurs activités commerciales et marketing.

## Formules d’abonnement

Chaque nouvelle marque bénéficie d’une période d’essai gratuite de 30 jours. Les conditions commerciales ci-dessous correspondent à la présentation fonctionnelle actuelle du projet et pourront être modifiées depuis l’administration de la plateforme.

| Formule | Contenu principal | Tarif mensuel indicatif |
|---|---|---:|
| **Boutique** | Vente physique, clients, stocks, statistiques, caisse, présence et comptabilité | 50 000 F CFA |
| **Atelier + Boutique** | Formule Boutique, fabrication, achats de fournitures et gestion d’atelier | 150 000 F CFA |
| **Atelier + Boutique + Boutique en ligne** | Formule précédente, boutique en ligne, parrainage, paiement connecté et domaine personnalisé | 250 000 F CFA |
| **Assistant Commercial et Marketing IA** | Option activable séparément, quelle que soit la formule | 100 000 F CFA |

Des réductions sont prévues pour les paiements annuels. Les moyens de paiement envisagés sont le mobile money et la carte bancaire.

## Architecture technique

Le dépôt GitHub constitue la source de vérité du code et de la documentation. Le déploiement applicatif est prévu sur Netlify, tandis que la base de données PostgreSQL est hébergée par Neon.

| Composant | Responsabilité |
|---|---|
| **GitHub** | Versionnement du code, collaboration, issues et pull requests |
| **Netlify** | Hébergement de l’application, déploiements continus et variables d’environnement |
| **Neon** | Base de données PostgreSQL managée et environnements de branche |
| **Passerelle de paiement** | Encaissements et paiements en ligne, selon l’intégration retenue |
| **Services externes** | Livraison, e-mail, stockage de fichiers et fonctionnalités IA, selon les modules activés |

Le dépôt étant en cours d’initialisation, le framework frontend, la structure backend, le système d’authentification et l’outil de migration de base de données devront être précisés dans cette section dès leur implémentation.

### Flux de déploiement cible

```text
Développeur
    ↓
Branche GitHub / Pull Request
    ↓
Validation et fusion dans main
    ↓
Déploiement automatique Netlify
    ↓
Application connectée à Neon
```

Il est recommandé d’utiliser une base Neon distincte pour le développement, la préproduction et la production. Les migrations doivent être versionnées dans Git et exécutées dans un ordre contrôlé.

## Développement local

Clonez le dépôt, installez les dépendances du projet dès que le manifeste correspondant sera disponible, puis configurez les variables d’environnement locales.

```bash
git clone https://github.com/noah720/AtelierCoutureManager.git
cd AtelierCoutureManager
```

Une fois la stack applicative choisie, les commandes exactes seront ajoutées ici. La structure attendue pourra suivre ce modèle :

```text
AtelierCoutureManager/
├── README.md
├── src/ ou app/          # Interface et logique applicative
├── public/               # Ressources publiques
├── db/ ou migrations/    # Schéma et migrations Neon
├── netlify.toml          # Configuration Netlify, si nécessaire
├── .env.example          # Variables documentées sans secrets
└── package.json          # Dépendances et scripts, selon la stack retenue
```

## Variables d’environnement

Les secrets ne doivent jamais être commités dans GitHub. Créez un fichier `.env.local` pour le développement ou configurez les variables directement dans Netlify.

```dotenv
# Connexion PostgreSQL Neon
DATABASE_URL=

# URL publique de l’application
PUBLIC_APP_URL=http://localhost:3000

# Authentification — à compléter selon le fournisseur retenu
AUTH_SECRET=

# Paiement Moneroo — à renseigner lorsque l’intégration sera active
MONEROO_API_KEY=
MONEROO_PUBLIC_KEY=

# Services complémentaires — optionnels
DHL_API_KEY=
EMAIL_API_KEY=
AI_API_KEY=
```

Les noms définitifs doivent être alignés sur le code avant la mise en production. Utilisez les variables protégées de Netlify pour les environnements de production et ne partagez jamais leurs valeurs dans les issues, les logs ou les pull requests.

## Déploiement sur Netlify

Le déploiement cible suit généralement les étapes suivantes :

1. Connecter le dépôt GitHub à un nouveau site Netlify.
2. Sélectionner la branche de production, généralement `main`.
3. Définir la commande de build et le répertoire de publication selon le framework utilisé.
4. Ajouter les variables d’environnement dans les réglages du site Netlify.
5. Renseigner l’URL de connexion à la base Neon de production.
6. Déployer une branche de préproduction et vérifier les migrations, l’authentification et les paiements avant toute mise en ligne.
7. Configurer le domaine de la plateforme et, ultérieurement, le raccordement des domaines personnalisés des marques.

Les commandes exactes de build et de publication seront documentées lorsque la stack frontend sera installée dans le dépôt.

## Base de données Neon

Neon fournit la base PostgreSQL de l’application. Le schéma devra couvrir au minimum les organisations, utilisateurs, rôles, établissements, produits, variantes, clients, commandes, paiements, stocks, mouvements de stock, tâches de production, fournisseurs, fournitures, employés, présences, rémunérations, abonnements et demandes d’assistance.

Chaque donnée appartenant à une marque doit être rattachée à son organisation. Les contrôles d’autorisation doivent être appliqués au niveau de l’application et, lorsque cela est retenu dans l’architecture, renforcés par des politiques PostgreSQL adaptées à l’isolation des organisations.

## Organisation recommandée

Le développement doit privilégier de petites branches thématiques et des pull requests explicites. Toute évolution fonctionnelle importante devrait préciser les règles métier concernées, les changements de schéma, les permissions nécessaires et les scénarios de test.

Les données sensibles, notamment les pièces d’identité, documents d’existence, informations de paiement et données personnelles des clients, doivent être traitées avec un niveau de protection approprié. Les fichiers ne devraient pas être stockés directement dans la base de données, mais dans un service de stockage sécurisé lorsque ce module sera ajouté.

## Sécurité

La sécurité est une exigence structurante du projet. Les mots de passe doivent être gérés par un mécanisme d’authentification robuste, les sessions doivent être protégées, et chaque route doit vérifier l’identité ainsi que le rôle de l’utilisateur. Les accès aux données doivent être isolés par marque et par établissement lorsque cela est nécessaire.

Avant le lancement définitif, il faudra également vérifier la gestion des sauvegardes, la rotation des secrets, les journaux d’administration, la limitation des tentatives de connexion, la conformité des flux de paiement et la politique de conservation des données personnelles.

## Feuille de route

| Étape | Objectif | État |
|---|---|---|
| 1 | Définir la stack frontend et backend | À confirmer |
| 2 | Mettre en place l’authentification et les organisations | À développer |
| 3 | Créer le schéma Neon et les migrations | À développer |
| 4 | Développer les boutiques, clients, produits et ventes | À développer |
| 5 | Ajouter les stocks, achats et flux de production | À développer |
| 6 | Ajouter le personnel, la trésorerie et la comptabilité | À développer |
| 7 | Publier la boutique en ligne et les paiements | À développer |
| 8 | Configurer Netlify, les domaines et la supervision | À développer |
| 9 | Réaliser les tests métier et la préparation au lancement | À planifier |

## Contribution

Les contributions sont les bienvenues. Pour proposer une modification, créez une branche dédiée, documentez l’objectif de votre changement, ajoutez ou mettez à jour les tests concernés, puis ouvrez une pull request vers `main`.

Les évolutions touchant aux paiements, aux permissions, aux données personnelles ou au schéma Neon doivent être accompagnées d’une description précise des risques et de la procédure de retour arrière.

## Licence

Aucune licence open source n’a encore été définie pour ce dépôt. Jusqu’à publication d’une licence explicite par les propriétaires du projet, le code reste soumis aux droits de ses auteurs.

## Références

[1]: https://github.com/noah720/AtelierCoutureManager "Dépôt GitHub AtelierCoutureManager"
[2]: https://docs.netlify.com/ "Documentation officielle Netlify"
[3]: https://neon.tech/docs "Documentation officielle Neon"
[4]: https://docs.github.com/en/get-started/learning-about-github "Documentation officielle GitHub"

Les informations fonctionnelles de ce README proviennent de la présentation produit fournie pour AtelierManager. Les liens techniques renvoient aux documentations officielles de [GitHub][4], [Netlify][2] et [Neon][3].

**Auteur par défaut : Manus AI**
