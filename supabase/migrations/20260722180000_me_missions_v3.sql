-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-ÉQUIPEMENT V3 : table de suivi des missions de cross-sell
--
-- Une mission = un client + une famille de produit à vendre. Statuts :
--   a_attaquer (défaut, calculé), en_cours (le conseiller a attaqué),
--   reportee (« Plus tard » AVEC raison obligatoire + date de retour, la
--   mission revient à l'échéance), gagnee (posée automatiquement quand un
--   deal de la famille est signé pour ce client, montant_reel renseigné),
--   exclue (client non éligible, raison obligatoire, visible manager).
-- Anti zap (décision Louis 20/07) : pas de report sans raison ni échéance,
-- les euros reportés restent comptés et visibles par la direction.
-- RLS alignée sur clients. Appliquée sur PROD et DEV le 20/07/2026.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.me_missions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  famille text not null references public.product_families(key),
  statut text not null default 'a_attaquer'
    check (statut in ('a_attaquer','en_cours','gagnee','reportee','exclue')),
  montant_estime numeric,
  montant_reel numeric,
  raison_report text,
  retour_le date,
  advisor_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, famille)
);

alter table public.me_missions enable row level security;
drop policy if exists "missions_select_scope" on public.me_missions;
create policy "missions_select_scope" on public.me_missions for select using (
  exists (select 1 from public.clients c where c.id = client_id
    and (public.is_manager() or c.advisor_code = public.current_advisor_code()
         or c.co_advisor_code = public.current_advisor_code())));
drop policy if exists "missions_write_scope" on public.me_missions;
create policy "missions_write_scope" on public.me_missions for all using (
  exists (select 1 from public.clients c where c.id = client_id
    and (public.is_manager() or c.advisor_code = public.current_advisor_code()
         or c.co_advisor_code = public.current_advisor_code())))
  with check (
  exists (select 1 from public.clients c where c.id = client_id
    and (public.is_manager() or c.advisor_code = public.current_advisor_code()
         or c.co_advisor_code = public.current_advisor_code())));
