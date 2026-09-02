# Controle visuel

En local : `npx vite build`, puis `npx vite preview --port 4173 --strictPort` dans un terminal, puis `npm run test:visuel` dans un autre (variables utiles : `CRM_URL` pour une autre adresse, `PLAYWRIGHT_CHROMIUM_PATH` pour un chromium deja installe, `PLAYWRIGHT_MODULE_DIR` pour un playwright installe hors du depot).

Les captures sont deposees dans `tests/visuel/captures/` (dossier ignore par git) et, en CI, dans l artefact `captures-visuelles` de chaque pull request.

Pour ajouter un scenario : une entree dans `SCENARIOS` de `controle.mjs` avec un nom, un role (`conseiller` ou `manager`), une route hash et, au besoin, une fonction `actions` qui clique jusqu a l ecran voulu ; les verifications communes et la capture s appliquent d elles memes.

Les donnees fictives et la session simulee vivent dans `harnais.mjs` : ajouter une table au dictionnaire `tables` de `pageDemo` suffit pour peupler un nouvel ecran.
