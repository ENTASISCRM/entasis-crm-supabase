-- La structure du cabinet etait divisee par 18 tetes toute l annee, alors que
-- le cabinet comptait 6 personnes en janvier et 13 en septembre. Chacun se
-- voyait facturer 480 EUR de structure par mois quand le cout reel par tete
-- presente en janvier depassait 1 200 EUR, et 45 % de la structure engagee
-- n etait imputee a personne.
--
-- On repartit desormais mois par mois : la structure d un mois est partagee
-- entre les seules personnes en poste ce mois la, au prorata de leurs jours de
-- presence. La somme des parts vaut alors exactement la structure engagee
-- depuis le 1er janvier, arretee a aujourd hui.

-- Ce que la structure a reellement coute depuis le debut de l annee, arrete au
-- jour du calcul : les mois pleins comptent pour un, le mois en cours pour sa
-- fraction de jours ecoules.
create or replace function public.pnl_structure_ecoulee(p_annee integer)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  with prm as (select * from public.pnl_parametres where id = true),
  ff as (
    select coalesce(nullif((select total from public.v_frais_fixes_mensuels), 0),
                    (select frais_fixes_mensuels from prm), 0) as mensuel
  ),
  mois as (
    select m,
      make_date(p_annee, m, 1) as d1,
      (make_date(p_annee, m, 1) + interval '1 month - 1 day')::date as dfin
    from generate_series(1, 12) as m
    where make_date(p_annee, m, 1) <= least(make_date(p_annee, 12, 31), current_date)
  )
  select round(coalesce(sum(
    (select mensuel from ff)
    * ((least(mo.dfin, least(make_date(p_annee, 12, 31), current_date)) - mo.d1 + 1)::numeric
       / (mo.dfin - mo.d1 + 1))
  ), 0), 2)
  from mois mo;
$$;

comment on function public.pnl_structure_ecoulee(integer) is
  'Structure engagee du 1er janvier au jour du calcul. A opposer a une recette de meme periode, jamais a douze mois.';

grant execute on function public.pnl_structure_ecoulee(integer) to authenticated, service_role;

create or replace function public.pnl_conseiller_annuel(p_annee integer, p_repartir boolean default null)
returns table(profile_id uuid, nom text, advisor_code text, type_contrat text, est_gerant boolean,
  mois_actifs numeric, cout_fixe numeric, cout_annexe numeric, cout_outils numeric,
  cout_frais_fixes numeric, cout_retrocession numeric, aide_percue numeric,
  remuneration_associe numeric, cout_total numeric, contrats_signes integer,
  clients_uniques integer, pp_annualisee numeric, pu_collectee numeric,
  commission_encaissee numeric, commission_attendue numeric, marge numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  prm public.pnl_parametres%rowtype;
  repartir boolean; frais_fixes numeric;
  debut_annee date := make_date(p_annee, 1, 1);
  fin_annee   date := make_date(p_annee, 12, 31);
  fin_calcul  date := least(make_date(p_annee, 12, 31), current_date);
  jours_annee integer := (make_date(p_annee, 12, 31) - make_date(p_annee, 1, 1)) + 1;
begin
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  select * into prm from public.pnl_parametres where id = true;
  repartir := coalesce(p_repartir, prm.repartir_frais_fixes);
  select total into frais_fixes from public.v_frais_fixes_mensuels;
  if coalesce(frais_fixes, 0) = 0 then frais_fixes := coalesce(prm.frais_fixes_mensuels, 0); end if;

  return query
  with contrats as (
    select
      coalesce(c.profile_id::text, 'nom:' || coalesce(c.full_name, '?')) as cle,
      c.profile_id, coalesce(c.full_name, pf.full_name) as full_name,
      c.type_contrat, c.date_debut, c.date_fin,
      (greatest(0,
        (least(coalesce(c.date_fin, fin_calcul), fin_calcul)
         - greatest(coalesce(c.date_debut, debut_annee), debut_annee)) + 1
      ) * 12.0 / jours_annee) as mois,
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
      + case when upper(c.type_contrat) in ('CDI', 'CDD', 'ALTERNANT')
             then prm.mutuelle_mensuelle else 0 end
      as cout_mensuel,
      coalesce(c.aide_alternance_annuelle, 0) / 12.0 as aide_mensuelle
    from public.conseiller_contrats c
    left join public.profiles pf on pf.id = c.profile_id
    where not (coalesce(pf.is_active, true) = false and coalesce(c.salaire_brut_mensuel, 0) = 0)
      and coalesce(c.date_debut, debut_annee) <= fin_calcul
      and coalesce(c.date_fin, fin_annee)     >= debut_annee
  ),
  -- La structure, mois par mois. Un mois n est partage qu entre les tetes
  -- reellement en poste ce mois la : c est ce qui rend la part juste en niveau,
  -- et pas seulement en total.
  mois_series as (
    select m,
      make_date(p_annee, m, 1) as d1,
      (make_date(p_annee, m, 1) + interval '1 month - 1 day')::date as dfin,
      least((make_date(p_annee, m, 1) + interval '1 month - 1 day')::date, fin_calcul) as dfin_eff
    from generate_series(1, 12) as m
    where make_date(p_annee, m, 1) <= fin_calcul
  ),
  structure_mois as (
    select ms.m, ms.d1, ms.dfin_eff,
      frais_fixes * ((ms.dfin_eff - ms.d1 + 1)::numeric / (ms.dfin - ms.d1 + 1)) as montant
    from mois_series ms
  ),
  presence as (
    -- Une personne peut porter deux contrats sur un meme mois : sa presence est
    -- plafonnee a un, sinon elle compterait double dans le partage.
    select sm.m, ct.cle,
      least(1.0, sum(
        greatest(0, (least(coalesce(ct.date_fin, sm.dfin_eff), sm.dfin_eff)
                     - greatest(coalesce(ct.date_debut, sm.d1), sm.d1)) + 1)::numeric
        / ((sm.dfin_eff - sm.d1) + 1)
      )) as part
    from structure_mois sm cross join contrats ct
    group by sm.m, ct.cle
  ),
  presence_nz as (select p.m, p.cle, p.part from presence p where p.part > 0),
  tetes_mois as (select pn.m, sum(pn.part) as tetes from presence_nz pn group by pn.m),
  structure_personne as (
    select pn.cle,
      round(sum(sm.montant * pn.part / t.tetes), 2) as cout_frais_fixes
    from presence_nz pn
    join tetes_mois t on t.m = pn.m
    join structure_mois sm on sm.m = pn.m
    group by pn.cle
  ),
  personnes as (
    select ct.cle,
      (array_agg(ct.profile_id) filter (where ct.profile_id is not null))[1] as profile_id,
      max(ct.full_name) as full_name,
      (array_agg(ct.type_contrat order by ct.date_debut desc nulls last))[1] as type_contrat,
      bool_or(upper(ct.type_contrat) = 'GERANT') as est_gerant,
      round(least(12, sum(ct.mois)), 1) as mois_actifs,
      least(12, sum(ct.mois)) as mois_bruts,
      round(sum(ct.mois * ct.cout_mensuel), 2) as cout_fixe,
      round(sum(ct.mois * ct.aide_mensuelle), 2) as aide_percue
    from contrats ct group by ct.cle
  ),
  couts as (
    select p.cle, p.profile_id, p.full_name, p.type_contrat, p.est_gerant,
      p.mois_actifs, p.mois_bruts, p.cout_fixe, p.aide_percue,
      case when p.est_gerant then 0 else
        round((coalesce(cp.cout_ecole_annuel, 0) + coalesce(cp.autres_couts_annuels, 0))
              * least(1, p.mois_bruts / 12.0), 2) end as cout_annexe,
      case when p.est_gerant then
        round(coalesce(cp.cout_ecole_annuel, 0) + coalesce(cp.autres_couts_annuels, 0), 2)
        else 0 end as remuneration_associe,
      round(p.mois_bruts * coalesce(cp.outils_mensuel, prm.outils_mensuels_par_tete), 2) as cout_outils,
      case when repartir then coalesce(sp.cout_frais_fixes, 0) else 0 end as cout_frais_fixes
    from personnes p
    left join public.pnl_couts_personne cp on cp.profile_id = p.profile_id and cp.annee = p_annee
    left join structure_personne sp on sp.cle = p.cle
  ),
  prod as (
    -- Le grand livre pour les mois qu il couvre, le CRM pour les autres.
    select coalesce(v.profile_id::text, 'code:' || v.advisor_code) as cle,
      v.profile_id as pid, v.advisor_code as code,
      sum(v.dossiers)::int as contrats_signes,
      0::int as clients_uniques, 0::numeric as pp_annualisee, 0::numeric as pu_collectee,
      sum(v.commission) as commission_encaissee, 0::numeric as commission_attendue,
      sum(v.retrocession) as retrocession
    from public.v_production_retenue v
    where v.annee = p_annee
    group by coalesce(v.profile_id::text, 'code:' || v.advisor_code), v.profile_id, v.advisor_code
  ),
  final as (
    select
      coalesce(c.profile_id, p.pid) as profile_id,
      coalesce(c.full_name, pr2.full_name) as nom,
      coalesce(pr.advisor_code, pr2.advisor_code, p.code) as advisor_code,
      coalesce(c.type_contrat, 'MANDATAIRE') as type_contrat,
      coalesce(c.est_gerant, false) as est_gerant,
      coalesce(c.mois_actifs, 0) as mois_actifs,
      coalesce(c.cout_fixe, 0) as cout_fixe, coalesce(c.cout_annexe, 0) as cout_annexe,
      coalesce(c.cout_outils, 0) as cout_outils, coalesce(c.cout_frais_fixes, 0) as cout_frais_fixes,
      coalesce(p.retrocession, 0) as retro, coalesce(c.aide_percue, 0) as aide_percue,
      coalesce(c.remuneration_associe, 0) as remun,
      coalesce(p.contrats_signes, 0) as contrats_signes,
      coalesce(p.clients_uniques, 0) as clients_uniques,
      coalesce(p.pp_annualisee, 0) as pp_annualisee, coalesce(p.pu_collectee, 0) as pu_collectee,
      coalesce(p.commission_encaissee, 0) as commission_encaissee,
      coalesce(p.commission_attendue, 0) as commission_attendue
    from couts c
    full join prod p on p.cle = c.cle
    left join public.profiles pr  on pr.id  = c.profile_id
    left join public.profiles pr2 on pr2.id = p.pid
  )
  select f.profile_id, f.nom, f.advisor_code, f.type_contrat, f.est_gerant, f.mois_actifs,
    f.cout_fixe, f.cout_annexe, f.cout_outils, f.cout_frais_fixes,
    case when f.est_gerant then 0 else f.retro end,
    f.aide_percue,
    f.remun + case when f.est_gerant then f.retro else 0 end,
    f.cout_fixe + f.cout_annexe + f.cout_outils + f.cout_frais_fixes
      + case when f.est_gerant then 0 else f.retro end - f.aide_percue,
    f.contrats_signes, f.clients_uniques, f.pp_annualisee, f.pu_collectee,
    f.commission_encaissee, f.commission_attendue,
    f.commission_encaissee - (f.cout_fixe + f.cout_annexe + f.cout_outils + f.cout_frais_fixes
      + case when f.est_gerant then 0 else f.retro end - f.aide_percue)
  from final f
  order by 21 desc;
end;
$function$;
