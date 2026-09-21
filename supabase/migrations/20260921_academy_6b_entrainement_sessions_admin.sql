-- Entasis Academy, migration 6b : le mode entrainement, suite.
-- Les sessions (tirage, correction, fin de session, XP, serie, couronnes,
-- validation) et l administration (items, memo, versions, publication).
-- Suppose la migration 6 appliquee ; la 6c suit (pilotage, purge, droits).

-- ── 6. Une session d entrainement ──────────────────────────────────────────
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
                      from public.academy_entrainement_reponses r where r.entrainement_id = e.id)
  );
end;
$function$;

create or replace function public.academy_demarrer_entrainement(p_version_id uuid, p_jeton uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_version record; v_prm record; v_n integer; v_items jsonb; v_id uuid; v_session uuid;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into v_prm from public.academy_parametres where id = true;
  select * into v_version from public.academy_module_versions where id = p_version_id and (statut = 'publie' or (statut = 'brouillon' and public.est_admin_academy()));
  if v_version is null then raise exception 'Module introuvable ou non publie' using errcode = 'P0002'; end if;

  -- Idempotence par jeton.
  select id into v_id from public.academy_entrainements where jeton_client = p_jeton and profile_id = v_uid;
  if v_id is not null then return public.academy_presenter_entrainement(v_id); end if;
  -- Une session ouverte recente est reprise plutot que doublee.
  select id into v_id from public.academy_entrainements
   where profile_id = v_uid and version_id = p_version_id and terminee_le is null and demarree_le > now() - interval '2 hours'
   order by demarree_le desc limit 1;
  if v_id is not null then return public.academy_presenter_entrainement(v_id); end if;

  v_n := coalesce(v_prm.questions_par_quiz, 12);
  -- Tirage : items dus d abord (force basse, echeance passee), puis jamais
  -- vus, puis les autres au hasard ; choix melanges.
  with candidats as (
    select i.id, i.type, i.payload,
           case when f.item_id is null then 1 when f.prochaine_le <= now() and f.force < 5 then 0 else 2 end as groupe,
           coalesce(f.force, 0) as force, random() as alea
      from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = v_uid
     where i.version_id = p_version_id and i.archive_le is null
  ), tires as (
    select * from candidats order by groupe, force, alea limit v_n
  )
  select jsonb_agg(jsonb_build_object('item_id', t.id,
           'ordre', (select coalesce(jsonb_agg(k order by random()), '[]'::jsonb) from generate_series(0, greatest(
             case t.type when 'ordre' then jsonb_array_length(coalesce(t.payload -> 'elements', '[]'::jsonb))
                         when 'association' then jsonb_array_length(coalesce(t.payload -> 'droite', '[]'::jsonb))
                         when 'vrai_faux' then 0 when 'carte' then 0 when 'trou_saisie' then 0
                         else jsonb_array_length(coalesce(t.payload -> 'choix', '[]'::jsonb)) end, 1) - 1) k))
         order by random())
    into v_items from tires t;
  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'Aucun exercice disponible pour ce deck' using errcode = 'P0002';
  end if;

  insert into public.academy_sessions (profile_id, lecon_id, version_id, jeton_client) values (v_uid, null, p_version_id, gen_random_uuid())
  returning id into v_session;
  insert into public.academy_entrainements (profile_id, version_id, session_id, jeton_client, items)
  values (v_uid, p_version_id, v_session, p_jeton, v_items)
  on conflict (jeton_client) do nothing;
  select id into v_id from public.academy_entrainements where jeton_client = p_jeton and profile_id = v_uid;
  update public.academy_sessions set entrainement_id = v_id where id = v_session;
  insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin) values (v_session, v_uid, null, now(), now());
  perform public.academy_recalculer_statut(v_uid, p_version_id);
  return public.academy_presenter_entrainement(v_id);
end;
$function$;

-- Corrige une reponse presentee contre le corrige, selon le type.
create or replace function public.academy_verifier_reponse(p_type text, p_payload jsonb, p_ordre jsonb, p_corrige jsonb, p_reponse jsonb)
returns jsonb language plpgsql immutable set search_path to 'public'
as $function$
declare
  v_ok boolean := false; v_bonne jsonb; v_orig int; v_idx int; v_pos int; v_txt text; v_n int; k int;
  v_attendu int[]; v_donne int[]; v_texts text[]; v_norm text;
begin
  if p_type in ('choix', 'trou_choix') then
    v_orig := (p_corrige ->> 'index')::int;
    select (o.pos - 1)::int into v_pos from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos) where o.idx::int = v_orig limit 1;
    v_bonne := to_jsonb(v_pos);
    begin v_idx := (p_reponse #>> '{}')::int; exception when others then v_idx := null; end;
    v_ok := v_idx is not null and v_idx = v_pos;
  elsif p_type = 'vrai_faux' then
    v_bonne := to_jsonb(coalesce((p_corrige ->> 'vrai')::boolean, false));
    begin v_ok := coalesce((p_reponse #>> '{}')::boolean = (v_bonne #>> '{}')::boolean, false); exception when others then v_ok := false; end;
  elsif p_type = 'multi' then
    -- indices originaux attendus -> presentes
    select coalesce(array_agg((o.pos - 1)::int order by o.pos), '{}') into v_attendu
      from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos)
     where o.idx::int in (select (x)::int from jsonb_array_elements_text(coalesce(p_corrige -> 'indices', '[]'::jsonb)) x);
    v_bonne := to_jsonb(v_attendu);
    begin select coalesce(array_agg((x)::int order by (x)::int), '{}') into v_donne from jsonb_array_elements_text(coalesce(p_reponse, '[]'::jsonb)) x;
    exception when others then v_donne := '{}'; end;
    v_ok := (select coalesce(array_agg(a order by a), '{}') from unnest(v_attendu) a) = (select coalesce(array_agg(a order by a), '{}') from unnest(v_donne) a)
            and array_length(v_attendu, 1) is not null;
  elsif p_type = 'ordre' then
    -- corrige.ordre = indices originaux dans le bon ordre ; le client rend des indices presentes
    select coalesce(array_agg(q.pres order by o.pos), '{}') into v_attendu
      from jsonb_array_elements_text(coalesce(p_corrige -> 'ordre', '[]'::jsonb)) with ordinality o(x, pos)
      join lateral (select (q2.pos - 1)::int as pres from jsonb_array_elements_text(p_ordre) with ordinality q2(idx, pos) where q2.idx::int = o.x::int limit 1) q on true;
    v_bonne := to_jsonb(v_attendu);
    begin select coalesce(array_agg((x)::int order by o.pos), '{}') into v_donne from jsonb_array_elements_text(coalesce(p_reponse, '[]'::jsonb)) with ordinality o(x, pos);
    exception when others then v_donne := '{}'; end;
    v_ok := v_attendu = v_donne and array_length(v_attendu, 1) is not null;
  elsif p_type = 'association' then
    -- corrige.paires = [[gauche, droite originale]] ; reponse = [[gauche, droite presentee]]
    select coalesce(jsonb_agg(jsonb_build_array((p -> 0)::int, (select (q.pos - 1)::int from jsonb_array_elements_text(p_ordre) with ordinality q(idx, pos) where q.idx::int = (p -> 1)::int limit 1)) order by (p -> 0)::int), '[]'::jsonb)
      into v_bonne from jsonb_array_elements(coalesce(p_corrige -> 'paires', '[]'::jsonb)) p;
    begin
      v_ok := (select coalesce(jsonb_agg(jsonb_build_array((p -> 0)::int, (p -> 1)::int) order by (p -> 0)::int), '[]'::jsonb) from jsonb_array_elements(coalesce(p_reponse, '[]'::jsonb)) p) = v_bonne
              and jsonb_array_length(v_bonne) > 0;
    exception when others then v_ok := false; end;
  elsif p_type = 'trou_saisie' then
    select coalesce(array_agg(public.academy_normaliser(x)), '{}') into v_texts from jsonb_array_elements_text(coalesce(p_corrige -> 'reponses', '[]'::jsonb)) x;
    v_bonne := coalesce(p_corrige -> 'reponses', '[]'::jsonb);
    v_norm := public.academy_normaliser(p_reponse #>> '{}');
    v_ok := v_norm <> '' and v_norm = any (v_texts);
  elsif p_type = 'carte' then
    v_bonne := '{}'::jsonb;
    begin v_ok := coalesce((p_reponse ->> 'su')::boolean, false); exception when others then v_ok := false; end;
  end if;
  return jsonb_build_object('correcte', v_ok, 'bonne_reponse', v_bonne);
end;
$function$;

create or replace function public.academy_repondre(p_entrainement_id uuid, p_item_id uuid, p_reponse jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; i record; c record; v_ordre jsonb; v_rang int; v_res jsonb; v_ok boolean; v_force int; v_deja record; v_dernier record; v_now timestamptz := now();
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then raise exception 'Session terminee' using errcode = 'P0001'; end if;
  select x.elem -> 'ordre', x.pos into v_ordre, v_rang from jsonb_array_elements(e.items) with ordinality x(elem, pos) where (x.elem ->> 'item_id')::uuid = p_item_id limit 1;
  if v_ordre is null then raise exception 'Cet item ne fait pas partie de la session' using errcode = 'P0002'; end if;
  select * into i from public.academy_items where id = p_item_id;
  select * into c from public.academy_items_corriges where item_id = p_item_id;

  -- Idempotence : une reponse deja enregistree est rendue telle quelle.
  select * into v_deja from public.academy_entrainement_reponses where entrainement_id = e.id and item_id = p_item_id;
  if v_deja is not null then
    v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), v_deja.reponse);
    return jsonb_build_object('correcte', v_deja.correcte, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''),
                              'force', (select force from public.academy_forces where profile_id = v_uid and item_id = p_item_id), 'deja', true);
  end if;

  v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), p_reponse);
  v_ok := coalesce((v_res ->> 'correcte')::boolean, false);
  insert into public.academy_entrainement_reponses (entrainement_id, item_id, rang, reponse, correcte)
  values (e.id, p_item_id, v_rang, p_reponse, v_ok) on conflict (entrainement_id, item_id) do nothing;

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

  return jsonb_build_object('correcte', v_ok, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''), 'force', v_force, 'deja', false);
end;
$function$;

create or replace function public.academy_terminer_entrainement(p_entrainement_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; v_auj date := public.academy_aujourdhui();
  v_bons int; v_total int; v_cartes int; v_xp int; v_premiere boolean; v_serie record; v_serie_val int; v_meilleure int;
  v_avant int; v_apres int; v_valide boolean := false; v_numero text; v_attestation jsonb; v_statut text; v_erreurs jsonb; v_resume jsonb;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then return e.resume; end if;

  select count(*) filter (where r.correcte), count(*), count(*) filter (where r.correcte and i.type = 'carte')
    into v_bons, v_total, v_cartes
    from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id where r.entrainement_id = e.id;
  if v_total = 0 then raise exception 'Aucune reponse dans cette session' using errcode = 'P0001'; end if;
  if v_total < jsonb_array_length(e.items) then
    raise exception 'Session incomplete : % exercices sur % ont une reponse', v_total, jsonb_array_length(e.items) using errcode = 'P0001';
  end if;

  select not exists (select 1 from public.academy_entrainements x where x.profile_id = v_uid and x.terminee_le is not null and (x.terminee_le at time zone 'Europe/Paris')::date = v_auj)
    into v_premiere;
  v_xp := (v_bons - v_cartes) * 10 + v_cartes * 5
        + case when v_bons = jsonb_array_length(e.items) and v_total = jsonb_array_length(e.items) then 20 else 0 end
        + case when v_premiere then 10 else 0 end;

  v_avant := coalesce((select couronnes from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id), 0);

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
  v_resume := jsonb_build_object(
    'entrainement_id', e.id, 'version_id', e.version_id, 'nb_bons', v_bons, 'nb_total', v_total, 'xp', v_xp,
    'premiere_du_jour', v_premiere, 'serie', v_serie_val, 'meilleure_serie', v_meilleure,
    'couronnes_avant', v_avant, 'couronnes_apres', v_apres, 'valide', v_valide, 'attestation', v_attestation,
    'erreurs', v_erreurs, 'statut_module', v_statut, 'terminee_le', now(),
    'xp_total_version', (select xp from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id)
  );
  update public.academy_entrainements set terminee_le = now(), nb_bons = v_bons, nb_total = v_total, xp = v_xp, resume = v_resume where id = e.id;
  perform public.academy_evenement(v_uid, 'session_terminee', e.version_id, jsonb_build_object('entrainement_id', e.id, 'bons', v_bons, 'total', v_total, 'xp', v_xp, 'couronnes', v_apres));
  return v_resume;
end;
$function$;

create or replace function public.academy_objectif_quotidien(p_objectif integer)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  insert into public.academy_series (profile_id, objectif_quotidien) values (v_uid, greatest(1, least(10, coalesce(p_objectif, 1))))
  on conflict (profile_id) do update set objectif_quotidien = greatest(1, least(10, coalesce(p_objectif, 1))), updated_at = now();
end;
$function$;

-- ── 7. Administration : items, memo, versions ──────────────────────────────
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
  insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, memo_md, created_by)
  values (p_module_id, v_numero, 'brouillon', src.titre, src.objectif, src.competence, src.duree_minutes, src.prerequis, src.seuil_reussite, src.cas_pratique, src.a_completer, src.sources, src.fictif, src.memo_md, v_uid)
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

-- Un exercice d ordre ou d association ne se stocke jamais dans l ordre
-- d auteur : les elements (ou la colonne de droite) sont permutes au hasard
-- a l enregistrement et le corrige suit, pour qu une lecture de la table ne
-- donne pas la reponse. Le corrige recu liste des indices ORIGINAUX (l ordre
-- d auteur) ; il est reecrit en indices stockes.
create or replace function public.academy_melanger_item(p_type text, p_payload jsonb, p_corrige jsonb)
returns jsonb language plpgsql volatile set search_path to 'public'
as $function$
declare v_n int; v_perm int[]; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_corrige jsonb := coalesce(p_corrige, '{}'::jsonb); v_cle text;
begin
  v_cle := case p_type when 'ordre' then 'elements' when 'association' then 'droite' else null end;
  if v_cle is null then return jsonb_build_object('payload', v_payload, 'corrige', v_corrige); end if;
  v_n := jsonb_array_length(coalesce(v_payload -> v_cle, '[]'::jsonb));
  if v_n < 2 then return jsonb_build_object('payload', v_payload, 'corrige', v_corrige); end if;
  select array_agg(k order by random()) into v_perm from generate_series(0, v_n - 1) k;
  -- Jamais l identite : une lecture de la table ne doit pas donner la reponse.
  if v_perm = (select array_agg(k) from generate_series(0, v_n - 1) k) then
    v_perm := array[v_perm[2], v_perm[1]] || v_perm[3:];
  end if;
  -- perm[q] = indice original de l element place en position q (1-based en SQL).
  v_payload := v_payload || jsonb_build_object(v_cle, (select jsonb_agg(v_payload -> v_cle -> v_perm[q] order by q) from generate_series(1, v_n) q));
  if p_type = 'ordre' then
    v_corrige := v_corrige || jsonb_build_object('ordre', (
      select coalesce(jsonb_agg(array_position(v_perm, (x)::int) - 1 order by o.pos), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(v_corrige -> 'ordre', (select jsonb_agg(k) from generate_series(0, v_n - 1) k))) with ordinality o(x, pos)));
  else
    v_corrige := v_corrige || jsonb_build_object('paires', (
      select coalesce(jsonb_agg(jsonb_build_array((pr -> 0)::int, array_position(v_perm, (pr -> 1)::int) - 1) order by (pr -> 0)::int), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_corrige -> 'paires', '[]'::jsonb)) pr));
  end if;
  return jsonb_build_object('payload', v_payload, 'corrige', v_corrige);
end;
$function$;

create or replace function public.academy_enregistrer_item(p_version_id uuid, p_item_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_id uuid; v_statut text; v_type text; v_mix jsonb;
begin
  select statut into v_statut from public.academy_module_versions where id = p_version_id;
  if v_statut is distinct from 'brouillon' then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  v_type := p_patch ->> 'type';
  if p_item_id is not null and v_type is null then select type into v_type from public.academy_items where id = p_item_id; end if;
  -- Ordre et association : melange a l enregistrement (payload et corrige ensemble).
  if v_type in ('ordre', 'association') and p_patch ? 'payload' then
    v_mix := public.academy_melanger_item(v_type, p_patch -> 'payload', coalesce(p_patch -> 'corrige', '{}'::jsonb));
    p_patch := p_patch || jsonb_build_object('payload', v_mix -> 'payload', 'corrige', v_mix -> 'corrige');
  end if;
  if p_item_id is null then
    if v_type is null or v_type not in ('choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte') then
      raise exception 'Type d exercice inconnu' using errcode = 'P0001';
    end if;
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (p_version_id, coalesce((p_patch ->> 'ordre')::int, (select coalesce(max(ordre), 0) + 1 from public.academy_items where version_id = p_version_id)),
            v_type, coalesce(p_patch ->> 'competence', ''), coalesce((p_patch ->> 'difficulte')::smallint, 2), coalesce(p_patch -> 'payload', '{}'::jsonb))
    returning id into v_id;
    insert into public.academy_items_corriges (item_id, corrige, explication)
    values (v_id, coalesce(p_patch -> 'corrige', '{}'::jsonb), coalesce(p_patch ->> 'explication', ''));
  else
    update public.academy_items set
      type = coalesce(v_type, type), competence = coalesce(p_patch ->> 'competence', competence),
      difficulte = coalesce((p_patch ->> 'difficulte')::smallint, difficulte),
      payload = coalesce(p_patch -> 'payload', payload), ordre = coalesce((p_patch ->> 'ordre')::int, ordre),
      archive_le = case when p_patch ? 'archive' then (case when (p_patch ->> 'archive')::boolean then now() else null end) else archive_le end,
      updated_at = now()
    where id = p_item_id and version_id = p_version_id;
    if not found then raise exception 'Exercice introuvable' using errcode = 'P0002'; end if;
    insert into public.academy_items_corriges (item_id, corrige, explication)
    values (p_item_id, coalesce(p_patch -> 'corrige', '{}'::jsonb), coalesce(p_patch ->> 'explication', ''))
    on conflict (item_id) do update set
      corrige = coalesce(p_patch -> 'corrige', public.academy_items_corriges.corrige),
      explication = coalesce(p_patch ->> 'explication', public.academy_items_corriges.explication),
      updated_at = now();
    v_id := p_item_id;
  end if;
  perform public.academy_journaliser('item', v_id::text, jsonb_build_object('version_id', p_version_id, 'type', coalesce(v_type, '')));
  return v_id;
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
    'memo_md', mv.memo_md, 'sources', mv.sources, 'a_completer', mv.a_completer, 'fictif', mv.fictif,
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

create or replace function public.academy_enregistrer_version(p_version_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  update public.academy_module_versions set
    titre = coalesce(p_patch ->> 'titre', titre), objectif = coalesce(p_patch ->> 'objectif', objectif),
    competence = coalesce(p_patch ->> 'competence', competence), duree_minutes = coalesce((p_patch ->> 'duree_minutes')::int, duree_minutes),
    prerequis = coalesce(p_patch -> 'prerequis', prerequis), seuil_reussite = coalesce((p_patch ->> 'seuil_reussite')::numeric, seuil_reussite),
    cas_pratique = coalesce(p_patch -> 'cas_pratique', cas_pratique), a_completer = coalesce(p_patch -> 'a_completer', a_completer),
    sources = coalesce(p_patch -> 'sources', sources), fictif = coalesce((p_patch ->> 'fictif')::boolean, fictif),
    memo_md = coalesce(p_patch ->> 'memo_md', memo_md), updated_at = now()
  where id = p_version_id and statut = 'brouillon';
  if not found then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_patch ? 'theme' or p_patch ? 'niveau' or p_patch ? 'ordre' then
    update public.academy_modules m set theme = coalesce(p_patch ->> 'theme', theme), niveau = coalesce(p_patch ->> 'niveau', niveau), ordre = coalesce((p_patch ->> 'ordre')::int, ordre), updated_at = now()
    where m.id = (select module_id from public.academy_module_versions where id = p_version_id);
  end if;
end;
$function$;

create or replace function public.academy_publier_version(p_version_id uuid, p_relu_par text, p_commentaire text default null, p_imposer_nouvelle_formation boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  v record; v_prm record; v_nb_items int; v_nb_sans_corrige int; v_ancienne uuid; v_nouvelles int := 0; a record;
begin
  select * into v from public.academy_module_versions where id = p_version_id for update;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  if v.statut <> 'brouillon' then raise exception 'Seul un brouillon se publie' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_relu_par), '') = '' then raise exception 'Le nom du relecteur est obligatoire' using errcode = 'P0001'; end if;
  select * into v_prm from public.academy_parametres where id = true;
  select count(*) into v_nb_items from public.academy_items where version_id = p_version_id and archive_le is null;
  select count(*) into v_nb_sans_corrige from public.academy_items i where i.version_id = p_version_id and i.archive_le is null
     and i.type <> 'carte' and not exists (select 1 from public.academy_items_corriges c where c.item_id = i.id and c.corrige <> '{}'::jsonb);
  if v_nb_items < coalesce(v_prm.questions_par_quiz, 12) then raise exception 'Il faut au moins % exercices pour une session de %', v_prm.questions_par_quiz, v_prm.questions_par_quiz using errcode = 'P0001'; end if;
  if v_nb_sans_corrige > 0 then raise exception '% exercice(s) sans corrige', v_nb_sans_corrige using errcode = 'P0001'; end if;
  -- Un corrige ambigu ne se publie pas : deux elements ou deux choix
  -- identiques rendraient une bonne reponse fausse une fois sur deux.
  if exists (
    select 1 from public.academy_items i where i.version_id = p_version_id and i.archive_le is null and (
      (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(i.payload -> 'choix', '[]'::jsonb)) x)
      or (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(i.payload -> 'elements', '[]'::jsonb)) x)
      or (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(i.payload -> 'droite', '[]'::jsonb)) x)
      or (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(i.payload -> 'gauche', '[]'::jsonb)) x))) then
    raise exception 'Un exercice porte deux choix ou deux elements identiques : corrigez le avant de publier' using errcode = 'P0001';
  end if;

  select id into v_ancienne from public.academy_module_versions where module_id = v.module_id and statut = 'publie' and id <> p_version_id;
  update public.academy_module_versions
     set statut = 'publie', publie_le = now(), publie_par = v_uid, relu_par = btrim(p_relu_par), relu_le = now(), commentaire_relecture = p_commentaire, updated_at = now()
   where id = p_version_id;
  if v_ancienne is not null then
    update public.academy_module_versions set statut = 'archive', archive_le = now(), updated_at = now() where id = v_ancienne;
    perform public.academy_evenement(null, 'version_archivee', v_ancienne, jsonb_build_object('remplacee_par', p_version_id));
    -- Les affectations non validees suivent la nouvelle version : personne ne
    -- reste affecte a un deck qu on ne peut plus jouer.
    update public.academy_affectations set version_id = p_version_id, updated_at = now()
     where version_id = v_ancienne and statut <> 'valide'
       and not exists (select 1 from public.academy_affectations b where b.profile_id = public.academy_affectations.profile_id and b.version_id = p_version_id);
    for a in select profile_id from public.academy_affectations where version_id = p_version_id loop
      perform public.academy_recalculer_statut(a.profile_id, p_version_id);
    end loop;
    if p_imposer_nouvelle_formation then
      for a in select distinct profile_id, obligatoire, parcours_id from public.academy_affectations where version_id = v_ancienne loop
        insert into public.academy_affectations (profile_id, module_id, version_id, parcours_id, obligatoire, echeance, affecte_par)
        values (a.profile_id, v.module_id, p_version_id, a.parcours_id, a.obligatoire, public.academy_aujourdhui() + 30, v_uid)
        on conflict (profile_id, version_id) do nothing;
        if found then
          v_nouvelles := v_nouvelles + 1;
          perform public.academy_evenement(a.profile_id, 'affectation_creee', p_version_id, jsonb_build_object('motif', 'nouvelle_version', 'ancienne_version', v_ancienne));
        end if;
      end loop;
    end if;
  end if;
  perform public.academy_evenement(null, 'version_publiee', p_version_id, jsonb_build_object('relu_par', btrim(p_relu_par), 'numero', v.numero));
  perform public.academy_journaliser('publier', p_version_id::text, jsonb_build_object('relu_par', btrim(p_relu_par), 'ancienne', v_ancienne, 'nouvelles_affectations', v_nouvelles));
  return jsonb_build_object('version_id', p_version_id, 'ancienne_version', v_ancienne, 'nouvelles_affectations', v_nouvelles);
end;
$function$;

create or replace function public.academy_admin_vue()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  return jsonb_build_object(
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'titre', m.titre, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre, 'archive_le', m.archive_le,
        'versions', (select jsonb_agg(jsonb_build_object('id', v.id, 'numero', v.numero, 'statut', v.statut, 'titre', v.titre, 'publie_le', v.publie_le, 'relu_par', v.relu_par, 'updated_at', v.updated_at,
                        'nb_items', (select count(*) from public.academy_items i where i.version_id = v.id and i.archive_le is null),
                        'memo', (v.memo_md <> ''),
                        'affectations', (select count(*) from public.academy_affectations a where a.version_id = v.id),
                        'validations', (select count(*) from public.academy_validations x where x.version_id = v.id)) order by v.numero desc)
                     from public.academy_module_versions v where v.module_id = m.id)
      ) order by m.ordre, m.slug) from public.academy_modules m), '[]'::jsonb),
    'parcours', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'titre', p.titre, 'description', p.description, 'ordre', p.ordre, 'archive_le', p.archive_le,
        'modules', (select jsonb_agg(jsonb_build_object('module_id', pm.module_id, 'ordre', pm.ordre, 'obligatoire', pm.obligatoire, 'delai_jours', pm.delai_jours, 'titre', m.titre, 'slug', m.slug) order by pm.ordre)
                    from public.academy_parcours_modules pm join public.academy_modules m on m.id = pm.module_id where pm.parcours_id = p.id)
      ) order by p.ordre) from public.academy_parcours p), '[]'::jsonb),
    'collaborateurs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'advisor_code', pr.advisor_code, 'role', pr.role) order by pr.full_name)
      from public.profiles pr where pr.is_active = true), '[]'::jsonb),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'profile_id', a.profile_id, 'nom', pr.full_name, 'module_id', a.module_id, 'version_id', a.version_id, 'titre', v.titre, 'slug', m.slug,
        'parcours_id', a.parcours_id, 'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'created_at', a.created_at,
        'couronnes', public.academy_couronnes(a.profile_id, a.version_id)) order by a.created_at desc)
      from public.academy_affectations a join public.profiles pr on pr.id = a.profile_id join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'survenu_le', j.survenu_le, 'nom', pr.full_name, 'action', j.action, 'cible', j.cible, 'detail', j.detail) order by j.survenu_le desc)
      from (select * from public.academy_journal_admin order by survenu_le desc limit 200) j left join public.profiles pr on pr.id = j.profile_id), '[]'::jsonb),
    'parametres', (select to_jsonb(p) - 'notice_donnees' from public.academy_parametres p where id = true)
  );
end;
$function$;

