-- ═══════════════════════════════════════════════════════════════════════════
-- META LEADGEN EN DIRECT : deux tables pour la fonction meta-leadgen
--
-- À jouer sur le projet LEAD ROOM (mtqowhjshvgkpkhnpilb), pas sur le CRM.
--
-- meta_forms           quel formulaire Meta alimente quelle campagne Lead Room,
--                      et comment renommer ses questions (field_map).
-- meta_leadgen_events  une ligne par notification reçue : idempotence (Meta
--                      peut renvoyer la même) et journal de ce qui s'est passé.
--
-- RLS active, aucune écriture depuis un navigateur : seule la clé de service
-- de la fonction écrit. Un admin de la Lead Room peut lire, comme sync_logs.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.meta_forms (
  form_id        text primary key,
  campaign_slug  text not null references public.campaigns(slug) on update cascade,
  page_id        text,
  libelle        text,
  -- { "nom de la question Meta": "cle Lead Room" }, ex. { "quelle_est_votre_tmi": "tmi" }
  field_map      jsonb not null default '{}'::jsonb,
  actif          boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.meta_leadgen_events (
  leadgen_id  text primary key,
  form_id     text,
  page_id     text,
  -- recu, transmis, form_inconnu, form_inactif, erreur
  statut      text not null default 'recu',
  detail      text,
  brut        jsonb,
  recu_le     timestamptz not null default now(),
  traite_le   timestamptz
);
create index if not exists idx_meta_leadgen_events_statut on public.meta_leadgen_events (statut, recu_le desc);

alter table public.meta_forms enable row level security;
alter table public.meta_leadgen_events enable row level security;

drop policy if exists meta_forms_select_admin on public.meta_forms;
create policy meta_forms_select_admin on public.meta_forms
  for select to authenticated using (public.current_advisor_is_admin());

drop policy if exists meta_leadgen_events_select_admin on public.meta_leadgen_events;
create policy meta_leadgen_events_select_admin on public.meta_leadgen_events
  for select to authenticated using (public.current_advisor_is_admin());

-- Exemple de rattachement, à adapter avec les vrais identifiants de formulaire :
-- insert into public.meta_forms (form_id, campaign_slug, libelle, field_map) values
--   ('123456789012345', 'simul_impot_1_2026', 'Campagne 1 · Simulateur Réduction Impôt',
--    '{"quelle_est_votre_tranche_marginale_d_imposition": "tmi", "votre_situation": "situation"}');
