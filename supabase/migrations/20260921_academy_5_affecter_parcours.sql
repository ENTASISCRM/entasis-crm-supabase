-- Entasis Academy, migration 5 : affecter un parcours sans module publie
-- est une erreur, pas un zero silencieux.
--
-- Constat de Louis le 21 septembre 2026 : « 0 affectation » apres avoir
-- affecte le parcours Integration a deux personnes alors qu aucun module
-- n etait encore publie. academy_affecter sautait chaque module sans
-- version publiee et rendait 0. Desormais un parcours dont aucun module
-- n est publie leve une exception lisible ; les modules non publies d un
-- parcours partiellement publie sont toujours ignores (ils s affecteront a
-- leur publication par une nouvelle affectation), et le journal le dit.
-- L ecran previent avant le clic (libelle et bouton), la base refuse quand
-- meme.
--
-- Appliquee sur DEV puis EN PRODUCTION le 21 septembre 2026 : version
-- 20260921140827, nom academy_5_affecter_parcours.
create or replace function public.academy_affecter(p_profile_ids uuid[], p_module_id uuid, p_parcours_id uuid, p_echeance date, p_obligatoire boolean default true)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  v_nb integer := 0; v_p uuid; r record; v_version uuid; v_inserted uuid;
  v_publies integer; v_total integer;
begin
  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then return 0; end if;
  if p_parcours_id is not null then
    select count(*), count(*) filter (where exists (select 1 from public.academy_module_versions v where v.module_id = pm.module_id and v.statut = 'publie'))
      into v_total, v_publies
      from public.academy_parcours_modules pm where pm.parcours_id = p_parcours_id;
    if coalesce(v_total, 0) = 0 then raise exception 'Ce parcours n a aucun module' using errcode = 'P0001'; end if;
    if coalesce(v_publies, 0) = 0 then raise exception 'Aucun module de ce parcours n est publie : publiez d abord' using errcode = 'P0001'; end if;
  end if;
  foreach v_p in array p_profile_ids loop
    if not exists (select 1 from public.profiles where id = v_p and is_active = true) then continue; end if;
    if p_parcours_id is not null then
      for r in
        select pm.module_id, pm.ordre, pm.obligatoire, pm.delai_jours,
               (select v.id from public.academy_module_versions v where v.module_id = pm.module_id and v.statut = 'publie' order by v.numero desc limit 1) as version_id
        from public.academy_parcours_modules pm where pm.parcours_id = p_parcours_id order by pm.ordre
      loop
        if r.version_id is null then continue; end if;
        insert into public.academy_affectations (profile_id, module_id, version_id, parcours_id, obligatoire, echeance, affecte_par)
        values (v_p, r.module_id, r.version_id, p_parcours_id, coalesce(p_obligatoire, r.obligatoire),
                coalesce(p_echeance, case when r.delai_jours is not null then public.academy_aujourdhui() + r.delai_jours end), v_uid)
        on conflict (profile_id, version_id) do nothing
        returning id into v_inserted;
        if v_inserted is not null then
          v_nb := v_nb + 1;
          perform public.academy_evenement(v_p, 'affectation_creee', r.version_id, jsonb_build_object('parcours_id', p_parcours_id, 'echeance', p_echeance));
          perform public.academy_recalculer_statut(v_p, r.version_id);
        end if;
        v_inserted := null;
      end loop;
    elsif p_module_id is not null then
      select v.id into v_version from public.academy_module_versions v where v.module_id = p_module_id and v.statut = 'publie' order by v.numero desc limit 1;
      if v_version is null then raise exception 'Ce module n a pas de version publiee' using errcode = 'P0001'; end if;
      insert into public.academy_affectations (profile_id, module_id, version_id, obligatoire, echeance, affecte_par)
      values (v_p, p_module_id, v_version, coalesce(p_obligatoire, true), p_echeance, v_uid)
      on conflict (profile_id, version_id) do nothing
      returning id into v_inserted;
      if v_inserted is not null then
        v_nb := v_nb + 1;
        perform public.academy_evenement(v_p, 'affectation_creee', v_version, jsonb_build_object('echeance', p_echeance));
        perform public.academy_recalculer_statut(v_p, v_version);
      end if;
      v_inserted := null;
    end if;
  end loop;
  perform public.academy_journaliser('affecter', coalesce(p_parcours_id::text, p_module_id::text),
    jsonb_build_object('profils', array_length(p_profile_ids, 1), 'creees', v_nb, 'echeance', p_echeance,
                       'modules_publies', v_publies, 'modules_du_parcours', v_total));
  return v_nb;
end;
$function$;
