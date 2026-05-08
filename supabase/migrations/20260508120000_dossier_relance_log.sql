-- Table de log des relances automatiques sur dossiers vieillissants.
-- Utilisée par l'Edge Function `relance-dossiers-vieillissants` pour
-- éviter d'envoyer plusieurs relances par semaine sur le même dossier.

create table if not exists public.dossier_relance_log (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.deals(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_to text not null,
  cc text,
  age_days integer not null,
  status_at_send text not null
);

create index if not exists idx_dossier_relance_log_deal_sent
  on public.dossier_relance_log(deal_id, sent_at desc);

alter table public.dossier_relance_log enable row level security;

-- Lecture : managers seulement (audit).
create policy "managers_read_relance_log"
  on public.dossier_relance_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

-- Écriture : service_role uniquement (Edge Function). Pas de policy = bloqué pour les autres.
