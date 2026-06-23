-- Index de performance sur la table la plus sollicitee du CRM (deals).
-- Sans index, chaque requete (login, Realtime, RLS sur advisor_code, funnel,
-- prevision, affaires signees) fait un full scan. Idempotent (IF NOT EXISTS),
-- a lancer une fois dans le SQL Editor du projet CRM.

create index if not exists idx_deals_advisor_code    on public.deals(advisor_code);
create index if not exists idx_deals_co_advisor_code on public.deals(co_advisor_code);
create index if not exists idx_deals_month_status    on public.deals(month, status);
create index if not exists idx_deals_created_at      on public.deals(created_at desc);
create index if not exists idx_deals_client_id       on public.deals(client_id);
-- Index partiel : les requetes de production filtrent status = 'Signé' + date_signed.
create index if not exists idx_deals_date_signed_ok  on public.deals(date_signed) where status = 'Signé';

analyze public.deals;
