-- FAILLE, introduite par la migration 20260907_pnl_structure_mois_par_mois.sql
-- et fermee le meme jour. pnl_structure_ecoulee etait appelable SANS AUCUNE
-- AUTHENTIFICATION, avec la seule cle publiee dans le bundle du navigateur.
--
-- Deux causes, il fallait les deux :
--
--  1. La migration ecrivait « grant execute ... to authenticated, service_role »
--     en croyant fermer la porte a anon. Elle ne fermait rien : dans ce projet,
--     les privileges par defaut du schema public accordent deja EXECUTE a
--     PUBLIC sur toute fonction nouvellement creee. Un grant n enleve rien.
--
--  2. La fonction n avait pas le garde que portent ses voisines. Le motif
--     « auth.uid() is not null and not est_direction_pnl() » n est PAS une
--     coquetterie : il laisse passer le serveur, qui appelle en service_role
--     sans auth.uid(), et arrete tout utilisateur authentifie qui n est pas la
--     direction. Sans lui, il ne restait que les droits, et les droits etaient
--     ouverts.
--
-- Ce qui fuyait : le cumul des charges fixes de structure. Divise par les mois
-- ecoules, il donne le cout de structure mensuel exact du cabinet. Ni salaire,
-- ni commission, ni marge nominative, mais un secret d affaires.

create or replace function public.pnl_structure_ecoulee(p_annee integer)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare resultat numeric;
begin
  -- Le meme garde que pnl_pilotage et pnl_conseiller_annuel, mot pour mot :
  -- le serveur (service_role, sans auth.uid()) passe, un utilisateur
  -- authentifie qui n est pas la direction est arrete.
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

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
  ), 0), 2) into resultat
  from mois mo;

  return resultat;
end;
$function$;

-- Le garde seul ne suffit pas : on retire aussi les droits, y compris ceux que
-- PUBLIC recoit sans que personne ne les ait ecrits.
revoke all on function public.pnl_structure_ecoulee(integer) from public;
revoke all on function public.pnl_structure_ecoulee(integer) from anon;
revoke all on function public.pnl_structure_ecoulee(integer) from authenticated;
grant execute on function public.pnl_structure_ecoulee(integer) to service_role;

-- ── La racine : que la prochaine fonction ne s ouvre pas toute seule ──────
-- Sans ceci, toute fonction ajoutee demain dans le schema public naitra
-- executable par n importe quel visiteur, et son auteur croira l avoir fermee
-- en ecrivant un grant restrictif. N affecte que les objets FUTURS : rien de
-- ce qui tourne aujourd hui ne change. Une fonction reellement destinee au
-- public devra desormais porter son grant explicite, ce qui est le bon sens.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
