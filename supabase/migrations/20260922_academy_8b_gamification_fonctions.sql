-- Entasis Academy, migration 8b : gamification et schemas, les fonctions.
-- Remplace les fonctions de session (XP par reponse, combo, bilan de fin
-- avec niveau, succes, defis et classement) et de lecture (succes, parcours,
-- resultats, rappels, deck). Texte repris des migrations 6 et 6b : aucun
-- comportement existant n est perdu (idempotences, battements, validation,
-- attestation). Suppose la migration 8 appliquee ; la 8c suit
-- (administration des schemas, pilotage, fiche, droits d execution).
--
-- Appliquee sur entasis-crm-DEV le 22 septembre 2026, nom
-- academy_8b_gamification_fonctions ; version notee dans
-- scripts/academy/tests-sql/LISEZMOI.md.

-- ── 1. Une session : presentation, reponse, fin ────────────────────────────
create or replace function public.academy_presenter_entrainement(p_entrainement_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare e record;
begin
  select * into e from public.academy_entrainements where id = p_entrainement_id;
  return jsonb_build_object(
    'entrainement_id', e.id, 'version_id', e.version_id, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le,
    'titre', (select titre from public.academy_module_versions where id = e.version_id),
    'slug', (select m.slug from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.id = e.version_id),
    'items', (select coalesce(jsonb_agg(public.academy_presenter_item((x.elem ->> 'item_id')::uuid, x.elem -> 'ordre') || jsonb_build_object('rang', x.pos) order by x.pos), '[]'::jsonb)
              from jsonb_array_elements(e.items) with ordinality x(elem, pos)),
    'reponses_deja', (select coalesce(jsonb_agg(jsonb_build_object('item_id', r.item_id, 'correcte', r.correcte)), '[]'::jsonb)
                      from public.academy_entrainement_reponses r where r.entrainement_id = e.id),
    -- Reprise d une session ouverte : le compteur repart de ce qui est acquis.
    'xp_session', (select coalesce(sum(r.xp), 0) from public.academy_entrainement_reponses r where r.entrainement_id = e.id),
    'combo', coalesce((select r.combo from public.academy_entrainement_reponses r where r.entrainement_id = e.id order by r.repondu_le desc, r.rang desc limit 1), 0),
    'schemas', coalesce((select v.schemas from public.academy_module_versions v where v.id = e.version_id), '[]'::jsonb)
  );
end;
$function$;

-- XP par reponse : 10 (bonne reponse), 5 (carte sue), +5 a partir de la
-- troisieme bonne d affilee ; une erreur remet le combo a zero ; le rejeu
-- (deja = true) ne rapporte rien. etait_du memorise si l exercice etait du
-- au moment de la reponse (defi « dix revisions »).
create or replace function public.academy_repondre(p_entrainement_id uuid, p_item_id uuid, p_reponse jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; i record; c record; v_ordre jsonb; v_rang int; v_res jsonb; v_ok boolean; v_force int; v_deja record; v_dernier record; v_now timestamptz := now();
  v_combo int; v_xp int; v_etait_du boolean; v_xp_session int; v_combo_max int;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then raise exception 'Session terminee' using errcode = 'P0001'; end if;
  select x.elem -> 'ordre', x.pos into v_ordre, v_rang from jsonb_array_elements(e.items) with ordinality x(elem, pos) where (x.elem ->> 'item_id')::uuid = p_item_id limit 1;
  if v_ordre is null then raise exception 'Cet item ne fait pas partie de la session' using errcode = 'P0002'; end if;
  select * into i from public.academy_items where id = p_item_id;
  select * into c from public.academy_items_corriges where item_id = p_item_id;

  -- Idempotence : une reponse deja enregistree est rendue telle quelle, avec
  -- les XP et le combo memorises ; rien n est recalcule.
  select * into v_deja from public.academy_entrainement_reponses where entrainement_id = e.id and item_id = p_item_id;
  if v_deja is not null then
    v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), v_deja.reponse);
    select coalesce(sum(r.xp), 0), coalesce(max(r.combo), 0) into v_xp_session, v_combo_max from public.academy_entrainement_reponses r where r.entrainement_id = e.id;
    return jsonb_build_object('correcte', v_deja.correcte, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''),
                              'force', (select force from public.academy_forces where profile_id = v_uid and item_id = p_item_id), 'deja', true,
                              'xp_gagne', v_deja.xp, 'xp_session', v_xp_session, 'combo', v_deja.combo, 'combo_max', v_combo_max);
  end if;

  v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), p_reponse);
  v_ok := coalesce((v_res ->> 'correcte')::boolean, false);
  v_etait_du := exists (select 1 from public.academy_forces f where f.profile_id = v_uid and f.item_id = p_item_id and f.prochaine_le <= v_now and f.force < 5);
  -- Combo : la valeur apres la derniere reponse de la session, puis cette reponse.
  v_combo := coalesce((select r.combo from public.academy_entrainement_reponses r where r.entrainement_id = e.id order by r.repondu_le desc, r.rang desc limit 1), 0);
  if v_ok then
    v_combo := v_combo + 1;
    v_xp := (case when i.type = 'carte' then 5 else 10 end) + (case when v_combo >= 3 then 5 else 0 end);
  else
    v_combo := 0; v_xp := 0;
  end if;
  insert into public.academy_entrainement_reponses (entrainement_id, item_id, rang, reponse, correcte, xp, combo, etait_du)
  values (e.id, p_item_id, v_rang, p_reponse, v_ok, v_xp, v_combo, v_etait_du) on conflict (entrainement_id, item_id) do nothing;

  -- Repetition espacee.
  insert into public.academy_forces (profile_id, item_id, force, prochaine_le, reussites, echecs, derniere_le)
  values (v_uid, p_item_id, case when v_ok then 1 else 0 end, v_now + public.academy_delai_force(case when v_ok then 1 else 0 end),
          case when v_ok then 1 else 0 end, case when v_ok then 0 else 1 end, v_now)
  on conflict (profile_id, item_id) do update set
    force = case when v_ok then least(5, public.academy_forces.force + 1) else least(public.academy_forces.force, 1) end,
    prochaine_le = v_now + public.academy_delai_force(case when v_ok then least(5, public.academy_forces.force + 1) else least(public.academy_forces.force, 1) end),
    reussites = public.academy_forces.reussites + case when v_ok then 1 else 0 end,
    echecs = public.academy_forces.echecs + case when v_ok then 0 else 1 end,
    derniere_le = v_now
  returning force into v_force;

  -- Chaque reponse vaut un battement d activite.
  if e.session_id is not null then
    select id, fin into v_dernier from public.academy_intervalles where session_id = e.session_id order by fin desc limit 1;
    if v_dernier.id is not null and v_dernier.fin >= v_now - interval '90 seconds' then
      update public.academy_intervalles set fin = v_now where id = v_dernier.id;
    else
      insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin) values (e.session_id, v_uid, null, v_now, v_now);
    end if;
    update public.academy_sessions set dernier_battement_le = v_now where id = e.session_id;
  end if;

  select coalesce(sum(r.xp), 0), coalesce(max(r.combo), 0) into v_xp_session, v_combo_max from public.academy_entrainement_reponses r where r.entrainement_id = e.id;
  return jsonb_build_object('correcte', v_ok, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''), 'force', v_force, 'deja', false,
                            'xp_gagne', v_xp, 'xp_session', v_xp_session, 'combo', v_combo, 'combo_max', v_combo_max);
end;
$function$;

-- Fin de session : xp = somme des reponses + 20 si parfaite + 10 si premiere
-- du jour + defis du jour credites par cette session. Le resume porte le
-- detail des XP, le niveau avant et apres, le meilleur combo, les succes
-- debloques, les trois defis du jour et le classement anonyme.
create or replace function public.academy_terminer_entrainement(p_entrainement_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; v_auj date := public.academy_aujourdhui();
  v_bons int; v_total int; v_cartes int; v_xp int; v_premiere boolean; v_serie record; v_serie_val int; v_meilleure int;
  v_avant int; v_apres int; v_valide boolean := false; v_numero text; v_attestation jsonb; v_statut text; v_erreurs jsonb; v_resume jsonb;
  v_xp_reponses int; v_xp_base int; v_xp_combo int; v_combo_max int; v_parfaite boolean; v_xp_defis int := 0; v_statut_avant text;
  v_niveau_avant jsonb; v_niveau_apres jsonb; v_defis_out jsonb := '[]'::jsonb; d jsonb; v_credite boolean; v_succes jsonb; v_defis_faits int;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then return e.resume; end if;

  select count(*) filter (where r.correcte), count(*), count(*) filter (where r.correcte and i.type = 'carte'),
         coalesce(sum(r.xp), 0), coalesce(sum(case when r.correcte then (case when i.type = 'carte' then 5 else 10 end) else 0 end), 0), coalesce(max(r.combo), 0)
    into v_bons, v_total, v_cartes, v_xp_reponses, v_xp_base, v_combo_max
    from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id where r.entrainement_id = e.id;
  if v_total = 0 then raise exception 'Aucune reponse dans cette session' using errcode = 'P0001'; end if;
  if v_total < jsonb_array_length(e.items) then
    raise exception 'Session incomplete : % exercices sur % ont une reponse', v_total, jsonb_array_length(e.items) using errcode = 'P0001';
  end if;
  v_xp_combo := v_xp_reponses - v_xp_base;

  select not exists (select 1 from public.academy_entrainements x where x.profile_id = v_uid and x.terminee_le is not null and (x.terminee_le at time zone 'Europe/Paris')::date = v_auj)
    into v_premiere;
  v_parfaite := v_bons = jsonb_array_length(e.items) and v_total = jsonb_array_length(e.items);
  v_xp := v_xp_reponses + case when v_parfaite then 20 else 0 end + case when v_premiere then 10 else 0 end;

  v_niveau_avant := public.academy_niveau(coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0)::int);
  v_avant := coalesce((select couronnes from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id), 0);
  v_statut_avant := (select statut from public.academy_affectations where profile_id = v_uid and version_id = e.version_id);

  -- La session est terminee des maintenant : les defis du jour la comptent,
  -- et leur XP entre dans le sien (sum(entrainements.xp) reste la seule source).
  update public.academy_entrainements set terminee_le = now(), nb_bons = v_bons, nb_total = v_total, xp = v_xp where id = e.id;
  for d in select * from jsonb_array_elements(public.academy_defis_du_jour(v_uid, v_auj)) loop
    v_credite := false;
    if (d ->> 'fait')::boolean then
      insert into public.academy_defis_faits (profile_id, jour, code, entrainement_id, xp) values (v_uid, v_auj, d ->> 'code', e.id, (d ->> 'xp')::int)
      on conflict (profile_id, jour, code) do nothing;
      if found then v_credite := true; v_xp_defis := v_xp_defis + (d ->> 'xp')::int; end if;
    end if;
    v_defis_out := v_defis_out || (d || jsonb_build_object('fait_par_cette_session', v_credite));
  end loop;
  v_xp := v_xp + v_xp_defis;
  update public.academy_entrainements set xp = v_xp where id = e.id;
  select count(*) into v_defis_faits from public.academy_defis_faits where profile_id = v_uid and jour = v_auj;

  -- Serie de jours.
  select * into v_serie from public.academy_series where profile_id = v_uid;
  if v_serie is null then
    insert into public.academy_series (profile_id, serie, meilleure, dernier_jour) values (v_uid, 1, 1, v_auj);
    v_serie_val := 1; v_meilleure := 1;
  elsif v_serie.dernier_jour = v_auj then
    v_serie_val := v_serie.serie; v_meilleure := v_serie.meilleure;
  else
    v_serie_val := case when v_serie.dernier_jour = v_auj - 1 then v_serie.serie + 1 else 1 end;
    v_meilleure := greatest(v_serie.meilleure, v_serie_val);
    update public.academy_series set serie = v_serie_val, meilleure = v_meilleure, dernier_jour = v_auj, updated_at = now() where profile_id = v_uid;
  end if;

  v_apres := public.academy_couronnes(v_uid, e.version_id);
  insert into public.academy_maitrise (profile_id, version_id, couronnes, xp, sessions, derniere_session)
  values (v_uid, e.version_id, v_apres, v_xp, 1, now())
  on conflict (profile_id, version_id) do update set couronnes = v_apres, xp = public.academy_maitrise.xp + v_xp,
    sessions = public.academy_maitrise.sessions + 1, derniere_session = now(), updated_at = now();

  -- Validation a trois couronnes : attestation interne, une fois.
  if v_apres >= 3 and not exists (select 1 from public.academy_validations where profile_id = v_uid and version_id = e.version_id) then
    insert into public.academy_validations (profile_id, version_id, tentative_id) values (v_uid, e.version_id, null)
    on conflict (profile_id, version_id) do nothing;
    v_valide := true;
    -- Deux validations dans la meme seconde ne tirent pas le meme numero.
    perform pg_advisory_xact_lock(hashtext('academy_attestations'));
    select 'EA-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_numero
      from public.academy_attestations where delivree_le >= date_trunc('year', now());
    insert into public.academy_attestations (numero, profile_id, version_id, tentative_id, score, total)
    values (v_numero, v_uid, e.version_id, null, v_apres, 5)
    on conflict (profile_id, version_id) do nothing;
    perform public.academy_evenement(v_uid, 'module_valide', e.version_id, jsonb_build_object('entrainement_id', e.id, 'couronnes', v_apres));
  end if;
  select jsonb_build_object('numero', numero, 'delivree_le', delivree_le) into v_attestation
    from public.academy_attestations where profile_id = v_uid and version_id = e.version_id;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'competence', i.competence,
           'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120)) order by r.rang), '[]'::jsonb)
    into v_erreurs from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id
   where r.entrainement_id = e.id and not r.correcte;

  v_statut := public.academy_recalculer_statut(v_uid, e.version_id);
  v_niveau_apres := public.academy_niveau(coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0)::int);
  v_succes := public.academy_attribuer_succes(v_uid, e.id, jsonb_build_object(
    'couronnes_avant', v_avant, 'couronnes_apres', v_apres, 'statut_avant', v_statut_avant, 'statut_apres', v_statut,
    'combo_max', v_combo_max, 'parfaite', v_parfaite, 'niveau_avant', v_niveau_avant, 'niveau_apres', v_niveau_apres,
    'serie', v_serie_val, 'defis_faits', v_defis_faits));

  v_resume := jsonb_build_object(
    'entrainement_id', e.id, 'version_id', e.version_id, 'nb_bons', v_bons, 'nb_total', v_total, 'xp', v_xp,
    'premiere_du_jour', v_premiere, 'serie', v_serie_val, 'meilleure_serie', v_meilleure,
    'couronnes_avant', v_avant, 'couronnes_apres', v_apres, 'valide', v_valide, 'attestation', v_attestation,
    'erreurs', v_erreurs, 'statut_module', v_statut, 'terminee_le', now(),
    'xp_total_version', (select xp from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id),
    'xp_detail', jsonb_build_object('reponses', v_xp_base, 'combo', v_xp_combo, 'parfaite', case when v_parfaite then 20 else 0 end,
                                    'premiere_du_jour', case when v_premiere then 10 else 0 end, 'defis', v_xp_defis, 'total', v_xp),
    'niveau_avant', v_niveau_avant, 'niveau_apres', v_niveau_apres, 'combo_max', v_combo_max,
    'succes_debloques', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'titre', s.titre, 'description', s.description, 'icone', s.icone) order by s.ordre), '[]'::jsonb)
                         from public.academy_succes s where s.code in (select jsonb_array_elements_text(v_succes))),
    'defis', v_defis_out,
    'classement', public.academy_classement_semaine()
  );
  update public.academy_entrainements set resume = v_resume where id = e.id;
  perform public.academy_evenement(v_uid, 'session_terminee', e.version_id, jsonb_build_object('entrainement_id', e.id, 'bons', v_bons, 'total', v_total, 'xp', v_xp, 'couronnes', v_apres));
  return v_resume;
end;
$function$;

-- ── 2. Lecture : succes, parcours, resultats, rappels, deck ────────────────
-- Tous les succes du catalogue, avec la date d obtention ou null, dans
-- l ordre. Un succes secret non obtenu garde sa condition pour lui.
create or replace function public.academy_mes_succes()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'titre', s.titre,
      'description', case when s.secret and o.obtenu_le is null then '' else s.description end,
      'icone', s.icone, 'ordre', s.ordre, 'secret', s.secret, 'obtenu_le', o.obtenu_le) order by s.ordre)
    from public.academy_succes s left join public.academy_succes_obtenus o on o.code = s.code and o.profile_id = v_uid), '[]'::jsonb);
end;
$function$;

create or replace function public.academy_mon_parcours()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui(); v_serie record; v_sess_auj int; v_xp_total int;
begin
  select * into v_serie from public.academy_series where profile_id = v_uid;
  select count(*) into v_sess_auj from public.academy_entrainements
   where profile_id = v_uid and terminee_le is not null and (terminee_le at time zone 'Europe/Paris')::date = v_auj;
  v_xp_total := coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0);
  return jsonb_build_object(
    'aujourdhui', v_auj,
    'serie', jsonb_build_object(
      'serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
      'meilleure', coalesce(v_serie.meilleure, 0), 'dernier_jour', v_serie.dernier_jour,
      'objectif_quotidien', coalesce(v_serie.objectif_quotidien, 1),
      'sessions_aujourdhui', v_sess_auj,
      'objectif_atteint', v_sess_auj >= coalesce(v_serie.objectif_quotidien, 1),
      'en_danger', (v_serie.dernier_jour = v_auj - 1 and v_sess_auj = 0)),
    'xp', jsonb_build_object(
      'total', v_xp_total,
      'aujourdhui', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid and (terminee_le at time zone 'Europe/Paris')::date = v_auj), 0),
      'semaine', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid and terminee_le >= now() - interval '7 days'), 0)),
    'niveau', public.academy_niveau(v_xp_total),
    'defis', public.academy_defis_du_jour(v_uid, v_auj),
    'classement', public.academy_classement_semaine(),
    'succes', jsonb_build_object(
      'obtenus', (select count(*) from public.academy_succes_obtenus o where o.profile_id = v_uid),
      'total', (select count(*) from public.academy_succes),
      'recents', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'titre', s.titre, 'icone', s.icone, 'obtenu_le', o.obtenu_le) order by o.obtenu_le desc)
        from (select * from public.academy_succes_obtenus where profile_id = v_uid order by obtenu_le desc limit 3) o join public.academy_succes s on s.code = o.code), '[]'::jsonb)),
    'items_dus', public.academy_items_dus(v_uid, null),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'module_id', a.module_id, 'version_id', a.version_id, 'parcours_id', a.parcours_id,
        'parcours_titre', (select titre from public.academy_parcours pa where pa.id = a.parcours_id),
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut,
        'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'slug', m.slug, 'titre', v.titre, 'theme', m.theme, 'niveau', m.niveau, 'duree_minutes', v.duree_minutes,
        'nb_items', (select count(*) from public.academy_items i where i.version_id = v.id and i.archive_le is null),
        'couronnes', public.academy_couronnes(v_uid, v.id),
        'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = v_uid and i.version_id = v.id and i.archive_le is null),
        'items_dus', public.academy_items_dus(v_uid, v.id),
        'xp', coalesce(mx.xp, 0), 'sessions', coalesce(mx.sessions, 0), 'derniere_session', mx.derniere_session,
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = v_uid and x.version_id = v.id),
        'version_statut', v.statut, 'created_at', a.created_at
      ) order by (a.statut = 'valide'), a.echeance nulls last, a.created_at)
      from public.academy_affectations a
      join public.academy_modules m on m.id = a.module_id
      join public.academy_module_versions v on v.id = a.version_id
      left join public.academy_maitrise mx on mx.profile_id = v_uid and mx.version_id = v.id
      where a.profile_id = v_uid), '[]'::jsonb),
    'dernieres_reussites', coalesce((select jsonb_agg(jsonb_build_object('version_id', x.version_id, 'titre', v.titre, 'slug', m.slug, 'valide_le', x.valide_le,
        'attestation', (select numero from public.academy_attestations t where t.profile_id = v_uid and t.version_id = x.version_id)) order by x.valide_le desc)
      from (select * from public.academy_validations where profile_id = v_uid order by valide_le desc limit 5) x
      join public.academy_module_versions v on v.id = x.version_id join public.academy_modules m on m.id = v.module_id), '[]'::jsonb),
    'temps_actif_s', public.academy_duree_active(v_uid, null, null),
    'temps_actif_7j_s', public.academy_duree_active(v_uid, now() - interval '7 days', null),
    'notice_donnees', (select notice_donnees from public.academy_parametres where id = true),
    'retention_intervalles_mois', (select retention_intervalles_mois from public.academy_parametres where id = true)
  );
end;
$function$;

create or replace function public.academy_mes_resultats()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_serie record; v_auj date := public.academy_aujourdhui(); v_xp_total int;
begin
  select * into v_serie from public.academy_series where profile_id = v_uid;
  v_xp_total := coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0);
  return jsonb_build_object(
    'serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
    'meilleure', coalesce(v_serie.meilleure, 0),
    'xp_total', v_xp_total,
    'niveau', public.academy_niveau(v_xp_total),
    'succes', public.academy_mes_succes(),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'version_id', e.version_id, 'slug', m.slug, 'titre', v.titre,
        'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le, 'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = v_uid and terminee_le is not null order by demarree_le desc limit 100) e
      join public.academy_module_versions v on v.id = e.version_id join public.academy_modules m on m.id = v.module_id), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'xp', s.xp, 'sessions', s.n) order by s.semaine)
      from (select date_trunc('week', terminee_le at time zone 'Europe/Paris')::date as semaine, sum(xp) as xp, count(*) as n
              from public.academy_entrainements where profile_id = v_uid and terminee_le is not null and terminee_le >= now() - interval '12 weeks' group by 1) s), '[]'::jsonb),
    'items_faibles', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'version_id', i.version_id, 'titre_module', v.titre, 'slug', m.slug,
        'competence', i.competence, 'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120),
        'force', f.force, 'prochaine_le', f.prochaine_le) order by f.force, f.prochaine_le)
      from (select * from public.academy_forces where profile_id = v_uid and force <= 2 order by force, prochaine_le limit 30) f
      join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id join public.academy_modules m on m.id = v.module_id
      where i.archive_le is null and v.statut = 'publie'), '[]'::jsonb)
  );
end;
$function$;

-- La cloche gagne « defis_du_jour » : des defis restent et aucune session
-- n est terminee aujourd hui. Au passage, chaque rappel est rendu a plat
-- (la migration 6 agregeait la ligne entiere, d ou une enveloppe
-- « jsonb_build_object » que l ecran ne lisait pas).
create or replace function public.academy_mes_rappels()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid; v_auj date := public.academy_aujourdhui(); v_serie record; v_dus int; v_sess_auj int; v_defis jsonb;
begin
  if auth.uid() is null or not public.is_staff() then return '[]'::jsonb; end if;
  v_uid := auth.uid();
  select * into v_serie from public.academy_series where profile_id = v_uid;
  v_dus := public.academy_items_dus(v_uid, null);
  select count(*) into v_sess_auj from public.academy_entrainements
   where profile_id = v_uid and terminee_le is not null and (terminee_le at time zone 'Europe/Paris')::date = v_auj;
  v_defis := public.academy_defis_du_jour(v_uid, v_auj);
  return coalesce((
    select jsonb_agg(x.rappel) from (
      select jsonb_build_object('type', 'items_dus', 'nombre', v_dus, 'echeance', v_auj, 'titres', (
               select coalesce(jsonb_agg(distinct v.titre), '[]'::jsonb) from public.academy_forces f join public.academy_items i on i.id = f.item_id
               join public.academy_module_versions v on v.id = i.version_id where f.profile_id = v_uid and f.prochaine_le <= now() and f.force < 5 and v.statut = 'publie')) as rappel
       where v_dus > 0
      union all
      select jsonb_build_object('type', 'serie_en_danger', 'nombre', v_serie.serie, 'echeance', v_auj, 'titres', '[]'::jsonb)
       where v_serie.dernier_jour = v_auj - 1 and v_sess_auj = 0 and coalesce(v_serie.serie, 0) >= 2
      union all
      select jsonb_build_object('type', 'defis_du_jour', 'nombre', count(*), 'echeance', v_auj, 'titres', jsonb_agg(d ->> 'titre'))
        from jsonb_array_elements(v_defis) d
       where not coalesce((d ->> 'fait')::boolean, false) and v_sess_auj = 0
      having count(*) > 0
      union all
      select jsonb_build_object('type', 'affectations_en_retard', 'nombre', count(*), 'echeance', min(a.echeance),
               'titres', jsonb_agg(v.titre order by a.echeance))
        from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id
       where a.profile_id = v_uid and a.statut <> 'valide' and a.echeance is not null and a.echeance < v_auj
      having count(*) > 0
      union all
      select jsonb_build_object('type', 'echeances_proches', 'nombre', count(*), 'echeance', min(a.echeance),
               'titres', jsonb_agg(v.titre order by a.echeance))
        from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id
       where a.profile_id = v_uid and a.statut <> 'valide' and a.echeance is not null and a.echeance between v_auj and v_auj + 7
      having count(*) > 0
    ) x
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.academy_module(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v jsonb;
begin
  select jsonb_build_object(
    'module_id', m.id, 'slug', m.slug, 'titre', mv.titre, 'theme', m.theme, 'niveau', m.niveau,
    'version_id', mv.id, 'numero', mv.numero, 'objectif', mv.objectif, 'competence', mv.competence,
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'memo_md', mv.memo_md, 'sources', mv.sources, 'schemas', mv.schemas,
    'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'publie_le', mv.publie_le,
    'nb_items', (select count(*) from public.academy_items i where i.version_id = mv.id and i.archive_le is null),
    'couronnes', public.academy_couronnes(v_uid, mv.id),
    'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = v_uid and i.version_id = mv.id and i.archive_le is null),
    'items_dus', public.academy_items_dus(v_uid, mv.id),
    'xp', coalesce((select xp from public.academy_maitrise x where x.profile_id = v_uid and x.version_id = mv.id), 0),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('competence', c.competence, 'nb', c.nb, 'force_moyenne', c.fm) order by c.fm, c.competence)
      from (select i.competence, count(*) as nb, round(avg(coalesce(f.force, 0)), 1) as fm
              from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = v_uid
             where i.version_id = mv.id and i.archive_le is null and i.competence <> '' group by i.competence) c), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le, 'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = v_uid and version_id = mv.id and terminee_le is not null order by demarree_le desc limit 20) e), '[]'::jsonb),
    'affectation', (select jsonb_build_object('id', a.id, 'statut', a.statut, 'echeance', a.echeance, 'obligatoire', a.obligatoire)
                    from public.academy_affectations a where a.profile_id = v_uid and a.version_id = mv.id),
    'validation', (select jsonb_build_object('valide_le', x.valide_le) from public.academy_validations x where x.profile_id = v_uid and x.version_id = mv.id),
    'attestation', (select jsonb_build_object('numero', t.numero, 'delivree_le', t.delivree_le, 'score', t.score, 'total', t.total)
                    from public.academy_attestations t where t.profile_id = v_uid and t.version_id = mv.id),
    'entrainement_ouvert', (select jsonb_build_object('id', e.id, 'jeton_client', e.jeton_client) from public.academy_entrainements e
                            where e.profile_id = v_uid and e.version_id = mv.id and e.terminee_le is null and e.demarree_le > now() - interval '2 hours'
                            order by e.demarree_le desc limit 1),
    'duree_active_s', public.academy_duree_version(v_uid, mv.id)
  ) into v
  from public.academy_modules m
  join public.academy_module_versions mv on mv.module_id = m.id and mv.statut = 'publie'
  where m.slug = p_slug and m.archive_le is null;
  if v is null then raise exception 'Module introuvable ou non publie' using errcode = 'P0002'; end if;
  return v;
end;
$function$;
