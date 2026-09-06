-- Ces objets tournaient en production sans exister dans un seul fichier de
-- migration : personne n aurait pu reconstruire le module, ni savoir ce qu il
-- calcule vraiment. Ce fichier fige le texte exact de ce qui est deploye.
-- Il est idempotent : le rejouer sur la base actuelle ne change rien.

-- ── Les parametres qui pilotent l attribution et l objectif ───────────────
alter table public.pnl_parametres
  add column if not exists objectif_resultat_annuel numeric not null default 0,
  -- Quel grand livre fait foi pour dire QUI a signe. Un bordereau dit sur quel
  -- compte le contrat est loge, pas qui a vendu.
  add column if not exists source_attribution text not null default 'CA MOIS',
  -- Taux de commission MESURES sur le grand livre, jamais supposes : ils
  -- servent a valoriser les volumes du CRM sur les mois que le grand livre ne
  -- couvre pas encore.
  add column if not exists taux_com_pp numeric not null default 0.318,
  add column if not exists taux_com_pu numeric not null default 0.0378;

-- ── La tresorerie, calee sur les soldes bancaires ─────────────────────────
-- Ce n est PAS le resultat : l impot, les remboursements de dette et les
-- achats immobilises sortent de la banque sans etre des charges de l annee.
create table if not exists public.tresorerie_mensuelle (
  annee integer not null,
  mois integer not null check (mois between 1 and 12),
  commissions numeric not null default 0,
  autres_encaissements numeric not null default 0,
  decaissements numeric not null default 0,
  net numeric,
  source text not null default 'RELEVES BANCAIRES',
  note text,
  updated_at timestamptz not null default now(),
  primary key (annee, mois)
);

alter table public.tresorerie_mensuelle enable row level security;
drop policy if exists tresorerie_direction on public.tresorerie_mensuelle;
create policy tresorerie_direction on public.tresorerie_mensuelle
  using (public.est_direction_pnl());

-- ── La production telle que le CRM la porte ───────────────────────────────
-- Le co conseil partage la production en deux parts egales : les deux lignes
-- portent chacune la moitie des primes, et donc la moitie de la commission.
create or replace view public.v_production_crm as
with prm as (
  select p.taux_com_pp, p.taux_com_pu from public.pnl_parametres p where p.id = true
), parts as (
  select d.advisor_code as code, d.date_signed,
    coalesce(d.pp_m, 0) as pp, coalesce(d.pu, 0) as pu,
    case when d.co_advisor_code is not null then 0.5 else 1 end as part
  from public.deals d
  where d.status = 'Signé' and d.date_signed ~ '^\d{4}-\d{2}-\d{2}$'
    and d.advisor_code is not null
  union all
  select d.co_advisor_code, d.date_signed,
    coalesce(d.pp_m, 0), coalesce(d.pu, 0), 0.5
  from public.deals d
  where d.status = 'Signé' and d.date_signed ~ '^\d{4}-\d{2}-\d{2}$'
    and d.co_advisor_code is not null
)
select p.code as advisor_code,
  substr(p.date_signed, 1, 4)::integer as annee,
  substr(p.date_signed, 6, 2)::integer as mois,
  count(*)::integer as dossiers,
  round(sum(p.pp * p.part), 2) as pp_mensuelle,
  round(sum(p.pu * p.part), 2) as pu,
  round(sum(p.pp * p.part) * prm.taux_com_pp + sum(p.pu * p.part) * prm.taux_com_pu, 2) as commission
from parts p cross join prm
group by p.code, substr(p.date_signed, 1, 4), substr(p.date_signed, 6, 2),
  prm.taux_com_pp, prm.taux_com_pu;

-- ── La production retenue : une seule source par mois ─────────────────────
-- Le grand livre tant qu il couvre le mois, le CRM sinon. Jamais les deux :
-- additionner un mois saisi a la main et le meme mois lu dans le CRM le
-- compterait deux fois. Le CRM ne devient dense qu en avril, et le grand livre
-- s arrete la ou Louis a cesse de le remplir.
create or replace view public.v_production_retenue as
with src as (
  select coalesce(p.source_attribution, 'CA MOIS') as s
  from public.pnl_parametres p where p.id = true
), livre as (
  select pe.advisor_code, pe.profile_id, pe.annee, pe.mois,
    sum(pe.commission_encaissee) as commission,
    sum(pe.retrocession) as retrocession,
    count(*)::integer as dossiers
  from public.production_encaissee pe cross join src
  where pe.source = src.s and pe.commission_encaissee <> 0
  group by pe.advisor_code, pe.profile_id, pe.annee, pe.mois
), mois_couverts as (
  select distinct l.annee, l.mois from livre l
)
select l.advisor_code, l.profile_id, l.annee, l.mois,
  l.commission, l.retrocession, l.dossiers, 'GRAND LIVRE'::text as origine
from livre l
union all
select c.advisor_code, p.id, c.annee, c.mois,
  c.commission, 0::numeric, c.dossiers, 'CRM'::text
from public.v_production_crm c
left join public.profiles p on p.advisor_code = c.advisor_code
where not exists (
  select 1 from mois_couverts m where m.annee = c.annee and m.mois = c.mois
);

-- ── Le pilotage : ou en est on de l objectif ──────────────────────────────
-- ECONOMIQUE, pas bancaire : la commission acquise sur le mois en face des
-- charges du mois. Appeler resultat une variation de solde bancaire faisait
-- lire moins 34 645 en janvier la ou le mois avait coute 3 165.
create or replace function public.pnl_pilotage(p_annee integer)
returns table(mois integer, nb_personnes integer, cout_equipe numeric,
  cout_associes numeric, cout_structure numeric, cout_retrocession numeric,
  cout_total numeric, recette numeric, resultat numeric, cumul_recette numeric,
  cumul_cout numeric, cumul_resultat numeric, tresorerie_encaissee numeric,
  tresorerie_decaissee numeric, tresorerie_nette numeric,
  est_passe boolean, est_reel boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare aujourd_hui date := current_date;
begin
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  return query
  with base as (
    select m,
      (select c.cout_equipe   from public.pnl_cout_mensuel_courant(make_date(p_annee, m, 15)) c) as eq,
      (select c.cout_associes from public.pnl_cout_mensuel_courant(make_date(p_annee, m, 15)) c) as asso,
      (select c.frais_fixes   from public.pnl_cout_mensuel_courant(make_date(p_annee, m, 15)) c) as st,
      (select c.nb_personnes  from public.pnl_cout_mensuel_courant(make_date(p_annee, m, 15)) c) as tetes,
      -- La production retenue : grand livre tant qu il couvre le mois, CRM sinon.
      coalesce((select sum(v.commission) from public.v_production_retenue v
                where v.annee = p_annee and v.mois = m), 0) as rec,
      coalesce((select sum(v.retrocession) from public.v_production_retenue v
                where v.annee = p_annee and v.mois = m), 0) as retro,
      (select max(v.origine) from public.v_production_retenue v
        where v.annee = p_annee and v.mois = m) as origine,
      (select t.commissions + t.autres_encaissements from public.tresorerie_mensuelle t
        where t.annee = p_annee and t.mois = m) as tre_in,
      (select t.decaissements from public.tresorerie_mensuelle t
        where t.annee = p_annee and t.mois = m) as tre_out
    from generate_series(1, 12) as m
  ),
  calc as (select b.*, (b.eq + b.asso + b.st + b.retro) as cout from base b)
  select c.m, c.tetes,
    round(c.eq, 2), round(c.asso, 2), round(c.st, 2), round(c.retro, 2), round(c.cout, 2),
    round(c.rec, 2), round(c.rec - c.cout, 2),
    round(sum(c.rec) over (order by c.m), 2),
    round(sum(c.cout) over (order by c.m), 2),
    round(sum(c.rec - c.cout) over (order by c.m), 2),
    round(coalesce(c.tre_in, 0), 2), round(coalesce(c.tre_out, 0), 2),
    round(coalesce(c.tre_in, 0) - coalesce(c.tre_out, 0), 2),
    make_date(p_annee, c.m, 1) + interval '1 month' <= aujourd_hui,
    (c.origine is not null)
  from calc c order by c.m;
end;
$function$;

grant execute on function public.pnl_pilotage(integer) to authenticated, service_role;
