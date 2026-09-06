-- ═══════════════════════════════════════════════════════════════════════════
-- Passer le module rentabilite des hypotheses au reel.
-- Applique le brief d audit des couts du 06/09/2026 (comptabilite Pennylane
-- arretee au 01/08/2026, factures fournisseurs, quittance MobiliTeam T3 2026).
--
-- 1. charges_fixes remplace le nombre unique frais_fixes_mensuels. Un nombre
--    saisi a la main derive en trois mois et personne ne sait ce qu il
--    contient. Ici chaque euro porte son fournisseur, sa periodicite, sa
--    fiabilite et sa source.
-- 2. conseiller_contrats gagne de quoi dire la verite sur un cout salarial :
--    le cout employeur reel du bulletin de paie prime sur tout coefficient,
--    et la reduction generale degressive rend un coefficient unique faux
--    entre 1 et 1,6 SMIC.
--
-- Tous les montants sont en TTC. Entasis n est pas assujettie a la TVA, elle
-- ne la recupere pas : raisonner en HT ferait disparaitre vingt pour cent du
-- cout reel.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.charges_fixes (
  id                uuid primary key default gen_random_uuid(),
  categorie         text not null check (categorie in
                      ('LOCAUX','OUTILS','STRUCTURE','ACQUISITION','VEHICULE','SOCIAL','AUTRE')),
  libelle           text not null,
  fournisseur       text,
  montant           numeric not null,
  periodicite       text not null check (periodicite in ('MENSUEL','TRIMESTRIEL','ANNUEL','PONCTUEL')),
  montant_mensuel   numeric generated always as (
                      case periodicite
                        when 'MENSUEL' then montant
                        when 'TRIMESTRIEL' then montant / 3
                        when 'ANNUEL' then montant / 12
                        else 0 end) stored,
  actif             boolean not null default true,
  date_debut        date,
  date_fin          date,
  fiabilite         text check (fiabilite in ('FACTURE','MOYENNE','BUDGET','ESTIMATION')),
  source            text,
  a_arbitrer        boolean not null default false,
  notes             text,
  updated_at        timestamptz not null default now()
);

comment on table public.charges_fixes is
  'Charges fixes du cabinet, une ligne par poste, TOUJOURS en TTC : Entasis n est pas assujettie a la TVA.';
comment on column public.charges_fixes.fiabilite is
  'FACTURE : facture lue. MOYENNE : moyenne Pennylane. BUDGET : budget 2026. ESTIMATION : a confirmer.';
comment on column public.charges_fixes.a_arbitrer is
  'Vrai quand le poste attend une decision de la direction (resiliation, doublon, montant inconnu).';

create index if not exists charges_fixes_categorie_idx on public.charges_fixes (categorie) where actif;

alter table public.charges_fixes enable row level security;

drop policy if exists charges_fixes_direction on public.charges_fixes;
create policy charges_fixes_direction on public.charges_fixes
  for all using (public.est_direction_pnl()) with check (public.est_direction_pnl());

revoke all on public.charges_fixes from anon;
revoke all on public.charges_fixes from authenticated;
grant all on public.charges_fixes to service_role;

-- Le total mensuel, calcule et non plus saisi. Une charge terminee sort toute
-- seule du total le jour de son echeance.
create or replace view public.v_frais_fixes_mensuels as
select
  coalesce(sum(montant_mensuel), 0)                                  as total,
  coalesce(sum(montant_mensuel) filter (where a_arbitrer), 0)        as total_a_arbitrer,
  count(*)                                                           as nb_postes
from public.charges_fixes
where actif
  and (date_debut is null or date_debut <= current_date)
  and (date_fin is null or date_fin >= current_date);

create or replace view public.v_frais_fixes_par_categorie as
select categorie,
       sum(montant_mensuel)                                   as montant_mensuel,
       count(*)                                               as nb_postes,
       bool_or(a_arbitrer)                                    as contient_a_arbitrer
from public.charges_fixes
where actif
  and (date_debut is null or date_debut <= current_date)
  and (date_fin is null or date_fin >= current_date)
group by categorie;

revoke all on public.v_frais_fixes_mensuels from anon;
revoke all on public.v_frais_fixes_mensuels from authenticated;
revoke all on public.v_frais_fixes_par_categorie from anon;
revoke all on public.v_frais_fixes_par_categorie from authenticated;
grant select on public.v_frais_fixes_mensuels to service_role;
grant select on public.v_frais_fixes_par_categorie to service_role;

-- ── Le cout salarial reel ────────────────────────────────────────────────
alter table public.conseiller_contrats
  add column if not exists coef_charges_override      numeric,
  add column if not exists cout_employeur_reel        numeric,
  add column if not exists ecole_nom                  text,
  add column if not exists ecole_cout_annuel          numeric,
  add column if not exists ecole_prise_en_charge_opco numeric,
  add column if not exists aide_alternance_annuelle   numeric not null default 0;

comment on column public.conseiller_contrats.cout_employeur_reel is
  'Cout employeur mensuel donne par le bulletin de paie. Prime sur tout calcul par coefficient.';
comment on column public.conseiller_contrats.coef_charges_override is
  'Coefficient de charges propre a ce contrat. La reduction generale degressive rend le coefficient du type de contrat faux entre 1 et 1,6 SMIC.';
comment on column public.conseiller_contrats.aide_alternance_annuelle is
  'Aide a l alternance percue sur l annee, en euros. Vient EN DEDUCTION du cout.';
