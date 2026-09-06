-- ═══════════════════════════════════════════════════════════════════════════
-- Le cout mensuel COURANT, a une date donnee.
--
-- L annuel repond a « combien ca a coute ». Celui ci repond a « combien ca
-- coute en ce moment », et c est la seule base pour repondre a la question qui
-- compte vraiment : combien il manque chaque mois, et qui le comble.
--
-- On ne prend que les contrats reellement en cours a la date demandee : un
-- alternant parti en aout ne pese plus rien en septembre, un CDI qui commence
-- le 18 pese deja.
--
-- Les lignes de charges_fixes marquees actif = false sont rendues a part, dans
-- non_engage : vehicule, mutuelle, medecine du travail et contrat incendie
-- sont connus mais pas encore engages. Les compter serait faux, les cacher
-- serait pire.
--
-- Note : la table charges_fixes a ete semee le 06/09/2026 a partir du brief
-- d audit des couts. La provenance de chaque euro est dans la colonne source
-- de chaque ligne, pas dans ce fichier : elle vit avec la donnee et se met a
-- jour avec elle.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pnl_cout_mensuel_courant(p_date date default current_date)
returns table(
  cout_equipe numeric, cout_associes numeric, frais_fixes numeric,
  cout_complet numeric, nb_personnes integer, nb_associes integer,
  frais_fixes_a_arbitrer numeric, non_engage numeric
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  prm public.pnl_parametres%rowtype;
begin
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  select * into prm from public.pnl_parametres where id = true;

  return query
  with en_cours as (
    select c.*,
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
      - coalesce(c.aide_alternance_annuelle, 0) / 12.0
      as cout_mensuel
    from public.conseiller_contrats c
    left join public.profiles pf on pf.id = c.profile_id
    where coalesce(c.date_debut, p_date) <= p_date
      and coalesce(c.date_fin, p_date)   >= p_date
      and not (coalesce(pf.is_active, true) = false and coalesce(c.salaire_brut_mensuel, 0) = 0)
  ),
  assoc as (
    -- Les gerants ne sont pas salaries : leur remuneration est annuelle,
    -- posee dans pnl_couts_personne, ramenee au mois ici.
    select coalesce(sum(coalesce(cp.autres_couts_annuels, 0)) / 12.0, 0) as montant,
           count(*)::int as nb
    from public.conseiller_contrats c
    join public.pnl_couts_personne cp
      on cp.profile_id = c.profile_id and cp.annee = extract(year from p_date)::int
    where upper(c.type_contrat) = 'GERANT'
      and coalesce(c.date_debut, p_date) <= p_date
      and coalesce(c.date_fin, p_date)   >= p_date
  ),
  ff as (select total, total_a_arbitrer from public.v_frais_fixes_mensuels),
  pas_engage as (
    select coalesce(sum(
      case periodicite when 'MENSUEL' then montant
                       when 'TRIMESTRIEL' then montant / 3
                       when 'ANNUEL' then montant / 12
                       else 0 end), 0) as montant
    from public.charges_fixes where not actif
  )
  select
    round((select coalesce(sum(cout_mensuel), 0) from en_cours where upper(type_contrat) <> 'GERANT'), 2),
    round((select montant from assoc), 2),
    round((select total from ff), 2),
    round((select coalesce(sum(cout_mensuel), 0) from en_cours where upper(type_contrat) <> 'GERANT')
          + (select montant from assoc) + (select total from ff), 2),
    (select count(*)::int from en_cours where upper(type_contrat) <> 'GERANT'),
    (select nb from assoc),
    round((select total_a_arbitrer from ff), 2),
    round((select montant from pas_engage), 2);
end;
$function$;

revoke all on function public.pnl_cout_mensuel_courant(date) from public;
revoke all on function public.pnl_cout_mensuel_courant(date) from anon;
revoke all on function public.pnl_cout_mensuel_courant(date) from authenticated;
grant execute on function public.pnl_cout_mensuel_courant(date) to service_role;
