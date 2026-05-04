-- ============================================================================
-- UNIFICATION ÉTAPE 2, migration des données du Supabase Lead Room
-- (mtqowhjshvgkpkhnpilb) vers le Supabase CRM (tvgbblbceqvdtqnbeoik).
--
-- À lancer APRÈS la migration de schéma 20260504_unification_leadroom.sql,
-- et SEULEMENT quand tu es prêt à basculer.
--
-- Cette migration utilise dblink pour lire les tables distantes du
-- Supabase Lead Room. Si dblink n'est pas dispo, on peut aussi exporter
-- en CSV depuis le Supabase Lead Room et importer ici.
--
-- Méthode CSV (recommandée, plus simple) :
--
-- 1. Côté Supabase Lead Room SQL Editor, lance, en récupérant les CSV via
--    "Download as CSV" du résultat :
--      select * from advisors;
--      select * from campaigns;
--      select * from leads;
--      select * from calls;
--
-- 2. Côté Supabase CRM, va dans Table Editor, sélectionne la table cible
--    (campaigns, leads_room, calls), et utilise "Insert > Import data
--    from CSV". Mappe les colonnes (par exemple advisor_id côté Lead Room
--    devient advisor_id côté CRM, mais le UUID doit correspondre à
--    profiles.id du CRM, pas à l'ancien advisors.id du Lead Room).
--
-- 3. Pour la table advisors → profiles, c'est plus délicat, voir le
--    script de mapping ci-dessous.
-- ============================================================================

-- ─────────────── MAPPING ADVISORS → PROFILES ───────────────
-- Crée une table temporaire qui fait le pont entre l'ancien advisor_id
-- (Lead Room) et le nouveau profiles.id (CRM), basé sur l'email.
-- Pour chaque advisor de Lead Room, on cherche le profile matchant par
-- email. Si pas trouvé, on crée le profile et on log.
--
-- Exécute ce script DANS le Supabase CRM, en remplaçant la liste
-- advisors_legacy par les données extraites du Supabase Lead Room.

-- Exemple d'extraction côté Lead Room (à coller en VALUES ici) :
--   select format('(''%s'', ''%s'', ''%s'', %s)', id, email, name, color_idx)
--   from advisors;

create temp table advisors_legacy_map (
  legacy_id uuid,
  email text,
  name text,
  color_idx int
);

-- Coller ici les VALUES extraites du Lead Room :
-- insert into advisors_legacy_map values
--   ('00000000-0000-0000-0000-000000000001'::uuid, 'louis.hatton@entasis-conseil.fr', 'Louis', 6),
--   ('00000000-0000-0000-0000-000000000002'::uuid, 'jean.decamps@entasis-conseil.fr', 'Jean', 7),
--   ...
-- ;

-- Création de la table de mapping legacy → new
create temp table advisor_id_remap as
select
  m.legacy_id as old_id,
  p.id as new_id,
  m.email,
  m.name
from advisors_legacy_map m
left join public.profiles p on lower(p.email) = lower(m.email);

-- Vérification, devrait être 0 lignes (sinon, créer les profiles manquants)
-- select * from advisor_id_remap where new_id is null;

-- ─────────────── INSERT campaigns (idempotent) ───────────────
-- À copier-coller depuis l'export Supabase Lead Room.
-- insert into public.campaigns (id, slug, name, source, active, color_idx, score_boost, cost_per_lead, advisor_pool_ids, form_schema, created_at, updated_at)
-- values
--   ('uuid-1', 'succession_2026', 'Succession', 'zapier', true, 7, 2, 12, '{}', '[]', now(), now()),
--   ...
-- on conflict (slug) do update set name = excluded.name, active = excluded.active;

-- ─────────────── INSERT leads_room ───────────────
-- Copie depuis le Supabase Lead Room, en remplaçant advisor_id et taken_by
-- par les nouveaux UUIDs via advisor_id_remap.
--
-- insert into public.leads_room (
--   id, campaign_slug, advisor_id, name, phone, phone_display, email,
--   platform, territory, custom_fields, base_score, boost, score, priority,
--   status, taken_by, taken_at, rdv_date, refused_at, ai_script,
--   ai_script_generated_at, notes, notes_synthesis, synced_at, created_at,
--   updated_at
-- )
-- select
--   l.id, l.campaign_slug,
--   (select new_id from advisor_id_remap where old_id = l.advisor_id),
--   l.name, l.phone, l.phone_display, l.email,
--   l.platform, l.territory, l.custom_fields, l.base_score, l.boost, l.score, l.priority,
--   l.status,
--   (select new_id from advisor_id_remap where old_id = l.taken_by),
--   l.taken_at, l.rdv_date, l.refused_at, l.ai_script,
--   l.ai_script_generated_at, l.notes, l.notes_synthesis, l.synced_at, l.created_at,
--   l.updated_at
-- from <leads import temporaire> l
-- on conflict (id) do nothing;

-- ─────────────── INSERT calls ───────────────
-- Pareil pour les calls, en remplaçant lead_id et advisor_id.

-- ─────────────── VÉRIFICATION ───────────────
-- select count(*) as nb_advisors_legacy, count(distinct new_id) as mapped from advisor_id_remap;
-- select count(*) as nb_leads_room from public.leads_room;
-- select count(*) as nb_calls from public.calls;
