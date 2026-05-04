-- ============================================================================
-- UNIFICATION LEAD ROOM ↔ CRM, étape 1, importer le schéma Lead Room
-- dans le Supabase du CRM (tvgbblbceqvdtqnbeoik).
--
-- Après cette migration, on aura dans le Supabase CRM :
--   - public.profiles (existait déjà, advisors humains côté CRM)
--   - public.deals (existait déjà, deals signés)
--   - public.leads (existait déjà, version CRM, à conserver)
--   - public.leads_room (NOUVEAU, version Lead Room avec custom_fields,
--     score, priority, ai_script, etc., schéma issu du repo Lead Room)
--   - public.calls (NOUVEAU, transcripts Aircall + trame Modjo + Claude)
--   - public.campaigns (NOUVEAU, campagnes Facebook/Zapier)
--   - public.lead_sync_logs (NOUVEAU, journal d'événements webhook)
--   - public.lead_advisors_view (vue qui pont profiles → contrat advisors)
--
-- L'étape 2 (à faire après validation que tout fonctionne) sera de
-- migrer les données du Supabase Lead Room (mtqowhjshvgkpkhnpilb) vers
-- ces tables, repointer les env vars Vercel, et désactiver l'ancien
-- Supabase Lead Room.
-- ============================================================================

-- ─────────────── CAMPAIGNS ───────────────
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  source text not null default 'zapier' check (source in ('zapier', 'facebook_direct', 'manual')),
  active boolean not null default true,
  color_idx int not null default 0,
  score_boost int not null default 0 check (score_boost between 0 and 5),
  cost_per_lead numeric(10, 2) not null default 0,
  advisor_pool_ids uuid[] not null default '{}',
  form_schema jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_campaigns_slug on public.campaigns(slug) where active = true;

-- ─────────────── LEADS_ROOM (renommé pour ne pas collisionner avec leads CRM) ───────────────
-- Note importante, cette table est le SUCCESSEUR de la table leads du
-- Supabase Lead Room. Les colonnes additionnelles (custom_fields, score,
-- ai_script, notes_synthesis, etc.) sont conservées intégralement.
-- La table leads existante du CRM (utilisée par App.jsx pour Leads Live)
-- reste intacte pour ne pas casser l'app actuelle.
create table if not exists public.leads_room (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_slug text,
  advisor_id uuid references public.profiles(id) on delete set null,

  name text not null,
  phone text not null,
  phone_display text,
  email text,
  platform text default 'fb',
  territory text,

  custom_fields jsonb not null default '{}',

  base_score int not null default 0,
  boost int not null default 0,
  score int not null default 0,
  priority text not null default 'C' check (priority in ('A', 'B', 'C')),

  status text not null default 'pending'
    check (status in ('pending', 'taken', 'joined', 'not_joined', 'rdv', 'refused')),
  taken_by uuid references public.profiles(id) on delete set null,
  taken_at timestamptz,
  rdv_date timestamptz,
  refused_at timestamptz,

  ai_script text,
  ai_script_generated_at timestamptz,
  notes text default '',
  notes_synthesis jsonb,

  synced_at timestamptz,
  dossier_client_id uuid,
  prospect_id uuid,
  deal_id text references public.deals(id) on delete set null, -- lien vers le deal CRM

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_room_status on public.leads_room(status, created_at desc);
create index if not exists idx_leads_room_advisor on public.leads_room(advisor_id, status);
create index if not exists idx_leads_room_campaign on public.leads_room(campaign_id, created_at desc);
create index if not exists idx_leads_room_phone on public.leads_room(phone);
create unique index if not exists idx_leads_room_phone_unique on public.leads_room(phone) where status not in ('refused');

-- ─────────────── CALLS (Aircall + Modjo + Claude) ───────────────
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads_room(id) on delete cascade,
  advisor_id uuid references public.profiles(id) on delete set null,
  aircall_call_id text unique not null,
  aircall_recording_url text,
  direction text default 'outbound' check (direction in ('inbound', 'outbound')),
  duration int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript text,
  transcript_received_at timestamptz,
  aircall_summary text,
  aircall_topics jsonb default '[]',
  talk_ratio int,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  trame jsonb,
  trame_generated_at timestamptz,
  intent_score int check (intent_score between 1 and 10),
  next_step text,
  created_at timestamptz not null default now()
);
create index if not exists idx_calls_lead on public.calls(lead_id, started_at desc);
create index if not exists idx_calls_advisor on public.calls(advisor_id, started_at desc);

-- ─────────────── LEAD_SYNC_LOGS ───────────────
create table if not exists public.lead_sync_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads_room(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  event_type text not null,
  target_table text,
  payload jsonb,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_sync_logs on public.lead_sync_logs(lead_id, created_at desc);

-- ─────────────── TRIGGERS updated_at ───────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_room_updated on public.leads_room;
create trigger trg_leads_room_updated before update on public.leads_room
  for each row execute function public.set_updated_at();

drop trigger if exists trg_campaigns_updated on public.campaigns;
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ─────────────── RLS ───────────────
alter table public.leads_room enable row level security;
alter table public.campaigns enable row level security;
alter table public.calls enable row level security;
alter table public.lead_sync_logs enable row level security;

-- leads_room, lecture libre (mode shotgun), update si owner ou manager
drop policy if exists "leads_room_select_authenticated" on public.leads_room;
create policy "leads_room_select_authenticated"
  on public.leads_room for select
  to authenticated
  using (true);

drop policy if exists "leads_room_update_scope" on public.leads_room;
create policy "leads_room_update_scope"
  on public.leads_room for update
  to authenticated
  using (
    public.is_manager()
    or advisor_id = auth.uid()
    or taken_by = auth.uid()
    or advisor_id is null
  )
  with check (
    public.is_manager()
    or advisor_id = auth.uid()
    or taken_by = auth.uid()
    or advisor_id is null
  );

drop policy if exists "leads_room_insert_manager" on public.leads_room;
create policy "leads_room_insert_manager"
  on public.leads_room for insert
  to authenticated
  with check (public.is_manager());

drop policy if exists "leads_room_delete_manager" on public.leads_room;
create policy "leads_room_delete_manager"
  on public.leads_room for delete
  to authenticated
  using (public.is_manager());

-- campaigns, lecture authentifiée, écriture manager
drop policy if exists "campaigns_select_authenticated" on public.campaigns;
create policy "campaigns_select_authenticated"
  on public.campaigns for select
  to authenticated
  using (true);

drop policy if exists "campaigns_write_manager" on public.campaigns;
create policy "campaigns_write_manager"
  on public.campaigns for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- calls, lecture libre, écriture manager (les inserts viennent du
-- webhook serveur via service_role, pas du client)
drop policy if exists "calls_select_authenticated" on public.calls;
create policy "calls_select_authenticated"
  on public.calls for select
  to authenticated
  using (true);

drop policy if exists "calls_write_manager" on public.calls;
create policy "calls_write_manager"
  on public.calls for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- lead_sync_logs, lecture manager only
drop policy if exists "lead_sync_logs_manager" on public.lead_sync_logs;
create policy "lead_sync_logs_manager"
  on public.lead_sync_logs for select
  to authenticated
  using (public.is_manager());

-- ─────────────── REALTIME ───────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'leads_room')
  then alter publication supabase_realtime add table public.leads_room; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calls')
  then alter publication supabase_realtime add table public.calls; end if;
end $$;
