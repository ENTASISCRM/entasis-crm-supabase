-- ═══════════════════════════════════════════════════════════════════════════
-- La rentabilite par personne, sur les couts reels.
--
-- Ce que cette version change par rapport a la precedente.
--   - les frais fixes viennent de charges_fixes, poste par poste, plus d un
--     nombre saisi a la main
--   - le cout employeur du bulletin de paie prime sur tout coefficient, et un
--     coefficient propre au contrat prime sur celui du type : entre 1 et 1,6
--     SMIC la reduction generale degressive rend le taux plein faux
--   - la mutuelle ne concerne ni les stagiaires ni les mandataires
--   - les aides a l alternance viennent en deduction du cout
--   - un contrat SANS PROFIL compte quand meme : un alternant qui arrive le
--     mois prochain n a pas encore de compte dans le CRM, son cout est
--     pourtant deja engage
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.pnl_conseiller_annuel(integer, boolean);

create or replace function public.pnl_conseiller_annuel(
  p_annee integer,
  p_repartir boolean default null
)
returns table(
  profile_id uuid, nom text, advisor_code text, type_contrat text,
  est_gerant boolean, mois_actifs numeric,
  cout_fixe numeric, cout_annexe numeric, cout_outils numeric,
  cout_frais_fixes numeric, cout_retrocession numeric, aide_percue numeric,
  cout_total numeric,
  contrats_signes integer, clients_uniques integer,
  pp_annualisee numeric, pu_collectee numeric,
  commission_encaissee numeric, commission_attendue numeric, marge numeric
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  prm public.pnl_parametres%rowtype;
  nb_tetes integer;
  repartir boolean;
  frais_fixes numeric;
  debut_annee date := make_date(p_annee, 1, 1);
  fin_annee   date := make_date(p_annee, 12, 31);
  jours_annee integer := (make_date(p_annee, 12, 31) - make_date(p_annee, 1, 1)) + 1;
begin
  -- Deux appelants legitimes : la cle de service depuis api/pnl.js (auth.uid()
  -- y est nul, et c est le SEUL chemin qui traverse le verrou et journalise),
  -- ou un porteur du drapeau en filet de secours. Le GRANT est retire au role
  -- authentifie plus bas : personne ne peut l appeler depuis un navigateur.
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  select * into prm from public.pnl_parametres where id = true;
  repartir := coalesce(p_repartir, prm.repartir_frais_fixes);

  -- Les frais fixes viennent desormais de charges_fixes, poste par poste.
  -- Le parametre ne sert plus que de filet si la table est vide.
  select total into frais_fixes from public.v_frais_fixes_mensuels;
  if coalesce(frais_fixes, 0) = 0 then frais_fixes := coalesce(prm.frais_fixes_mensuels, 0); end if;

  -- ATTENTION : conseiller_contrats.actif signifie « contrat courant », pas
  -- « contrat valide ». Filtrer dessus effacerait le CDI qui commence le mois
  -- prochain et le contrat d alternance termine en aout, deux couts pourtant
  -- bien reels sur l annee. On ne l utilise donc pas ici.
  --
  -- La seule chose a ecarter est un reliquat : profil desactive ET aucune
  -- remuneration. Quelqu un qui est parti garde un salaire, il reste compte
  -- pour les mois ou il etait la.
  select count(distinct coalesce(c.profile_id::text, 'nom:' || coalesce(c.full_name, '?')))
    into nb_tetes
  from public.conseiller_contrats c
  left join public.profiles pf on pf.id = c.profile_id
  where upper(c.type_contrat) <> 'GERANT'
    and not (coalesce(pf.is_active, true) = false and coalesce(c.salaire_brut_mensuel, 0) = 0)
    and coalesce(c.date_debut, debut_annee) <= fin_annee
    and coalesce(c.date_fin, fin_annee)     >= debut_annee;
  if coalesce(nb_tetes, 0) = 0 then nb_tetes := 1; end if;

  return query
  with contrats as (
    -- TOUS les contrats qui recouvrent l annee, pas seulement le dernier, et
    -- au prorata des JOURS. En mois entiers, quelqu un qui passe d alternant a
    -- CDI le 18 septembre comptait septembre deux fois, soit treize mois de
    -- charge sur une annee qui n en a que douze.
    --
    -- La cle de regroupement tolere un contrat sans profil : un alternant qui
    -- arrive le mois prochain n a pas encore de compte dans le CRM, son cout
    -- est pourtant deja engage et doit apparaitre.
    select
      coalesce(c.profile_id::text, 'nom:' || coalesce(c.full_name, '?')) as cle,
      c.profile_id, coalesce(c.full_name, pf.full_name) as full_name,
      c.type_contrat, c.date_debut,
      (greatest(0,
        (least(coalesce(c.date_fin, fin_annee), fin_annee)
         - greatest(coalesce(c.date_debut, debut_annee), debut_annee)) + 1
      ) * 12.0 / jours_annee) as mois,
      -- Le bulletin de paie prime sur tout coefficient. A defaut, un
      -- coefficient propre au contrat prime sur celui du type : entre 1 et
      -- 1,6 SMIC la reduction generale degressive rend le taux plein faux.
      coalesce(
        c.cout_employeur_reel,
        coalesce(c.salaire_brut_mensuel, 0) * (1 + coalesce(c.coef_charges_override,
          case upper(c.type_contrat)
            when 'CDI' then prm.coef_charges_cdi
            when 'CDD' then prm.coef_charges_cdd
            when 'ALTERNANT' then prm.coef_charges_alternant
            when 'STAGIAIRE' then prm.coef_charges_stagiaire
            else prm.coef_charges_mandataire end))
      )
      + coalesce(c.reste_a_charge_mensuel, 0)
      -- La mutuelle ne concerne ni les stagiaires ni les mandataires.
      + case when upper(c.type_contrat) in ('CDI', 'CDD', 'ALTERNANT')
             then prm.mutuelle_mensuelle else 0 end
      as cout_mensuel,
      coalesce(c.aide_alternance_annuelle, 0) / 12.0 as aide_mensuelle
    from public.conseiller_contrats c
    left join public.profiles pf on pf.id = c.profile_id
    where not (coalesce(pf.is_active, true) = false and coalesce(c.salaire_brut_mensuel, 0) = 0)
      and coalesce(c.date_debut, debut_annee) <= fin_annee
      and coalesce(c.date_fin, fin_annee)     >= debut_annee
  ),
  personnes as (
    select
      ct.cle,
      max(ct.profile_id) as profile_id,
      max(ct.full_name) as full_name,
      -- Le contrat le plus recent donne le libelle affiche.
      (array_agg(ct.type_contrat order by ct.date_debut desc nulls last))[1] as type_contrat,
      bool_or(upper(ct.type_contrat) = 'GERANT') as est_gerant,
      round(least(12, sum(ct.mois)), 1) as mois_actifs,
      least(12, sum(ct.mois)) as mois_bruts,
      round(sum(ct.mois * ct.cout_mensuel), 2) as cout_fixe,
      round(sum(ct.mois * ct.aide_mensuelle), 2) as aide_percue
    from contrats ct
    group by ct.cle
  ),
  couts as (
    select p.cle, p.profile_id, p.full_name, p.type_contrat, p.est_gerant,
      p.mois_actifs, p.mois_bruts, p.cout_fixe, p.aide_percue,
      coalesce(cp.cout_ecole_annuel, 0) + coalesce(cp.autres_couts_annuels, 0) as cout_annexe,
      round(p.mois_bruts * coalesce(cp.outils_mensuel, prm.outils_mensuels_par_tete), 2) as cout_outils,
      -- Les gerants ne portent pas de part de structure : leur remuneration
      -- n est pas dans charges_fixes, mais leur imputer une part reviendrait a
      -- leur faire porter des murs qu ils payent deja par le resultat.
      case when repartir and not p.est_gerant
           then round(p.mois_bruts * frais_fixes / nb_tetes, 2)
           else 0 end as cout_frais_fixes
    from personnes p
    left join public.pnl_couts_personne cp on cp.profile_id = p.profile_id and cp.annee = p_annee
  ),
  prod as (
    select pe.profile_id::text as cle, pe.profile_id as pid,
      count(*)::int as contrats_signes,
      count(distinct upper(trim(pe.client_nom)))::int as clients_uniques,
      sum(pe.volume_pp) as pp_annualisee, sum(pe.volume_pu) as pu_collectee,
      sum(pe.commission_encaissee) as commission_encaissee,
      sum(pe.commission_attendue)  as commission_attendue,
      sum(pe.retrocession)         as retrocession
    from public.production_encaissee pe
    where pe.annee = p_annee and pe.profile_id is not null
    group by pe.profile_id
  )
  -- FULL JOIN : un mandataire produit sans porter de contrat salarie. Une
  -- jointure partant des couts l aurait fait disparaitre, et sa production
  -- avec, du total cabinet.
  select
    coalesce(c.profile_id, p.pid),
    coalesce(c.full_name, pr2.full_name),
    coalesce(pr.advisor_code, pr2.advisor_code),
    coalesce(c.type_contrat, 'MANDATAIRE'),
    coalesce(c.est_gerant, false),
    coalesce(c.mois_actifs, 0),
    coalesce(c.cout_fixe, 0), coalesce(c.cout_annexe, 0),
    coalesce(c.cout_outils, 0), coalesce(c.cout_frais_fixes, 0),
    coalesce(p.retrocession, 0), coalesce(c.aide_percue, 0),
    coalesce(c.cout_fixe, 0) + coalesce(c.cout_annexe, 0)
      + coalesce(c.cout_outils, 0) + coalesce(c.cout_frais_fixes, 0)
      + coalesce(p.retrocession, 0) - coalesce(c.aide_percue, 0),
    coalesce(p.contrats_signes, 0), coalesce(p.clients_uniques, 0),
    coalesce(p.pp_annualisee, 0), coalesce(p.pu_collectee, 0),
    coalesce(p.commission_encaissee, 0), coalesce(p.commission_attendue, 0),
    coalesce(p.commission_encaissee, 0)
      - (coalesce(c.cout_fixe, 0) + coalesce(c.cout_annexe, 0)
         + coalesce(c.cout_outils, 0) + coalesce(c.cout_frais_fixes, 0)
         + coalesce(p.retrocession, 0) - coalesce(c.aide_percue, 0))
  from couts c
  full join prod p on p.cle = c.cle
  left join public.profiles pr  on pr.id  = c.profile_id
  left join public.profiles pr2 on pr2.id = p.pid
  order by 20 desc;
end;
$function$;

revoke all on function public.pnl_conseiller_annuel(integer, boolean) from public;
revoke all on function public.pnl_conseiller_annuel(integer, boolean) from anon;
revoke all on function public.pnl_conseiller_annuel(integer, boolean) from authenticated;
grant execute on function public.pnl_conseiller_annuel(integer, boolean) to service_role;
