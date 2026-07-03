-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE CONFORMITE : table conformite_dossiers, projet CRM
-- Date : 2026-07-03
--
-- POURQUOI
-- Suivi des dossiers de conformite produits par les conseillers pour un
-- client donne : reponses au questionnaire reglementaire, score et profil
-- investisseur, generation du PDF, envoi au client, signature.
-- Produit par defaut : Plan Epargne Retraite Individuel (PER IN), GENERALI.
--
-- CYCLE DE VIE (colonne statut, check constraint souple ci dessous)
--   brouillon : dossier cree, reponses en cours de saisie
--   genere    : PDF reglementaire genere (pdf_genere_at renseigne)
--   envoye    : dossier envoye au client (envoye_at renseigne)
--   signe     : dossier signe par le client (signe_at renseigne)
--
-- Idempotente (if not exists partout), a coller en une passe dans le
-- SQL Editor du projet CRM, comme 20260622_deals_indexes.sql.
--
-- ZERO REGRESSION
-- Strictement additif. Nouvelle table, nouveaux index, RLS uniquement sur
-- la nouvelle table. Rien d existant n est modifie.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ═══ 1. Table conformite_dossiers ════════════════════════════════════════════
create table if not exists public.conformite_dossiers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  -- deals.id est du TEXTE dans ce CRM (ids applicatifs D-...), pas un uuid,
  -- cf dossier_relance_log et leadroom_leads qui referencent pareil.
  deal_id text references public.deals(id) on delete set null,
  advisor_code text not null,
  produit text not null default 'Plan Epargne Retraite Individuel (PER IN)',
  compagnie text not null default 'GENERALI',
  nom_produit text,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'genere', 'envoye', 'signe')),
  reponses jsonb not null default '{}'::jsonb,
  score int,
  profil text,
  date_effet date,
  pdf_genere_at timestamptz,
  envoye_at timestamptz,
  signe_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conformite_dossiers is
  'Dossiers de conformite des conseillers (questionnaire reglementaire, score, profil, PDF, envoi, signature). Statuts : brouillon, genere, envoye, signe.';
comment on column public.conformite_dossiers.advisor_code is
  'Code du conseiller proprietaire du dossier (meme referentiel que deals.advisor_code).';
comment on column public.conformite_dossiers.reponses is
  'Reponses brutes au questionnaire, jsonb libre (cle : id de question).';
comment on column public.conformite_dossiers.score is
  'Score calcule a partir des reponses, sert a determiner le profil.';
comment on column public.conformite_dossiers.profil is
  'Profil investisseur deduit du score (prudent, equilibre, dynamique, etc).';

-- ═══ 2. Index ════════════════════════════════════════════════════════════════
create index if not exists idx_conformite_dossiers_advisor_code on public.conformite_dossiers(advisor_code);
create index if not exists idx_conformite_dossiers_client_id    on public.conformite_dossiers(client_id);
create index if not exists idx_conformite_dossiers_statut       on public.conformite_dossiers(statut);

-- ═══ 3. Trigger updated_at ═══════════════════════════════════════════════════
-- Helper reutilisable, deja present si le module recrutement est installe
-- (create or replace, aucun impact sur l existant).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conformite_dossiers_set_updated_at on public.conformite_dossiers;
create trigger conformite_dossiers_set_updated_at
  before update on public.conformite_dossiers
  for each row execute function public.set_updated_at();

-- ═══ 4. RLS ══════════════════════════════════════════════════════════════════
-- Meme style que les autres tables du repo : tout utilisateur authentifie
-- peut lire et ecrire, la granularite par conseiller se fait cote appli
-- (filtre advisor_code). Aucun acces anon.
alter table public.conformite_dossiers enable row level security;

drop policy if exists "conformite select authenticated" on public.conformite_dossiers;
create policy "conformite select authenticated"
  on public.conformite_dossiers
  for select to authenticated
  using (true);

drop policy if exists "conformite insert authenticated" on public.conformite_dossiers;
create policy "conformite insert authenticated"
  on public.conformite_dossiers
  for insert to authenticated
  with check (true);

drop policy if exists "conformite update authenticated" on public.conformite_dossiers;
create policy "conformite update authenticated"
  on public.conformite_dossiers
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "conformite delete authenticated" on public.conformite_dossiers;
create policy "conformite delete authenticated"
  on public.conformite_dossiers
  for delete to authenticated
  using (true);
