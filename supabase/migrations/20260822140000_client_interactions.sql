-- ═══════════════════════════════════════════════════════════════════════════
-- JOURNAL D'ÉCHANGES CLIENT (Série D / D4 + D10)
--
-- La fiche client devient la mémoire complète de la relation : appels, mails,
-- rendez-vous et notes libres, en une chronologie unique (le « Interactions »
-- de Zoho, le log d'activité de Copper/Close). Saisie manuelle : aucune
-- synchronisation de boîte mail ici, on ne va pas lire les mails des
-- conseillers — ils consignent ce qui compte.
--
-- La timeline de la fiche fusionne ensuite, côté écran, ces échanges avec les
-- activités déjà tracées sur les dossiers (table `activities`).
--
-- Sécurité : visibilité STRICTEMENT alignée sur celle de la fiche client
-- (mêmes règles que clients_select_scope) — un conseiller ne voit que les
-- échanges des clients qu'il peut déjà voir. La suppression est réservée à
-- l'auteur de l'échange et aux managers.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.client_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Type d'échange : liste courte et fermée, alignée sur le quotidien CGP.
  type text not null default 'appel'
    check (type in ('appel','email','rdv','courrier','note')),
  -- Sens de l'échange, utile pour distinguer une relance d'un appel entrant.
  sens text not null default 'sortant' check (sens in ('entrant','sortant','interne')),
  objet text,                       -- titre court, ex. « Relance relevé 2025 »
  contenu text,                     -- compte rendu libre
  occurred_at timestamptz not null default now(),  -- date de l'échange (≠ saisie)
  deal_id text references public.deals(id) on delete set null, -- dossier lié (option)
  -- profiles.id EST l'id auth.users : on référence profiles pour que la
  -- jointure de l'auteur soit explicite et fiable côté API.
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.client_interactions is
  'Journal des échanges avec un client (appels, mails, RDV, notes). Alimente la timeline de la fiche client.';

create index if not exists client_interactions_client_idx
  on public.client_interactions (client_id, occurred_at desc);

alter table public.client_interactions enable row level security;

-- Un échange est visible si sa fiche client l'est : on réutilise la règle de
-- scope des clients plutôt que de la redéfinir (une seule vérité).
drop policy if exists "client_interactions_select_scope" on public.client_interactions;
create policy "client_interactions_select_scope" on public.client_interactions
  for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id));

drop policy if exists "client_interactions_insert_scope" on public.client_interactions;
create policy "client_interactions_insert_scope" on public.client_interactions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id)
  );

drop policy if exists "client_interactions_update_own" on public.client_interactions;
create policy "client_interactions_update_own" on public.client_interactions
  for update to authenticated
  using (created_by = auth.uid() or public.is_manager())
  with check (created_by = auth.uid() or public.is_manager());

drop policy if exists "client_interactions_delete_own" on public.client_interactions;
create policy "client_interactions_delete_own" on public.client_interactions
  for delete to authenticated
  using (created_by = auth.uid() or public.is_manager());
