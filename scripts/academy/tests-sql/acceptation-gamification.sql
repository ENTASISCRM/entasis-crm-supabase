-- Scenarios d acceptation de la gamification et des schemas (migration 8),
-- a jouer sur le projet de DEVELOPPEMENT apres les migrations 1 a 8 (8, 8b,
-- 8c). JAMAIS en production. Suppose acceptation-entrainement.sql vert.
--
-- Meme structure : un seul bloc DO, termine par une exception volontaire
-- (« TESTS OK ... »), rien ne reste en base ; un controle qui echoue leve
-- « ECHEC ... ». Identites simulees comme PostgREST (role authenticated +
-- request.jwt.claims). Profils DEV fictifs : camille, noe, martin borgis.
--
-- Ce qui est verifie : XP par reponse et combo (10, 10, 15 puis 0 sur une
-- erreur, carte sue = 5), reprise d une session ouverte avec xp_session et
-- combo, rejeu sans XP, bilan avec xp_detail coherent, niveau qui monte,
-- succes premiere_session, premiere_couronne, combo_6 puis session_parfaite
-- puis deck_valide, etait_du memorise, defis du jour identiques pour deux
-- profils et credites une seule fois (leur XP entre dans l XP des sessions),
-- classement anonyme (camille devant noe, aucun nom ni identifiant), cloche
-- defis_du_jour, schemas et figure rendus par demarrer, academy_module et
-- academy_version_admin, SVG de plus de 24 000 caracteres refuse, schemas
-- copies a la nouvelle version et figes a la publication, pilotage et fiche
-- avec niveau et nombre de succes.

do $tests$
declare
  c_camille uuid := '11111111-1111-1111-1111-111111111111';
  c_noe     uuid := '22222222-2222-2222-2222-222222222222';
  c_manager uuid := 'af124117-104e-4958-9283-e0864b6c8f17';
  v_mod jsonb; v_module uuid; v_version uuid; v_v2 uuid; v_json jsonb; v_json2 jsonb; v_res jsonb; v_res2 jsonb;
  v_ent uuid; v_jeton uuid := 'ad0dddd0-0000-4000-8000-000000000002'; v_nb int; v_erreur boolean; e jsonb; v_item uuid; v_type text; v_ordre jsonb; v_corr jsonb; v_pay jsonb;
  v_rep jsonb; v_bonne jsonb; v_rang int; v_combo int; v_xp_att int; v_xp_session int; v_faux uuid; v_troisieme uuid;
  v_xp_s1 int; v_xp_s2 int; v_xp_s3 int; v_xp_defis int := 0; v_xp_noe int; v_nom text; v_msg text; v_etat text;
  resume text := '';
begin
  -- ── 1. Manager : deck de douze items avec un schema et une figure ────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_mod := public.academy_creer_module('deck-test-gamification', 'Deck gamifie', 'methode', 'decouverte');
  v_module := (v_mod ->> 'module_id')::uuid; v_version := (v_mod ->> 'version_id')::uuid;
  -- Un SVG de plus de 24 000 caracteres est refuse (check_violation).
  v_etat := '';
  begin
    perform public.academy_enregistrer_version(v_version, jsonb_build_object('schemas', jsonb_build_array(jsonb_build_object('cle', 'gros', 'titre', 'Trop gros', 'svg', repeat('a', 24001), 'legende', ''))));
  exception when check_violation then v_etat := sqlstate; end;
  if v_etat <> '23514' then raise exception 'ECHEC : un schema de 24 001 caracteres a ete accepte'; end if;
  v_etat := '';
  begin perform public.academy_enregistrer_version(v_version, '{"schemas":{"cle":"x"}}'::jsonb); exception when check_violation then v_etat := sqlstate; end;
  if v_etat <> '23514' then raise exception 'ECHEC : des schemas qui ne forment pas une liste ont ete acceptes'; end if;
  perform public.academy_enregistrer_version(v_version, jsonb_build_object('memo_md', '## Memo' || E'\n\n' || 'Sept etapes. [schema:frise]',
    'schemas', jsonb_build_array(jsonb_build_object('cle', 'frise', 'titre', 'La frise des sept etapes', 'svg', '<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg"><title>La frise des sept etapes</title><rect width="640" height="360" fill="#fff"/></svg>', 'legende', 'Sept etapes, une heure.'))));
  perform public.academy_enregistrer_item(v_version, null, '{"type":"choix","competence":"Etapes","payload":{"enonce":"Sur le schema, combien d etapes ?","choix":["5","6","7","8"],"figure":{"ref":"frise"}},"corrige":{"index":2},"explication":"Sept etapes."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"choix","competence":"Durees","payload":{"enonce":"Duree totale ?","choix":["30 min","45 min","1 h","2 h"]},"corrige":{"index":2},"explication":"Une heure."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"vrai_faux","competence":"Etapes","payload":{"enonce":"L accueil dure 5 minutes."},"corrige":{"vrai":true},"explication":"Cinq minutes."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"vrai_faux","competence":"Documents","payload":{"enonce":"On ne recupere aucun document."},"corrige":{"vrai":false},"explication":"On en recupere un maximum."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"multi","competence":"Documents","payload":{"enonce":"Cochez les documents a recuperer.","choix":["Avis d imposition","Carte de fidelite","Bilan","Ticket de caisse"]},"corrige":{"indices":[0,2]},"explication":"Avis et bilan."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"multi","competence":"Patrimoine","payload":{"enonce":"Cochez le financier.","choix":["PER","SCPI","PEA","Residence"]},"corrige":{"indices":[0,2]},"explication":"PER et PEA."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"ordre","competence":"Etapes","payload":{"enonce":"Remettez dans l ordre.","elements":["Accueil","Situation","Patrimoine","Objectifs"]},"corrige":{"ordre":[0,1,2,3]},"explication":"Accueil puis situation."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"association","competence":"Durees","payload":{"enonce":"Associez.","gauche":["Accueil","Patrimoine","Objectifs"],"droite":["5 min","15 min","10 min"]},"corrige":{"paires":[[0,0],[1,1],[2,2]]},"explication":"Durees de la trame."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"trou_choix","competence":"Documents","payload":{"phrase":"Dernier avis d ___ du foyer complet.","choix":["imposition","achat","location","assurance"]},"corrige":{"index":0},"explication":"Avis d imposition."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"trou_choix","competence":"Patrimoine","payload":{"phrase":"Contrats Madelin ou ___ bis.","choix":["154","83","62","39"]},"corrige":{"index":0},"explication":"154 bis."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"trou_saisie","competence":"Durees","payload":{"phrase":"La trame dure ___ heure.","aide":"un chiffre"},"corrige":{"reponses":["1","une"]},"explication":"Une heure."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"carte","competence":"Etapes","payload":{"recto":"Etape 7 ?","verso":"Documents a recuperer (5 min)"},"corrige":{},"explication":"Derniere etape."}'::jsonb);
  v_json := public.academy_version_admin(v_version);
  if jsonb_array_length(v_json -> 'schemas') <> 1 or (v_json -> 'schemas' -> 0 ->> 'cle') <> 'frise' then raise exception 'ECHEC : schemas absents de academy_version_admin (%)', v_json -> 'schemas'; end if;
  v_json := public.academy_publier_version(v_version, 'Relecteur de test', null, false);
  v_nb := public.academy_affecter(array[c_camille, c_noe], v_module, null, public.academy_aujourdhui() + 7, true);
  if v_nb <> 2 then raise exception 'ECHEC affectation : %', v_nb; end if;
  resume := resume || '1 deck avec schema, SVG trop long refuse, publie et affecte OK; ';

  -- ── 2. Camille : le deck et la cloche avant toute session ────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);
  v_json := public.academy_module('deck-test-gamification');
  if jsonb_array_length(v_json -> 'schemas') <> 1 or (v_json -> 'schemas' -> 0 ->> 'titre') not like 'La frise%' then raise exception 'ECHEC : schemas absents de academy_module'; end if;
  v_json := public.academy_mes_rappels();
  if not exists (select 1 from jsonb_array_elements(v_json) r where r ->> 'type' = 'defis_du_jour' and (r ->> 'nombre')::int = 3) then raise exception 'ECHEC : pas de rappel defis_du_jour avant la premiere session (%)', v_json; end if;
  v_json := public.academy_mon_parcours();
  if jsonb_array_length(v_json -> 'defis') <> 3 or (v_json -> 'niveau' ->> 'niveau')::int <> 1 or (v_json -> 'niveau' ->> 'titre') <> 'Débutant' then raise exception 'ECHEC parcours initial : % / %', v_json -> 'defis', v_json -> 'niveau'; end if;
  if (v_json -> 'succes' ->> 'obtenus')::int <> 0 or (v_json -> 'succes' ->> 'total')::int <> 21 then raise exception 'ECHEC succes initiaux : %', v_json -> 'succes'; end if;
  -- Les defis sont les memes pour tout le monde : noe voit les trois memes codes.
  perform set_config('request.jwt.claims', json_build_object('sub', c_noe, 'role', 'authenticated')::text, true);
  v_json2 := public.academy_mon_parcours();
  if (select jsonb_agg(d ->> 'code') from jsonb_array_elements(v_json -> 'defis') d) <> (select jsonb_agg(d ->> 'code') from jsonb_array_elements(v_json2 -> 'defis') d) then raise exception 'ECHEC : defis differents entre camille et noe'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);
  resume := resume || '2 deck avec schemas, cloche, parcours initial, defis identiques OK; ';

  -- ── 3. Session 1 : 3 bonnes, reprise, une erreur, rejeu, bilan ───────────
  v_json := public.academy_demarrer_entrainement(v_version, v_jeton);
  v_ent := (v_json ->> 'entrainement_id')::uuid;
  if jsonb_array_length(v_json -> 'schemas') <> 1 then raise exception 'ECHEC : schemas absents de demarrer'; end if;
  if not exists (select 1 from jsonb_array_elements(v_json -> 'items') i where i -> 'payload' -> 'figure' ->> 'ref' = 'frise') then raise exception 'ECHEC : figure absente des items presentes'; end if;
  if (v_json ->> 'xp_session')::int <> 0 or (v_json ->> 'combo')::int <> 0 then raise exception 'ECHEC : compteur de depart non nul'; end if;
  v_rang := 0; v_combo := 0; v_xp_att := 0;
  for e in select * from jsonb_array_elements(v_json -> 'items') loop
    v_rang := v_rang + 1; v_item := (e ->> 'item_id')::uuid; v_type := e ->> 'type';
    execute 'reset role';
    select x.elem -> 'ordre' into v_ordre from public.academy_entrainements en, jsonb_array_elements(en.items) x(elem) where en.id = v_ent and (x.elem ->> 'item_id')::uuid = v_item;
    select c.corrige, i.payload into v_corr, v_pay from public.academy_items i join public.academy_items_corriges c on c.item_id = i.id where i.id = v_item;
    v_bonne := public.academy_verifier_reponse(v_type, v_pay, v_ordre, v_corr, 'null'::jsonb) -> 'bonne_reponse';
    if v_type = 'trou_saisie' then v_rep := to_jsonb((v_corr -> 'reponses' ->> 0)::text);
    elsif v_type = 'carte' then v_rep := '{"su":true}'::jsonb;
    else v_rep := v_bonne; end if;
    -- Le quatrieme exercice est rate volontairement, quel que soit son type.
    if v_rang = 4 then
      v_faux := v_item;
      v_rep := case v_type when 'choix' then to_jsonb(((v_bonne #>> '{}')::int + 1) % jsonb_array_length(v_pay -> 'choix'))
                           when 'trou_choix' then to_jsonb(((v_bonne #>> '{}')::int + 1) % jsonb_array_length(v_pay -> 'choix'))
                           when 'vrai_faux' then to_jsonb(not (v_bonne #>> '{}')::boolean)
                           when 'trou_saisie' then '"zzz"'::jsonb
                           when 'carte' then '{"su":false}'::jsonb
                           else '[]'::jsonb end;
    end if;
    execute 'set local role authenticated';
    v_res := public.academy_repondre(v_ent, v_item, v_rep);
    if v_rang = 4 then
      v_combo := 0;
      if (v_res ->> 'correcte')::boolean or (v_res ->> 'xp_gagne')::int <> 0 or (v_res ->> 'combo')::int <> 0 or (v_res ->> 'xp_session')::int <> v_xp_att then raise exception 'ECHEC erreur : %', v_res; end if;
    else
      v_combo := v_combo + 1;
      v_xp_att := v_xp_att + (case when v_type = 'carte' then 5 else 10 end) + (case when v_combo >= 3 then 5 else 0 end);
      if not (v_res ->> 'correcte')::boolean then raise exception 'ECHEC : bonne reponse refusee (%)', v_type; end if;
      if (v_res ->> 'xp_gagne')::int <> (case when v_type = 'carte' then 5 else 10 end) + (case when v_combo >= 3 then 5 else 0 end) then raise exception 'ECHEC xp_gagne rang % : %', v_rang, v_res; end if;
      if (v_res ->> 'combo')::int <> v_combo or (v_res ->> 'xp_session')::int <> v_xp_att then raise exception 'ECHEC combo ou xp_session rang % : %', v_rang, v_res; end if;
    end if;
    if v_rang = 3 then
      v_troisieme := v_item;
      if (v_res ->> 'combo_max')::int <> 3 then raise exception 'ECHEC combo_max : %', v_res; end if;
      -- Reprise de la session ouverte : le compteur reprend sa valeur.
      v_json2 := public.academy_demarrer_entrainement(v_version, v_jeton);
      if (v_json2 ->> 'entrainement_id')::uuid <> v_ent or (v_json2 ->> 'xp_session')::int <> v_xp_att or (v_json2 ->> 'combo')::int <> 3 then raise exception 'ECHEC reprise : % / %', v_json2 ->> 'xp_session', v_json2 ->> 'combo'; end if;
    end if;
  end loop;
  if (v_res ->> 'combo_max')::int <> 8 or (v_res ->> 'combo')::int <> 8 then raise exception 'ECHEC combo final : %', v_res; end if;
  -- Rejeu : les valeurs memorisees, rien de recalcule.
  v_res2 := public.academy_repondre(v_ent, v_faux, '0'::jsonb);
  if not (v_res2 ->> 'deja')::boolean or (v_res2 ->> 'xp_gagne')::int <> 0 or (v_res2 ->> 'xp_session')::int <> v_xp_att then raise exception 'ECHEC rejeu erreur : %', v_res2; end if;
  v_res2 := public.academy_repondre(v_ent, v_troisieme, '0'::jsonb);
  if not (v_res2 ->> 'deja')::boolean or (v_res2 ->> 'combo')::int <> 3 or (v_res2 ->> 'xp_gagne')::int < 10 or (v_res2 ->> 'xp_session')::int <> v_xp_att then raise exception 'ECHEC rejeu : %', v_res2; end if;
  v_res := public.academy_terminer_entrainement(v_ent);
  v_xp_s1 := (v_res ->> 'xp')::int;
  if (v_res ->> 'nb_bons')::int <> 11 then raise exception 'ECHEC bilan : %', v_res ->> 'nb_bons'; end if;
  if (v_res -> 'xp_detail' ->> 'combo')::int <> 35 or (v_res -> 'xp_detail' ->> 'parfaite')::int <> 0 or (v_res -> 'xp_detail' ->> 'premiere_du_jour')::int <> 10
     or (v_res -> 'xp_detail' ->> 'reponses')::int + (v_res -> 'xp_detail' ->> 'combo')::int <> v_xp_att
     or (v_res -> 'xp_detail' ->> 'total')::int <> v_xp_att + 10 + (v_res -> 'xp_detail' ->> 'defis')::int or (v_res -> 'xp_detail' ->> 'total')::int <> v_xp_s1 then
    raise exception 'ECHEC xp_detail : % (attendu reponses + combo = %)', v_res -> 'xp_detail', v_xp_att;
  end if;
  v_xp_defis := v_xp_defis + (v_res -> 'xp_detail' ->> 'defis')::int;
  if (v_res ->> 'combo_max')::int <> 8 then raise exception 'ECHEC combo_max du bilan : %', v_res ->> 'combo_max'; end if;
  if (v_res -> 'niveau_avant' ->> 'niveau')::int <> 1 or (v_res -> 'niveau_avant' ->> 'xp_total')::int <> 0 or (v_res -> 'niveau_apres' ->> 'niveau')::int <> 2 or (v_res -> 'niveau_apres' ->> 'xp_total')::int <> v_xp_s1 then
    raise exception 'ECHEC niveau : % -> %', v_res -> 'niveau_avant', v_res -> 'niveau_apres';
  end if;
  if not (v_res -> 'succes_debloques' @> '[{"code":"premiere_session"},{"code":"premiere_couronne"},{"code":"combo_6"}]'::jsonb) or v_res -> 'succes_debloques' @> '[{"code":"session_parfaite"}]'::jsonb then
    raise exception 'ECHEC succes session 1 : %', v_res -> 'succes_debloques';
  end if;
  if (v_res -> 'succes_debloques' -> 0 ->> 'titre') is null or (v_res -> 'succes_debloques' -> 0 ->> 'icone') is null then raise exception 'ECHEC forme des succes : %', v_res -> 'succes_debloques'; end if;
  if jsonb_array_length(v_res -> 'defis') <> 3 or not (v_res -> 'defis' -> 0 ? 'fait_par_cette_session') or not (v_res -> 'defis' -> 0 ? 'progression') then raise exception 'ECHEC defis du bilan : %', v_res -> 'defis'; end if;
  if (v_res -> 'classement' ->> 'rang')::int <> 1 or (v_res -> 'classement' ->> 'xp_moi')::int <> v_xp_s1 or (v_res -> 'classement' ->> 'participants')::int < 2 then raise exception 'ECHEC classement du bilan : %', v_res -> 'classement'; end if;
  resume := resume || '3 session 1 : 10, 10, 15 puis 0, reprise, rejeu, bilan, niveau 1 -> 2, trois succes OK; ';

  -- ── 4. Session 2 parfaite sur des exercices dus : etait_du, combo 12 ─────
  execute 'reset role';
  update public.academy_forces set prochaine_le = now() - interval '1 hour' where profile_id = c_camille;
  execute 'set local role authenticated';
  v_json := public.academy_demarrer_entrainement(v_version, gen_random_uuid());
  v_ent := (v_json ->> 'entrainement_id')::uuid;
  for e in select * from jsonb_array_elements(v_json -> 'items') loop
    v_item := (e ->> 'item_id')::uuid; v_type := e ->> 'type';
    execute 'reset role';
    select x.elem -> 'ordre' into v_ordre from public.academy_entrainements en, jsonb_array_elements(en.items) x(elem) where en.id = v_ent and (x.elem ->> 'item_id')::uuid = v_item;
    select c.corrige, i.payload into v_corr, v_pay from public.academy_items i join public.academy_items_corriges c on c.item_id = i.id where i.id = v_item;
    v_bonne := public.academy_verifier_reponse(v_type, v_pay, v_ordre, v_corr, 'null'::jsonb) -> 'bonne_reponse';
    if v_type = 'trou_saisie' then v_rep := to_jsonb((v_corr -> 'reponses' ->> 1)::text);
    elsif v_type = 'carte' then v_rep := '{"su":true}'::jsonb;
    else v_rep := v_bonne; end if;
    execute 'set local role authenticated';
    v_res := public.academy_repondre(v_ent, v_item, v_rep);
    if not (v_res ->> 'correcte')::boolean then raise exception 'ECHEC session 2 : bonne reponse refusee (%)', v_type; end if;
  end loop;
  execute 'reset role';
  select count(*) into v_nb from public.academy_entrainement_reponses where entrainement_id = v_ent and etait_du and correcte;
  if v_nb <> 12 then raise exception 'ECHEC etait_du : % reponses dues', v_nb; end if;
  execute 'set local role authenticated';
  v_res := public.academy_terminer_entrainement(v_ent);
  v_xp_s2 := (v_res ->> 'xp')::int;
  if (v_res -> 'xp_detail' ->> 'parfaite')::int <> 20 or (v_res -> 'xp_detail' ->> 'premiere_du_jour')::int <> 0 or (v_res -> 'xp_detail' ->> 'combo')::int <> 50 or (v_res ->> 'combo_max')::int <> 12 then raise exception 'ECHEC bilan parfait : %', v_res -> 'xp_detail'; end if;
  v_xp_defis := v_xp_defis + (v_res -> 'xp_detail' ->> 'defis')::int;
  if not (v_res -> 'succes_debloques' @> '[{"code":"session_parfaite"}]'::jsonb) or v_res -> 'succes_debloques' @> '[{"code":"premiere_session"}]'::jsonb then raise exception 'ECHEC succes session 2 : %', v_res -> 'succes_debloques'; end if;
  if (v_res -> 'niveau_apres' ->> 'niveau')::int <= (v_res -> 'niveau_avant' ->> 'niveau')::int or (v_res -> 'niveau_apres' ->> 'xp_total')::int <> v_xp_s1 + v_xp_s2 then raise exception 'ECHEC niveau session 2 : % -> %', v_res -> 'niveau_avant', v_res -> 'niveau_apres'; end if;
  resume := resume || '4 session parfaite : etait_du, combo 12, +20, sans faute, niveau monte OK; ';

  -- ── 5. Session 3 : deck valide, defis credites une seule fois ────────────
  v_json := public.academy_demarrer_entrainement(v_version, gen_random_uuid());
  v_ent := (v_json ->> 'entrainement_id')::uuid;
  for e in select * from jsonb_array_elements(v_json -> 'items') loop
    v_item := (e ->> 'item_id')::uuid; v_type := e ->> 'type';
    execute 'reset role';
    select x.elem -> 'ordre' into v_ordre from public.academy_entrainements en, jsonb_array_elements(en.items) x(elem) where en.id = v_ent and (x.elem ->> 'item_id')::uuid = v_item;
    select c.corrige, i.payload into v_corr, v_pay from public.academy_items i join public.academy_items_corriges c on c.item_id = i.id where i.id = v_item;
    v_bonne := public.academy_verifier_reponse(v_type, v_pay, v_ordre, v_corr, 'null'::jsonb) -> 'bonne_reponse';
    if v_type = 'trou_saisie' then v_rep := to_jsonb((v_corr -> 'reponses' ->> 0)::text);
    elsif v_type = 'carte' then v_rep := '{"su":true}'::jsonb;
    else v_rep := v_bonne; end if;
    execute 'set local role authenticated';
    v_res := public.academy_repondre(v_ent, v_item, v_rep);
  end loop;
  v_res := public.academy_terminer_entrainement(v_ent);
  v_xp_s3 := (v_res ->> 'xp')::int;
  v_xp_defis := v_xp_defis + (v_res -> 'xp_detail' ->> 'defis')::int;
  if (v_res ->> 'couronnes_apres')::int <> 3 or not (v_res -> 'succes_debloques' @> '[{"code":"deck_valide"}]'::jsonb) then raise exception 'ECHEC deck valide : % / %', v_res ->> 'couronnes_apres', v_res -> 'succes_debloques'; end if;
  -- Un defi n est credite qu une fois et son XP est dans l XP des sessions.
  v_json := public.academy_mon_parcours();
  execute 'reset role';
  select count(*), coalesce(sum(xp), 0) into v_nb, v_xp_session from public.academy_defis_faits where profile_id = c_camille and jour = public.academy_aujourdhui();
  if v_nb <> (select count(*) from jsonb_array_elements(v_json -> 'defis') d where (d ->> 'fait')::boolean) then raise exception 'ECHEC : % defis credites pour % faits', v_nb, v_json -> 'defis'; end if;
  if v_nb < 1 then raise exception 'ECHEC : aucun defi credite apres trois sessions (%)', v_json -> 'defis'; end if;
  if v_xp_session <> v_xp_defis then raise exception 'ECHEC : XP des defis % en table, % dans les bilans', v_xp_session, v_xp_defis; end if;
  if (select sum(xp) from public.academy_entrainements where profile_id = c_camille) <> v_xp_s1 + v_xp_s2 + v_xp_s3 then raise exception 'ECHEC : somme des XP des sessions'; end if;
  -- Un conseiller ne peut pas ecrire ses defis ni ses succes en direct.
  execute 'set local role authenticated';
  v_erreur := false;
  begin insert into public.academy_defis_faits (profile_id, jour, code, xp) values (c_camille, public.academy_aujourdhui(), 'sessions_2', 999); exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un conseiller ecrit academy_defis_faits'; end if;
  v_erreur := false;
  begin insert into public.academy_succes_obtenus (profile_id, code) values (c_camille, 'niveau_10'); exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un conseiller ecrit academy_succes_obtenus'; end if;
  if (select count(*) from public.academy_succes) <> 21 then raise exception 'ECHEC : le catalogue des succes ne se lit pas'; end if;
  -- Lectures : succes, parcours, resultats, rappels.
  v_json2 := public.academy_mes_succes();
  if jsonb_array_length(v_json2) <> 21 or (select count(*) from jsonb_array_elements(v_json2) s where s ->> 'obtenu_le' is not null and s ->> 'code' in ('premiere_session', 'session_parfaite', 'combo_6', 'premiere_couronne', 'deck_valide')) <> 5
     or (select s ->> 'obtenu_le' from jsonb_array_elements(v_json2) s where s ->> 'code' = 'serie_7') is not null then raise exception 'ECHEC mes succes : %', v_json2; end if;
  if (v_json -> 'succes' ->> 'obtenus')::int < 5 or jsonb_array_length(v_json -> 'succes' -> 'recents') <> 3 or (v_json -> 'niveau' ->> 'niveau')::int < 3 then raise exception 'ECHEC parcours apres trois sessions : % / %', v_json -> 'succes', v_json -> 'niveau'; end if;
  v_json2 := public.academy_mes_resultats();
  if (v_json2 -> 'niveau' ->> 'xp_total')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 or jsonb_array_length(v_json2 -> 'succes') <> 21 then raise exception 'ECHEC mes resultats : %', v_json2 -> 'niveau'; end if;
  v_json2 := public.academy_mes_rappels();
  if exists (select 1 from jsonb_array_elements(v_json2) r where r ->> 'type' = 'defis_du_jour') then raise exception 'ECHEC : rappel defis_du_jour apres une session terminee'; end if;
  resume := resume || '5 deck valide, defis credites une fois, ecritures directes refusees, succes, resultats, cloche OK; ';

  -- ── 6. Noe : une session, classement anonyme ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_noe, 'role', 'authenticated')::text, true);
  v_json := public.academy_classement_semaine();
  if (v_json ->> 'rang')::int <> 2 or (v_json ->> 'xp_moi')::int <> 0 or (v_json ->> 'xp_devant')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 or (v_json ->> 'xp_premier')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 then raise exception 'ECHEC classement de noe avant session : %', v_json; end if;
  v_json := public.academy_demarrer_entrainement(v_version, gen_random_uuid());
  v_ent := (v_json ->> 'entrainement_id')::uuid;
  v_rang := 0;
  for e in select * from jsonb_array_elements(v_json -> 'items') loop
    v_rang := v_rang + 1; v_item := (e ->> 'item_id')::uuid; v_type := e ->> 'type';
    execute 'reset role';
    select x.elem -> 'ordre' into v_ordre from public.academy_entrainements en, jsonb_array_elements(en.items) x(elem) where en.id = v_ent and (x.elem ->> 'item_id')::uuid = v_item;
    select c.corrige, i.payload into v_corr, v_pay from public.academy_items i join public.academy_items_corriges c on c.item_id = i.id where i.id = v_item;
    v_bonne := public.academy_verifier_reponse(v_type, v_pay, v_ordre, v_corr, 'null'::jsonb) -> 'bonne_reponse';
    -- Noe rate un exercice sur deux : moins d XP que camille.
    if v_rang % 2 = 0 then v_rep := case v_type when 'vrai_faux' then to_jsonb(not (v_bonne #>> '{}')::boolean) when 'carte' then '{"su":false}'::jsonb when 'trou_saisie' then '"zzz"'::jsonb when 'choix' then '99'::jsonb when 'trou_choix' then '99'::jsonb else '[]'::jsonb end;
    elsif v_type = 'trou_saisie' then v_rep := to_jsonb((v_corr -> 'reponses' ->> 0)::text);
    elsif v_type = 'carte' then v_rep := '{"su":true}'::jsonb;
    else v_rep := v_bonne; end if;
    execute 'set local role authenticated';
    v_res := public.academy_repondre(v_ent, v_item, v_rep);
    if (v_rang % 2 = 0) = (v_res ->> 'correcte')::boolean then raise exception 'ECHEC noe rang % : %', v_rang, v_res; end if;
  end loop;
  v_res := public.academy_terminer_entrainement(v_ent);
  v_xp_noe := (v_res ->> 'xp')::int;
  if (v_res ->> 'combo_max')::int <> 1 or (v_res -> 'xp_detail' ->> 'combo')::int <> 0 or v_xp_noe >= v_xp_s1 + v_xp_s2 + v_xp_s3 then raise exception 'ECHEC bilan de noe : %', v_res; end if;
  v_json := v_res -> 'classement';
  if (v_json ->> 'rang')::int <> 2 or (v_json ->> 'participants')::int < 2 or (v_json ->> 'xp_moi')::int <> v_xp_noe
     or (v_json ->> 'xp_devant')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 or (v_json ->> 'ecart_premier')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 - v_xp_noe then
    raise exception 'ECHEC classement de noe : %', v_json;
  end if;
  execute 'reset role';
  select full_name into v_nom from public.profiles where id = c_camille;
  execute 'set local role authenticated';
  if v_json::text ilike '%' || c_camille::text || '%' or v_json::text ilike '%' || v_nom || '%' or v_json::text ilike '%nom%' or v_json::text ilike '%profile%' then raise exception 'ECHEC : le classement expose autrui (%)', v_json; end if;
  if (v_json - 'semaine' - 'rang' - 'participants' - 'xp_moi' - 'xp_premier' - 'xp_devant' - 'ecart_premier') <> '{}'::jsonb then raise exception 'ECHEC : cle inattendue dans le classement (%)', v_json; end if;
  -- Camille, premiere de la semaine.
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);
  v_json := public.academy_classement_semaine();
  if (v_json ->> 'rang')::int <> 1 or (v_json -> 'xp_devant') <> 'null'::jsonb or (v_json ->> 'ecart_premier')::int <> 0 or (v_json ->> 'semaine')::date <> date_trunc('week', now() at time zone 'Europe/Paris')::date then raise exception 'ECHEC classement de camille : %', v_json; end if;
  -- Noe ne voit pas les succes ni les defis de camille en direct, la direction si.
  perform set_config('request.jwt.claims', json_build_object('sub', c_noe, 'role', 'authenticated')::text, true);
  if (select count(*) from public.academy_succes_obtenus where profile_id = c_camille) <> 0 or (select count(*) from public.academy_defis_faits where profile_id = c_camille) <> 0 then raise exception 'ECHEC : noe lit les succes ou les defis de camille'; end if;
  resume := resume || '6 classement anonyme : camille 1, noe 2, xp_devant, aucun nom OK; ';

  -- ── 7. Manager : pilotage, fiche, nouvelle version, schemas figes ────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  if (select count(*) from public.academy_succes_obtenus where profile_id = c_camille) < 5 then raise exception 'ECHEC : la direction ne lit pas les succes'; end if;
  v_json := public.academy_pilotage(null, null);
  if (select (l -> 'niveau' ->> 'niveau')::int from jsonb_array_elements(v_json -> 'lignes') l where (l ->> 'profile_id')::uuid = c_camille) < 3
     or (select (l ->> 'nb_succes')::int from jsonb_array_elements(v_json -> 'lignes') l where (l ->> 'profile_id')::uuid = c_camille) < 5 then raise exception 'ECHEC pilotage niveau ou succes'; end if;
  v_json := public.academy_fiche(c_camille);
  if (v_json -> 'niveau' ->> 'xp_total')::int <> v_xp_s1 + v_xp_s2 + v_xp_s3 or (v_json ->> 'nb_succes')::int < 5 then raise exception 'ECHEC fiche : % / %', v_json -> 'niveau', v_json ->> 'nb_succes'; end if;
  v_v2 := public.academy_nouvelle_version(v_module);
  v_json := public.academy_version_admin(v_v2);
  if jsonb_array_length(v_json -> 'schemas') <> 1 or (v_json -> 'schemas' -> 0 ->> 'cle') <> 'frise' then raise exception 'ECHEC : schemas non copies a la nouvelle version'; end if;
  if not exists (select 1 from jsonb_array_elements(v_json -> 'items') i where i -> 'payload' -> 'figure' ->> 'ref' = 'frise') then raise exception 'ECHEC : figure non copiee'; end if;
  perform public.academy_enregistrer_version(v_v2, '{"schemas":[]}'::jsonb);
  if jsonb_array_length(public.academy_version_admin(v_v2) -> 'schemas') <> 0 then raise exception 'ECHEC : schemas du brouillon non modifies'; end if;
  execute 'reset role';
  v_erreur := false;
  begin update public.academy_module_versions set schemas = '[]'::jsonb where id = v_version; exception when check_violation then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : schemas d une version publiee modifies'; end if;
  resume := resume || '7 pilotage et fiche avec niveau et succes, schemas copies puis figes OK; ';

  execute 'reset role';
  raise exception 'TESTS OK (transaction annulee volontairement) : %', resume;
end
$tests$;
