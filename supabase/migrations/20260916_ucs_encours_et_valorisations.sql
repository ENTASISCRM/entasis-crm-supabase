-- Suivi des produits structures reellement places par le cabinet.
--
-- Demande de Louis, 16/09/2026 : « voir ou en sont mes produits structures en
-- direct, avec les en-cours que j ai dessus, que je pourrais rentrer ». Les
-- dossiers ne sont pas relies a une UCS (aucune colonne ne porte l ISIN), et
-- il n existe aucune source publique de cours pour ces EMTN : la valorisation
-- vient du reporting du structureur, que la direction recoit et saisit. Le
-- schema porte donc trois choses : l encours place, saisi par la direction ;
-- la derniere valorisation connue, en pour cent du nominal, avec sa date ;
-- et l historique de ces valorisations, pour lire la courbe.
--
-- Appliquee en production le 16/09/2026.

alter table public.ucs_structures
  add column if not exists encours_place numeric(14,2) not null default 0,
  add column if not exists derniere_valo numeric(8,3),
  add column if not exists derniere_valo_le date;

comment on column public.ucs_structures.encours_place is 'Montant place par le cabinet sur cette UCS, saisi par la direction (les dossiers ne portent pas l ISIN).';
comment on column public.ucs_structures.derniere_valo is 'Derniere valorisation connue, en pour cent du nominal (100 = pair). Vient du reporting du structureur.';

create table if not exists public.ucs_valorisations (
  id uuid primary key default gen_random_uuid(),
  ucs_id uuid not null references public.ucs_structures(id) on delete cascade,
  date_valo date not null,
  valeur numeric(8,3) not null,
  source text,
  saisi_par uuid,
  created_at timestamptz not null default now(),
  unique (ucs_id, date_valo)
);
create index if not exists idx_ucs_valorisations_ucs_date on public.ucs_valorisations (ucs_id, date_valo desc);

alter table public.ucs_valorisations enable row level security;
drop policy if exists ucs_valorisations_direction_seule on public.ucs_valorisations;
create policy ucs_valorisations_direction_seule on public.ucs_valorisations
  for all using (public.est_direction_pnl()) with check (public.est_direction_pnl());

create or replace function public.ucs_valo_maj_derniere()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.ucs_structures u
     set derniere_valo = new.valeur,
         derniere_valo_le = new.date_valo,
         updated_at = now()
   where u.id = new.ucs_id
     and (u.derniere_valo_le is null or u.derniere_valo_le <= new.date_valo);
  return new;
end;
$function$;

drop trigger if exists trg_ucs_valo_maj_derniere on public.ucs_valorisations;
create trigger trg_ucs_valo_maj_derniere
  after insert or update on public.ucs_valorisations
  for each row execute function public.ucs_valo_maj_derniere();

insert into public.ucs_structures (etat, compagnie, nom_ucs, code_isin, minimum_requis, notes_internes)
select 'EN_COURS', 'SWISSLIFE', 'Luxury Leaders Mars 2026', 'FR1459ABB225', 1000,
       'Ajoute le 16/09/2026 depuis les ISIN transmis par la direction pour le reporting. Structureur, sous-jacent, coupon, maturite et minimum a completer.'
where not exists (select 1 from public.ucs_structures where code_isin = 'FR1459ABB225');

insert into public.ucs_structures (etat, compagnie, nom_ucs, code_isin, minimum_requis, notes_internes)
select 'EN_COURS', 'SWISSLIFE', 'Cible Taux France Avril 2026', 'FR1459ABB704', 1000,
       'Ajoute le 16/09/2026 depuis les ISIN transmis par la direction pour le reporting. Structureur, sous-jacent, coupon, maturite et minimum a completer.'
where not exists (select 1 from public.ucs_structures where code_isin = 'FR1459ABB704');
