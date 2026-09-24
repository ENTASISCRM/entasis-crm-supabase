-- Entasis Academy, migration 8c : gamification et schemas, fin.
-- Administration des schemas d une version (enregistrement avec limite de
-- 24 000 caracteres par SVG, copie a la nouvelle version, contenu fige a la
-- publication, lecture admin), pilotage et fiche pour la direction (niveau
-- et nombre de succes par personne), droits d execution. Texte repris des
-- migrations 6b et 6c. Suppose les migrations 8 et 8b appliquees.
--
-- Appliquee sur entasis-crm-DEV le 22 septembre 2026, nom
-- academy_8c_gamification_admin_pilotage ; version notee dans
-- scripts/academy/tests-sql/LISEZMOI.md.

-- ── 1. Administration : les schemas d une version ──────────────────────────
-- Les schemas font partie du contenu fige d une version publiee.
create or replace function public.academy_version_immuable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.statut = 'publie' then
    if new.statut = 'archive'
       and new.module_id = old.module_id and new.numero = old.numero
       and new.titre = old.titre and new.objectif = old.objectif
       and new.competence = old.competence and new.duree_minutes = old.duree_minutes
       and new.prerequis = old.prerequis and new.seuil_reussite = old.seuil_reussite
       and new.cas_pratique = old.cas_pratique and new.a_completer = old.a_completer
       and new.sources = old.sources and new.fictif = old.fictif
       and new.memo_md = old.memo_md and new.schemas = old.schemas
       and new.publie_le is not distinct from old.publie_le
       and new.publie_par is not distinct from old.publie_par
       and new.relu_par is not distinct from old.relu_par
       and new.relu_le is not distinct from old.relu_le then
      return new;
    end if;
    raise exception 'Une version publiee ne se modifie pas : creez un nouveau brouillon'
      using errcode = 'check_violation';
  end if;
  if old.statut = 'archive' then
    raise exception 'Une version archivee ne se modifie pas'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

create or replace function public.academy_nouvelle_version(p_module_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  src record; v_new uuid; v_numero integer; it record; v_new_item uuid;
begin
  if exists (select 1 from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon') then
    select id into v_new from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon' order by numero desc limit 1;
    return v_new;
  end if;
  select * into src from public.academy_module_versions where module_id = p_module_id order by (statut = 'publie') desc, numero desc limit 1;
  if src is null then raise exception 'Module sans version' using errcode = 'P0002'; end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.academy_module_versions where module_id = p_module_id;
  insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, memo_md, schemas, created_by)
  values (p_module_id, v_numero, 'brouillon', src.titre, src.objectif, src.competence, src.duree_minutes, src.prerequis, src.seuil_reussite, src.cas_pratique, src.a_completer, src.sources, src.fictif, src.memo_md, src.schemas, v_uid)
  returning id into v_new;
  -- L alias ne porte pas le nom d une variable de boucle (lecon de la migration 2).
  for it in select ai.*, c.corrige, c.explication from public.academy_items ai left join public.academy_items_corriges c on c.item_id = ai.id where ai.version_id = src.id order by ai.ordre loop
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload, archive_le)
    values (v_new, it.ordre, it.type, it.competence, it.difficulte, it.payload, it.archive_le)
    returning id into v_new_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_new_item, coalesce(it.corrige, '{}'::jsonb), coalesce(it.explication, ''));
  end loop;
  perform public.academy_journaliser('nouvelle_version', v_new::text, jsonb_build_object('module_id', p_module_id, 'numero', v_numero, 'source', src.id));
  return v_new;
end;
$function$;

create or replace function public.academy_version_admin(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v jsonb;
begin
  select jsonb_build_object(
    'id', mv.id, 'module_id', mv.module_id, 'slug', m.slug, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre,
    'numero', mv.numero, 'statut', mv.statut, 'titre', mv.titre, 'objectif', mv.objectif, 'competence', mv.competence,
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'seuil_reussite', mv.seuil_reussite,
    'memo_md', mv.memo_md, 'schemas', mv.schemas, 'sources', mv.sources, 'a_completer', mv.a_completer, 'fictif', mv.fictif,
    'publie_le', mv.publie_le, 'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'commentaire_relecture', mv.commentaire_relecture, 'archive_le', mv.archive_le,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'ordre', i.ordre, 'type', i.type, 'competence', i.competence, 'difficulte', i.difficulte,
        'payload', i.payload, 'corrige', c.corrige, 'explication', c.explication, 'archive_le', i.archive_le,
        'statistiques', (select jsonb_build_object('reponses', count(*), 'correctes', count(*) filter (where r.correcte)) from public.academy_entrainement_reponses r where r.item_id = i.id)) order by i.ordre, i.created_at)
        from public.academy_items i left join public.academy_items_corriges c on c.item_id = i.id where i.version_id = mv.id), '[]'::jsonb),
    'affectations', (select count(*) from public.academy_affectations a where a.version_id = mv.id),
    'validations', (select count(*) from public.academy_validations x where x.version_id = mv.id)
  ) into v
  from public.academy_module_versions mv join public.academy_modules m on m.id = mv.module_id where mv.id = p_version_id;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  return v;
end;
$function$;

-- schemas dans le patch : une liste d objets a cle, chaque SVG sous 24 000
-- caracteres (la meme limite que l assainisseur du client).
create or replace function public.academy_enregistrer_version(p_version_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); s jsonb;
begin
  if p_patch ? 'schemas' then
    if jsonb_typeof(p_patch -> 'schemas') <> 'array' then raise exception 'Les schemas forment une liste' using errcode = 'check_violation'; end if;
    for s in select * from jsonb_array_elements(p_patch -> 'schemas') loop
      if jsonb_typeof(s) <> 'object' or coalesce(btrim(s ->> 'cle'), '') = '' then raise exception 'Chaque schema porte une cle' using errcode = 'check_violation'; end if;
      if length(coalesce(s ->> 'svg', '')) > 24000 then
        raise exception 'Le schema « % » depasse 24 000 caracteres', s ->> 'cle' using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  update public.academy_module_versions set
    titre = coalesce(p_patch ->> 'titre', titre), objectif = coalesce(p_patch ->> 'objectif', objectif),
    competence = coalesce(p_patch ->> 'competence', competence), duree_minutes = coalesce((p_patch ->> 'duree_minutes')::int, duree_minutes),
    prerequis = coalesce(p_patch -> 'prerequis', prerequis), seuil_reussite = coalesce((p_patch ->> 'seuil_reussite')::numeric, seuil_reussite),
    cas_pratique = coalesce(p_patch -> 'cas_pratique', cas_pratique), a_completer = coalesce(p_patch -> 'a_completer', a_completer),
    sources = coalesce(p_patch -> 'sources', sources), fictif = coalesce((p_patch ->> 'fictif')::boolean, fictif),
    memo_md = coalesce(p_patch ->> 'memo_md', memo_md), schemas = coalesce(p_patch -> 'schemas', schemas), updated_at = now()
  where id = p_version_id and statut = 'brouillon';
  if not found then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_patch ? 'theme' or p_patch ? 'niveau' or p_patch ? 'ordre' then
    update public.academy_modules m set theme = coalesce(p_patch ->> 'theme', theme), niveau = coalesce(p_patch ->> 'niveau', niveau), ordre = coalesce((p_patch ->> 'ordre')::int, ordre), updated_at = now()
    where m.id = (select module_id from public.academy_module_versions where id = p_version_id);
  end if;
end;
$function$;

-- ── 2. Pilotage et fiche : niveau et nombre de succes ──────────────────────
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
        'niveau', public.academy_niveau(coalesce((select sum(xp) from public.academy_entrainements e where e.profile_id = pr.id), 0)::int),
        'nb_succes', (select count(*) from public.academy_succes_obtenus o where o.profile_id = pr.id),
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
    'niveau', public.academy_niveau(coalesce((select sum(xp) from public.academy_entrainements where profile_id = p_profile_id), 0)::int),
    'nb_succes', (select count(*) from public.academy_succes_obtenus o where o.profile_id = p_profile_id),
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

-- ── 3. Droits d execution ──────────────────────────────────────────────────
-- Les fonctions remplacees gardent leurs droits ; la nouvelle
-- academy_mes_succes s ouvre a authenticated. Les helpers de la migration 8
-- (catalogue des defis, defis du jour, attribution des succes) restent
-- internes ; academy_niveau et academy_classement_semaine sont appelables.
do $do$
declare f text;
begin
  foreach f in array array[
    'academy_mes_succes()', 'academy_niveau(integer)', 'academy_classement_semaine()',
    'academy_module(text)', 'academy_mon_parcours()', 'academy_mes_resultats()', 'academy_mes_rappels()',
    'academy_repondre(uuid, uuid, jsonb)', 'academy_terminer_entrainement(uuid)',
    'academy_nouvelle_version(uuid)', 'academy_version_admin(uuid)', 'academy_enregistrer_version(uuid, jsonb)',
    'academy_pilotage(date, date)', 'academy_fiche(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['academy_presenter_entrainement(uuid)', 'academy_catalogue_defis()', 'academy_defis_du_jour(uuid, date)', 'academy_attribuer_succes(uuid, uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end
$do$;
