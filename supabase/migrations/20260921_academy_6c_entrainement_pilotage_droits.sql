-- Entasis Academy, migration 6c : le mode entrainement, fin.
-- Pilotage, fiche et matrice pour la direction, purge des intervalles par
-- version et par jour, droits d execution des fonctions, parametres et
-- notice de donnees. Suppose les migrations 6 et 6b appliquees.

-- ── 8. Pilotage, fiche, matrice ────────────────────────────────────────────
create or replace function public.academy_pilotage(p_depuis date default null, p_jusqua date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_direction();
  v_auj date := public.academy_aujourdhui();
  v_depuis timestamptz; v_jusqua timestamptz; v_prm record;
begin
  select * into v_prm from public.academy_parametres where id = true;
  v_depuis := case when p_depuis is null then null else (p_depuis::timestamp at time zone 'Europe/Paris') end;
  v_jusqua := case when p_jusqua is null then null else ((p_jusqua + 1)::timestamp at time zone 'Europe/Paris') end;
  return jsonb_build_object(
    'fuseau', 'Europe/Paris', 'aujourdhui', v_auj, 'depuis', p_depuis, 'jusqua', p_jusqua,
    'indicateurs', jsonb_build_object(
        'actifs_periode', (select count(distinct e.profile_id) from public.academy_entrainements e where e.terminee_le is not null
                            and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)
                            and e.profile_id in (select profile_id from public.academy_affectations)),
        'affectes', (select count(distinct profile_id) from public.academy_affectations),
        'obligatoires_validees', (select count(*) from public.academy_affectations where obligatoire and statut = 'valide'),
        'obligatoires_total', (select count(*) from public.academy_affectations where obligatoire),
        'echues_non_validees', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj and statut <> 'valide'),
        'echues_total', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj),
        'sessions_periode', (select count(*) from public.academy_entrainements e where e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'serie_moyenne', (select round(avg(case when s.dernier_jour >= v_auj - 1 then s.serie else 0 end), 1) from public.academy_series s where s.profile_id in (select profile_id from public.academy_affectations)),
        'items_dus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id
                       where f.prochaine_le <= now() and f.force < 5 and i.archive_le is null and v.statut = 'publie'),
        'temps_actif_s', (select coalesce(sum(public.academy_duree_active(pr.id, v_depuis, v_jusqua)), 0) from public.profiles pr where pr.id in (select profile_id from public.academy_affectations))
    ),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', pr.id, 'nom', pr.full_name, 'advisor_code', pr.advisor_code, 'is_active', pr.is_active,
        'parcours', (select coalesce(jsonb_agg(distinct pa.titre), '[]'::jsonb) from public.academy_affectations a join public.academy_parcours pa on pa.id = a.parcours_id where a.profile_id = pr.id),
        'decks', (select coalesce(jsonb_agg(jsonb_build_object('version_id', a.version_id, 'titre', v.titre, 'couronnes', public.academy_couronnes(pr.id, a.version_id), 'statut', a.statut) order by v.titre), '[]'::jsonb)
                  from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id where a.profile_id = pr.id),
        'modules_affectes', (select count(*) from public.academy_affectations a where a.profile_id = pr.id),
        'modules_valides', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'valide'),
        'modules_en_cours', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'en_cours'),
        'modules_a_revoir', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'a_revoir'),
        'modules_non_commences', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'non_commence'),
        'retards', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'serie', (select case when s.dernier_jour >= v_auj - 1 then s.serie else 0 end from public.academy_series s where s.profile_id = pr.id),
        'xp_7j', (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le >= now() - interval '7 days'),
        'xp_periode', (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'sessions_periode', (select count(*) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'derniere_session', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id),
        'derniere_activite', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id),
        'temps_actif_s', public.academy_duree_active(pr.id, v_depuis, v_jusqua),
        'items_dus', public.academy_items_dus(pr.id, null),
        'premier_score', (select jsonb_build_object('score', e.nb_bons, 'total', e.nb_total, 'titre', v.titre, 'le', e.terminee_le) from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
                          where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua) order by e.terminee_le asc limit 1),
        'dernier_score', (select jsonb_build_object('score', e.nb_bons, 'total', e.nb_total, 'titre', v.titre, 'le', e.terminee_le, 'type', 'session') from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
                          where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua) order by e.terminee_le desc limit 1),
        'a_examiner', (select coalesce(jsonb_agg(x.fait), '[]'::jsonb) from (
            select 'Session de ' || e.nb_total || ' exercices terminee en ' || extract(epoch from (e.terminee_le - e.demarree_le))::int || ' s (' || v.titre || ')' as fait
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.profile_id = pr.id and e.terminee_le is not null and e.nb_total >= 8 and e.terminee_le - e.demarree_le < interval '40 seconds'
            union all
            select count(*) || ' sessions sous 50 % sur ' || v.titre
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.profile_id = pr.id and e.terminee_le is not null and e.nb_total > 0 and e.nb_bons * 2 < e.nb_total
             group by v.titre having count(*) >= 3) x)
      ) order by pr.full_name)
      from public.profiles pr
      where pr.is_active = true and (pr.id in (select profile_id from public.academy_affectations) or pr.id in (select profile_id from public.academy_entrainements))), '[]'::jsonb),
    'notions', coalesce((select jsonb_agg(jsonb_build_object('competence', x.competence, 'reponses', x.reponses, 'correctes', x.correctes, 'effectif', x.effectif, 'derniere_le', x.derniere_le) order by (x.correctes::numeric / greatest(x.reponses, 1)))
      from (select i.competence, count(*) as reponses, count(*) filter (where r.correcte) as correctes, count(distinct e.profile_id) as effectif, max(r.repondu_le) as derniere_le
              from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id join public.academy_entrainements e on e.id = r.entrainement_id
             where i.competence <> '' and (v_depuis is null or r.repondu_le >= v_depuis) and (v_jusqua is null or r.repondu_le < v_jusqua)
             group by i.competence having count(*) >= 3) x), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'sessions', s.sessions, 'xp', s.xp, 'valides', s.valides, 'affectations', s.affectations, 'temps_actif_s', s.temps) order by s.semaine)
      from (select w.semaine,
              (select count(*) from public.academy_entrainements e where e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as sessions,
              (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as xp,
              (select count(*) from public.academy_validations x where date_trunc('week', x.valide_le at time zone 'Europe/Paris')::date = w.semaine) as valides,
              (select count(*) from public.academy_affectations a where date_trunc('week', a.created_at at time zone 'Europe/Paris')::date = w.semaine) as affectations,
              (select coalesce(sum(extract(epoch from (i.fin - i.debut))), 0)::int from public.academy_intervalles i where date_trunc('week', i.debut at time zone 'Europe/Paris')::date = w.semaine) as temps
            from (select distinct date_trunc('week', d at time zone 'Europe/Paris')::date as semaine from (
                    select terminee_le d from public.academy_entrainements where terminee_le is not null union all select created_at from public.academy_affectations union all select debut from public.academy_intervalles) z
                  where (v_depuis is null or d >= v_depuis) and (v_jusqua is null or d < v_jusqua)) w) s), '[]'::jsonb),
    'scores_competences', coalesce((select jsonb_agg(jsonb_build_object('competence', y.competence, 'type', 'initial', 'moyenne_pct', y.moyenne, 'effectif', y.effectif, 'derniere_le', y.derniere_le) order by y.competence)
      from (select v.competence, round(avg(100.0 * e.nb_bons / greatest(e.nb_total, 1))) as moyenne, count(distinct e.profile_id) as effectif, max(e.terminee_le) as derniere_le
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)
             group by v.competence) y), '[]'::jsonb),
    'definitions', jsonb_build_object(
      'actifs_periode', 'Collaborateurs affectes ayant termine au moins une session sur la periode, rapportes aux collaborateurs affectes.',
      'obligatoires', 'Affectations obligatoires validees (trois couronnes) rapportees aux affectations obligatoires.',
      'echues', 'Affectations dont l echeance est passee et qui ne sont pas validees ; les affectations sans echeance ne comptent pas.',
      'serie', 'Jours consecutifs avec au moins une session terminee, en Europe/Paris ; une journee sans session remet a zero.',
      'items_dus', 'Exercices dont la revision espacee est arrivee a echeance et qui ne sont pas encore su par coeur (force 5).',
      'temps_actif', 'Somme des intervalles d activite acceptes, fusionnes par personne ; chaque reponse vaut un battement, une session laissee ouverte ne compte pas.',
      'a_examiner', 'Faits bruts (session tres rapide, echecs repetes). Aucune qualification automatique.'
    )
  );
end;
$function$;

create or replace function public.academy_fiche(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui(); v_serie record;
begin
  if p_profile_id <> v_uid and not (public.is_manager() or public.est_admin_academy()) then
    raise exception 'Fiche reservee a la direction' using errcode = '42501';
  end if;
  select * into v_serie from public.academy_series where profile_id = p_profile_id;
  return jsonb_build_object(
    'profil', (select jsonb_build_object('id', id, 'full_name', full_name, 'advisor_code', advisor_code, 'role', role, 'is_active', is_active) from public.profiles where id = p_profile_id),
    'serie', jsonb_build_object('serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
                                'meilleure', coalesce(v_serie.meilleure, 0), 'dernier_jour', v_serie.dernier_jour, 'objectif_quotidien', coalesce(v_serie.objectif_quotidien, 1)),
    'xp_total', coalesce((select sum(xp) from public.academy_entrainements where profile_id = p_profile_id), 0),
    'items_dus', public.academy_items_dus(p_profile_id, null),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'version_id', a.version_id, 'slug', m.slug, 'titre', v.titre, 'competence', v.competence, 'theme', m.theme,
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'couronnes', public.academy_couronnes(p_profile_id, a.version_id),
        'nb_items', (select count(*) from public.academy_items i where i.version_id = a.version_id and i.archive_le is null),
        'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = p_profile_id and i.version_id = a.version_id and i.archive_le is null),
        'items_dus', public.academy_items_dus(p_profile_id, a.version_id),
        'xp', coalesce(mx.xp, 0), 'sessions', coalesce(mx.sessions, 0), 'derniere_session', mx.derniere_session,
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = p_profile_id and x.version_id = a.version_id),
        'temps_actif_s', public.academy_duree_version(p_profile_id, a.version_id)) order by a.created_at)
      from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id
      left join public.academy_maitrise mx on mx.profile_id = p_profile_id and mx.version_id = a.version_id
      where a.profile_id = p_profile_id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'version_id', e.version_id, 'titre', v.titre, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le,
        'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = p_profile_id and terminee_le is not null order by demarree_le desc limit 50) e
      join public.academy_module_versions v on v.id = e.version_id), '[]'::jsonb),
    'items_faibles', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'titre_module', v.titre, 'competence', i.competence,
        'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120), 'force', f.force, 'prochaine_le', f.prochaine_le) order by f.force, f.prochaine_le)
      from (select * from public.academy_forces where profile_id = p_profile_id and force <= 2 order by force, prochaine_le limit 20) f
      join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id where i.archive_le is null), '[]'::jsonb),
    'evenements', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'survenu_le', e.survenu_le, 'type', e.type, 'version_id', e.version_id, 'titre', v.titre, 'detail', e.detail) order by e.survenu_le desc)
      from (select * from public.academy_evenements where profile_id = p_profile_id order by survenu_le desc limit 300) e left join public.academy_module_versions v on v.id = e.version_id), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'temps_actif_s', s.temps, 'xp', s.xp, 'sessions', s.n) order by s.semaine)
      from (select w.semaine,
              (select coalesce(sum(extract(epoch from (i.fin - i.debut))), 0)::int from public.academy_intervalles i where i.profile_id = p_profile_id and date_trunc('week', i.debut at time zone 'Europe/Paris')::date = w.semaine) as temps,
              (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = p_profile_id and e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as xp,
              (select count(*) from public.academy_entrainements e where e.profile_id = p_profile_id and e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as n
            from (select distinct date_trunc('week', d at time zone 'Europe/Paris')::date as semaine from (
                    select debut d from public.academy_intervalles where profile_id = p_profile_id union all select terminee_le from public.academy_entrainements where profile_id = p_profile_id and terminee_le is not null) z) w) s), '[]'::jsonb),
    'commentaires', case when public.is_manager() then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'texte', c.texte, 'created_at', c.created_at, 'auteur', pr.full_name) order by c.created_at desc)
      from public.academy_commentaires_coaching c left join public.profiles pr on pr.id = c.auteur_id where c.profile_id = p_profile_id), '[]'::jsonb) else '[]'::jsonb end,
    'temps_actif_s', public.academy_duree_active(p_profile_id, null, null)
  );
end;
$function$;

create or replace function public.academy_matrice_competences()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_direction();
begin
  return jsonb_build_object(
    'seuils', jsonb_build_object('acquis', 'trois couronnes ou plus : tous les exercices sus au moins deux fois', 'a_renforcer', 'une ou deux couronnes, ou revisions en retard', 'non_evalue', 'aucune session terminee'),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('version_id', v.id, 'competence', v.competence, 'titre', v.titre, 'slug', m.slug) order by m.ordre)
      from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.statut = 'publie'), '[]'::jsonb),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('profile_id', pr.id, 'nom', pr.full_name,
        'cellules', (select coalesce(jsonb_agg(jsonb_build_object('version_id', v.id,
            'couronnes', public.academy_couronnes(pr.id, v.id),
            'statut', case
              when not exists (select 1 from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id and e.terminee_le is not null) then 'non_evalue'
              when public.academy_couronnes(pr.id, v.id) >= 3 and coalesce((select a.statut from public.academy_affectations a where a.profile_id = pr.id and a.version_id = v.id), 'valide') <> 'a_revoir' then 'acquis'
              else 'a_renforcer' end,
            'items_dus', public.academy_items_dus(pr.id, v.id),
            'derniere_le', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id),
            'dernier_pct', (select round(100.0 * nb_bons / greatest(nb_total, 1)) from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id and e.terminee_le is not null order by terminee_le desc limit 1)
          )), '[]'::jsonb)
          from public.academy_module_versions v where v.statut = 'publie')
      ) order by pr.full_name)
      from public.profiles pr where pr.is_active = true and pr.id in (select profile_id from public.academy_affectations)), '[]'::jsonb)
  );
end;
$function$;

-- ── 9. Purge : les durees se totalisent par version et par jour ──────────
create or replace function public.academy_purger_intervalles()
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_limite timestamptz; v_nb integer;
begin
  select now() - make_interval(months => retention_intervalles_mois) into v_limite from public.academy_parametres where id = true;
  insert into public.academy_durees_jour (profile_id, version_id, jour, secondes)
  select i.profile_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date, sum(extract(epoch from (i.fin - i.debut)))::int
    from public.academy_intervalles i join public.academy_sessions s on s.id = i.session_id
   where i.fin < v_limite
   group by i.profile_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date
  on conflict (profile_id, version_id, jour) do update set secondes = public.academy_durees_jour.secondes + excluded.secondes;
  delete from public.academy_intervalles where fin < v_limite;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$function$;

-- ── 10. Droits d execution ─────────────────────────────────────────────────
do $do$
declare f text;
begin
  foreach f in array array[
    'academy_catalogue()', 'academy_module(text)', 'academy_mon_parcours()', 'academy_mes_resultats()', 'academy_mes_rappels()',
    'academy_demarrer_entrainement(uuid, uuid)', 'academy_repondre(uuid, uuid, jsonb)', 'academy_terminer_entrainement(uuid)', 'academy_objectif_quotidien(integer)',
    'academy_nouvelle_version(uuid)', 'academy_enregistrer_item(uuid, uuid, jsonb)', 'academy_version_admin(uuid)', 'academy_enregistrer_version(uuid, jsonb)',
    'academy_publier_version(uuid, text, text, boolean)', 'academy_admin_vue()', 'academy_pilotage(date, date)', 'academy_fiche(uuid)', 'academy_matrice_competences()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['academy_normaliser(text)', 'academy_delai_force(integer)', 'academy_couronnes(uuid, uuid)', 'academy_items_dus(uuid, uuid)', 'academy_recalculer_statut(uuid, uuid)', 'academy_melanger_item(text, jsonb, jsonb)',
    'academy_duree_version(uuid, uuid)', 'academy_presenter_item(uuid, jsonb)', 'academy_presenter_entrainement(uuid)', 'academy_verifier_reponse(text, jsonb, jsonb, jsonb, jsonb)', 'academy_purger_intervalles()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end
$do$;

-- Une session vaut douze exercices par defaut, et la notice decrit ce que le
-- mode entrainement enregistre.
update public.academy_parametres set questions_par_quiz = 12 where id = true and questions_par_quiz = 5;
update public.academy_parametres set notice_donnees = 'Entasis Academy enregistre, pour chaque collaborateur : les sessions d exercices (debut, fin, score, XP), chaque reponse donnee et si elle etait juste, la force et la date de prochaine revision de chaque exercice, la serie de jours et l objectif quotidien, et le temps actif compte a chaque reponse (une session laissee ouverte ne compte pas). Aucune frappe, aucune capture, aucune webcam. Ces donnees servent au suivi pedagogique. Elles sont lisibles par vous, par la direction et par l administrateur de la formation ; les commentaires de coaching ne le sont que par la direction. Les intervalles bruts d activite sont purges chaque nuit apres la duree de retention fixee par le cabinet (douze mois), seul un total par jour est conserve.'
 where id = true and notice_donnees like 'Entasis Academy enregistre, pour chaque collaborateur : les lecons%';
