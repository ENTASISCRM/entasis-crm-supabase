-- Campagnes commerciales ciblees sur les fiches clients.
--
-- Une campagne est definie par la direction a partir de criteres sur les
-- fiches (statut, age, revenus, patrimoine, situation, familles equipees ou
-- absentes). Ses cibles sont figees au lancement, une ligne par client, avec
-- le conseiller de la fiche et un statut de suivi que le conseiller fait
-- avancer depuis Ma journee. Aucun montant, aucune commission : le suivi se
-- fait en nombre de clients.
--
-- RLS : tout le cabinet lit les campagnes ; seule la direction les cree ;
-- un conseiller ne voit et ne met a jour que ses propres cibles.
-- Appliquee en production le 2 septembre 2026.

create table if not exists public.campagnes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  criteres jsonb not null default '{}'::jsonb,
  sequence_key text,
  accroche text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  cloturee_at timestamptz
);

create table if not exists public.campagne_cibles (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagnes(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  advisor_code text,
  statut text not null default 'a_contacter'
    check (statut in ('a_contacter', 'contacte', 'rdv', 'signe', 'pas_interesse')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (campagne_id, client_id)
);

create index if not exists campagne_cibles_conseiller_statut on public.campagne_cibles (advisor_code, statut);
create index if not exists campagne_cibles_campagne on public.campagne_cibles (campagne_id);

alter table public.campagnes enable row level security;
alter table public.campagne_cibles enable row level security;

drop policy if exists campagnes_select_staff on public.campagnes;
create policy campagnes_select_staff on public.campagnes
  for select to authenticated using ((select public.is_staff()));

drop policy if exists campagnes_write_manager on public.campagnes;
create policy campagnes_write_manager on public.campagnes
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

drop policy if exists campagne_cibles_select on public.campagne_cibles;
create policy campagne_cibles_select on public.campagne_cibles
  for select to authenticated
  using ((select public.is_manager()) or advisor_code = (select public.current_advisor_code()));

drop policy if exists campagne_cibles_update on public.campagne_cibles;
create policy campagne_cibles_update on public.campagne_cibles
  for update to authenticated
  using ((select public.is_manager()) or advisor_code = (select public.current_advisor_code()))
  with check ((select public.is_manager()) or advisor_code = (select public.current_advisor_code()));

drop policy if exists campagne_cibles_insert_manager on public.campagne_cibles;
create policy campagne_cibles_insert_manager on public.campagne_cibles
  for insert to authenticated with check ((select public.is_manager()));

drop policy if exists campagne_cibles_delete_manager on public.campagne_cibles;
create policy campagne_cibles_delete_manager on public.campagne_cibles
  for delete to authenticated using ((select public.is_manager()));

comment on table public.campagnes is 'Campagnes ciblees sur les fiches clients, definies par la direction';
comment on table public.campagne_cibles is 'Une ligne par client cible, suivie par le conseiller depuis Ma journee';
