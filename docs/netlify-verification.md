# Vérification Netlify — 3 septembre 2026

Le site `ateliercouturemanager` est relié au dépôt GitHub `noah720/AtelierCoutureManager`. La publication automatique depuis `main` est active. Le dernier déploiement observé est `main@ab8d29a`, publié et terminé en 21 secondes.

Le site de production est `https://ateliercouturemanager.netlify.app`. Avant activation du dernier build, la route profonde `/operations/products` renvoyait une page 404. Le correctif `netlify.toml` ajoute un fallback SPA vers `/index.html`; un nouveau contrôle sera nécessaire après le prochain déploiement pour confirmer que la route profonde charge bien l’application.
