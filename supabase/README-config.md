# Pourquoi `supabase/config.toml` est versionné

## Le problème qu'il ferme

Les deux Edge Functions du CRM — `relance-dossiers-vieillissants` (envoie des
e-mails de relance avec la clé `service_role`) et `sync-programmes` (upsert dans
`programmes`) — doivent n'être invocables que par un appelant authentifié. Le
garde-fou côté plateforme s'appelle `verify_jwt` : à `true`, Supabase refuse
toute invocation sans JWT valide dans l'en-tête `Authorization`.

Jusqu'à ce fichier, **`config.toml` n'était pas dans le dépôt**. La valeur de
`verify_jwt` reposait donc uniquement sur un réglage implicite du Dashboard,
avec deux risques :

1. **Régression silencieuse** — un futur `supabase functions deploy` lancé avec
   un `config.toml` local incomplet (ou généré par défaut) pouvait repositionner
   `verify_jwt = false` sans revue, ré-ouvrant les fonctions à une invocation
   publique anonyme. Pour `relance-dossiers-vieillissants`, cela signifie
   déclencher des envois d'e-mails avec la `service_role` depuis l'extérieur.
2. **Absence de trace** — rien dans le code ne documentait l'intention
   « ces fonctions exigent une auth ». Le versionner rend l'invariant explicite
   et reviewable en PR.

## Pourquoi `verify_jwt = true` ne casse rien

Vérifié le 2026-07-14, les deux voies d'appel existantes portent déjà un JWT
valide :

| Fonction | Appelée par | En-tête d'auth |
|---|---|---|
| `relance-dossiers-vieillissants` | pg_cron (`net.http_post`) | `Bearer <service_role>` depuis le vault — JWT valide |
| `sync-programmes` | navigateur (`supabase.functions.invoke`) | JWT de session de l'utilisateur connecté — valide |

`verify_jwt = true` accepte tout JWT signé par le projet (service_role, anon,
session utilisateur) et ne rejette que les appels **sans** en-tête ou avec un
jeton forgé. Les flux légitimes passent donc inchangés ; seul l'accès anonyme
public est fermé.

## Ce qu'il reste à faire (Louis)

Ce fichier n'est **pas déployé**. Pour l'appliquer :

1. `supabase link --project-ref tvgbblbceqvdtqnbeoik` (décommenter `project_id`
   dans `config.toml` si tu préfères le figer).
2. Valider en **preview** que le cron de relance et le bouton « synchroniser les
   programmes » fonctionnent toujours.
3. `supabase functions deploy relance-dossiers-vieillissants sync-programmes`.
4. Confirmer côté Dashboard que `verify_jwt` est bien à `true` pour les deux.

Tant que ce n'est pas fait, l'état réel de `verify_jwt` en prod reste **à
confirmer** (cf. audit, item F2) — Supabase applique `verify_jwt = true` par
défaut au déploiement, mais rien ne le prouve sans accès Dashboard.
