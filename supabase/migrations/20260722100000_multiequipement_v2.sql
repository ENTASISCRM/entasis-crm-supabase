-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-ÉQUIPEMENT V2 : réglages cabinet + RLS product_families
--
-- app_settings : petits réglages partagés du cabinet (clé/valeur JSON).
-- Utilisé par le Multi-équipement V2 pour la « campagne du mois » (famille
-- produit mise en avant pour toute l'équipe) et l'objectif de taux de
-- multi-équipement. Lecture : tous les connectés. Écriture : managers.
-- Au passage : activation de la RLS sur product_families (oubli de la V1,
-- signalé par l'advisory Supabase).
-- Appliquée sur PROD et DEV le 22/07/2026.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "settings_read_authenticated" on public.app_settings;
create policy "settings_read_authenticated" on public.app_settings
  for select to authenticated using (true);
drop policy if exists "settings_write_manager" on public.app_settings;
create policy "settings_write_manager" on public.app_settings
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

insert into public.app_settings (key, value) values
  ('multiequipement', '{"campagne_du_mois":"prevoyance","objectif_taux_multi":40}'::jsonb)
on conflict (key) do nothing;

-- RLS sur la table de référence des familles (V1 l'avait laissée ouverte)
alter table public.product_families enable row level security;
drop policy if exists "families_read_authenticated" on public.product_families;
create policy "families_read_authenticated" on public.product_families
  for select to authenticated using (true);
drop policy if exists "families_write_manager" on public.product_families;
create policy "families_write_manager" on public.product_families
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
