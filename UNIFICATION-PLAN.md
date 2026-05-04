# Plan d'unification Lead Room ↔ CRM

Basculer la Lead Room (`mtqowhjshvgkpkhnpilb`) sur le Supabase CRM
(`tvgbblbceqvdtqnbeoik`) pour avoir une seule source de vérité, plus de
sync best effort, plus de bug de désynchronisation.

## Pourquoi

Aujourd'hui, 2 Supabase distincts :
- **Lead Room** (`mtqowhjshvgkpkhnpilb`), tables leads, advisors, calls,
  campaigns, sync_logs, prospects, dossier_clients, leads_traites
- **CRM** (`tvgbblbceqvdtqnbeoik`), tables profiles, deals, leads, clients,
  prospects, dossiers_immo, etc.

Le bridge actuel pousse les transitions Lead Room → CRM en best effort,
mais c'est fragile (env var foireuse = silencieux), unidirectionnel (CRM
modifie pas Lead Room) et duplique les données.

## Stratégie

**Coexistence puis switch atomique**, pas de big-bang.

1. **Étape A** (fait dans cette PR), créer le schéma Lead Room dans le
   Supabase CRM, en parallèle des tables existantes. Nouvelle table
   `leads_room` (suffixée pour ne pas collisionner avec `leads` du CRM).
2. **Étape B** (à valider), migrer les données existantes du Supabase
   Lead Room vers les nouvelles tables du CRM (script SQL prêt).
3. **Étape C** (atomique), basculer les env vars Vercel de la Lead Room
   pour qu'elle pointe sur le Supabase CRM. Plus aucun bridge.
4. **Étape D** (cleanup), désactiver l'ancien Supabase Lead Room (mais
   conserver une snapshot read-only au cas où).

## Étape A, schéma (à lancer maintenant côté CRM)

Lance dans Supabase CRM SQL Editor :
```
supabase/migrations/20260504_unification_leadroom.sql
```

Cette migration crée :
- `public.campaigns` (campagnes Facebook/Zapier)
- `public.leads_room` (leads avec custom_fields, score, priority,
  ai_script, notes_synthesis, etc.)
- `public.calls` (transcripts Aircall + trame Modjo + Claude)
- `public.lead_sync_logs` (audit log)
- RLS sur toutes les nouvelles tables, alignée sur le pattern advisor scope
- Realtime activé sur leads_room et calls

**Aucune table existante n'est touchée.** Les tables `leads`, `prospects`,
`clients` du CRM continuent de fonctionner comme avant pour la web app
CRM.

## Étape B, migration des données (quand tu es prêt)

Le fichier `supabase/migrations/20260504_unification_data_migration.sql`
contient le template. Procédure :

1. Exporter depuis le Supabase Lead Room (`mtqowhjshvgkpkhnpilb`) les
   tables advisors, campaigns, leads, calls en CSV.
2. Côté Supabase CRM, importer via le Table Editor.
3. Lancer le script de mapping `advisor_id → profiles.id` (pour aligner
   les FK sur les bons UUIDs).

Durée estimée, 30 min à 1h selon le volume de données (à priori < 1000
leads, < 200 calls).

## Étape C, switch atomique (5 min)

Modifier les env vars Vercel de la Lead Room :
```
NEXT_PUBLIC_SUPABASE_URL=https://tvgbblbceqvdtqnbeoik.supabase.co  # CRM
NEXT_PUBLIC_SUPABASE_ANON_KEY=...                                  # CRM
SUPABASE_URL=https://tvgbblbceqvdtqnbeoik.supabase.co              # CRM
SUPABASE_SERVICE_ROLE_KEY=...                                       # CRM
```

Adapter le code Lead Room pour, soit pointer sur `leads_room` au lieu
de `leads`, soit créer une vue `public.leads` côté CRM qui pointe vers
`leads_room` pour minimiser le code à toucher (plus simple).

## Étape D, cleanup

- Désactiver les webhooks Zapier vers l'ancien Supabase Lead Room (mais
  les nouveaux webhooks pointent toujours sur la Lead Room app, qui
  désormais écrit côté CRM)
- Snapshot le Supabase Lead Room (`pg_dump` complet) pour archive
- Désactiver le projet Supabase Lead Room dans le dashboard
- Retirer les env vars CRM_SUPABASE_* (le bridge n'a plus de sens)
- Supprimer `lib/crm-bridge.ts` du repo Lead Room
- Supprimer les routes API `/api/admin/crm-stats` et autres qui
  parlaient au bridge

## Risques

- **Migration de données**, si on rate le mapping advisor_id → profiles.id,
  les leads se retrouvent sans owner. Mitigation, table `advisor_id_remap`
  intermédiaire avec vérif zéro mismatch avant de toucher leads_room.
- **Conflit de noms**, table `leads` existe dans les 2 univers avec des
  schémas très différents. On suffixe en `leads_room` côté CRM pour
  éviter le drama. Long terme, on pourra renommer si la table `leads`
  CRM disparaît.
- **RLS**, les policies `leads_room` ouvrent SELECT à tout authentifié
  (mode shotgun). Un advisor peut donc voir les leads des autres. C'est
  voulu (mode shotgun de la Lead Room).
- **Realtime**, à vérifier que les events arrivent bien après la
  migration (cf migration 20260504_realtime_deals.sql qui ajoute
  les nouvelles tables à la publication).

## Tests post-migration

```sql
-- Combien de leads dans la nouvelle table ?
select count(*) from public.leads_room;

-- Tous les leads ont un advisor mappé ?
select count(*) from public.leads_room where advisor_id is null;

-- Cross check, comparer total avec l'ancien Supabase Lead Room
-- (à lancer dans le Supabase Lead Room)
select count(*) from leads;
```

## Estimation totale

- Étape A, 5 min (déjà prête, migration SQL à lancer)
- Étape B, 1-2h (export/import CSV + mapping)
- Étape C, 30 min (env vars + tests)
- Étape D, 30 min (cleanup)

Total, demi-journée tranquille.

## Pas faisable automatiquement

L'export depuis le Supabase Lead Room nécessite ses credentials, que je
n'ai pas. C'est l'étape humaine incompressible.

Quand tu es prêt à lancer l'étape B, dis-moi et je peux te générer un
script automatisé qui fait tout via service_role keys (j'ai besoin des
deux, Lead Room + CRM).
