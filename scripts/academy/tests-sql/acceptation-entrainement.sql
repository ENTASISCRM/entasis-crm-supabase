-- Scenarios d acceptation du mode entrainement (migration 6), a jouer sur le
-- projet de DEVELOPPEMENT apres les migrations 1 a 6. JAMAIS en production.
--
-- Un seul bloc DO, termine par une exception volontaire : rien ne reste en
-- base, le message porte le resume. Un controle qui echoue leve « ECHEC ... ».
-- Identites simulees comme PostgREST (role authenticated + request.jwt.claims).
-- Profils DEV fictifs : camille, noe (advisor), martin borgis (manager).

do $tests$
declare
  c_camille uuid := '11111111-1111-1111-1111-111111111111';
  c_noe     uuid := '22222222-2222-2222-2222-222222222222';
  c_manager uuid := 'af124117-104e-4958-9283-e0864b6c8f17';
  v_mod jsonb; v_module uuid; v_version uuid; v_v2 uuid; v_json jsonb; v_json2 jsonb; v_res jsonb; v_res2 jsonb;
  v_ent uuid; v_nb int; v_erreur boolean; e jsonb; v_item uuid; v_type text; v_ordre jsonb; v_corr jsonb; v_pay jsonb;
  v_rep jsonb; v_bonne jsonb; v_premier_choix uuid; v_force int; v_carte int := 0; v_bons int; v_xp_attendu int;
  resume text := '';
  -- verification unitaire
  v_u jsonb;
begin
  -- ── 0. academy_verifier_reponse, type par type (droits postgres) ────────
  v_u := public.academy_verifier_reponse('choix', '{"choix":["a","b","c","d"]}', '[2,0,1,3]', '{"index":0}', '1');
  if not (v_u ->> 'correcte')::boolean or (v_u ->> 'bonne_reponse')::int <> 1 then raise exception 'ECHEC verif choix : %', v_u; end if;
  v_u := public.academy_verifier_reponse('choix', '{"choix":["a","b","c","d"]}', '[2,0,1,3]', '{"index":0}', '0');
  if (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif choix faux accepte'; end if;
  v_u := public.academy_verifier_reponse('vrai_faux', '{}', '[0]', '{"vrai":false}', 'false');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif vrai_faux'; end if;
  v_u := public.academy_verifier_reponse('multi', '{"choix":["a","b","c","d"]}', '[3,1,0,2]', '{"indices":[0,2]}', '[2,3]');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif multi : %', v_u; end if;
  v_u := public.academy_verifier_reponse('multi', '{"choix":["a","b","c","d"]}', '[3,1,0,2]', '{"indices":[0,2]}', '[2]');
  if (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif multi partiel accepte'; end if;
  v_u := public.academy_verifier_reponse('ordre', '{"elements":["e0","e1","e2","e3"]}', '[2,0,3,1]', '{"ordre":[0,1,2,3]}', '[1,3,0,2]');
  if not (v_u ->> 'correcte')::boolean or (v_u -> 'bonne_reponse')::text <> '[1, 3, 0, 2]' then raise exception 'ECHEC verif ordre : %', v_u; end if;
  v_u := public.academy_verifier_reponse('association', '{"gauche":["g0","g1","g2"],"droite":["d0","d1","d2"]}', '[2,0,1]', '{"paires":[[0,0],[1,1],[2,2]]}', '[[0,1],[1,2],[2,0]]');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif association : %', v_u; end if;
  v_u := public.academy_verifier_reponse('trou_saisie', '{"phrase":"contrats Madelin ou ___ bis"}', '[0]', '{"reponses":["154"]}', '" 154 "');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif trou_saisie'; end if;
  v_u := public.academy_verifier_reponse('trou_saisie', '{}', '[0]', '{"reponses":["résidence principale"]}', '"Residence  Principale."');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif normalisation'; end if;
  v_u := public.academy_verifier_reponse('carte', '{}', '[0]', '{}', '{"su":true}');
  if not (v_u ->> 'correcte')::boolean then raise exception 'ECHEC verif carte'; end if;
  resume := resume || '0 verification par type OK; ';

  -- ── 1. Manager : un deck de douze items, publie, affecte ────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_mod := public.academy_creer_module('deck-test-entrainement', 'Deck de test', 'methode', 'decouverte');
  v_module := (v_mod ->> 'module_id')::uuid; v_version := (v_mod ->> 'version_id')::uuid;
  perform public.academy_enregistrer_version(v_version, '{"memo_md":"## Memo\n\nSept etapes, une heure."}'::jsonb);
  perform public.academy_enregistrer_item(v_version, null, '{"type":"choix","competence":"Etapes","payload":{"enonce":"Combien d etapes ?","choix":["5","6","7","8"]},"corrige":{"index":2},"explication":"Sept etapes."}'::jsonb);
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
  select count(*) into v_nb from public.academy_items where version_id = v_version;
  if v_nb <> 12 then raise exception 'ECHEC : % items crees', v_nb; end if;
  v_json := public.academy_publier_version(v_version, 'Relecteur de test', null, false);
  if (select statut from public.academy_module_versions where id = v_version) <> 'publie' then raise exception 'ECHEC publication'; end if;
  v_nb := public.academy_affecter(array[c_camille, c_noe], v_module, null, public.academy_aujourdhui() + 7, true);
  if v_nb <> 2 then raise exception 'ECHEC affectation : %', v_nb; end if;
  resume := resume || '1 deck de 12 items publie et affecte OK; ';

  -- ── 2. Camille : ce qu elle ne voit pas ─────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);
  v_erreur := false;
  begin perform 1 from public.academy_items_corriges limit 1; exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit academy_items_corriges'; end if;
  v_erreur := false;
  begin insert into public.academy_forces (profile_id, item_id, force) select c_camille, id, 5 from public.academy_items where version_id = v_version limit 1; exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un conseiller ecrit ses forces'; end if;
  v_erreur := false;
  begin insert into public.academy_entrainements (profile_id, version_id, jeton_client) values (c_camille, v_version, gen_random_uuid()); exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un conseiller cree une session en direct'; end if;
  select count(*) into v_nb from public.academy_items where version_id = v_version;
  if v_nb <> 12 then raise exception 'ECHEC : camille ne lit pas les items publies (%)', v_nb; end if;
  resume := resume || '2 corriges, forces et sessions inaccessibles en direct OK; ';

  -- ── 3. Session 1 : tirage, idempotence, reponses (une fausse), fin ──────
  v_json := public.academy_demarrer_entrainement(v_version, '0dddddd0-0000-4000-8000-000000000001');
  if jsonb_array_length(v_json -> 'items') <> 12 then raise exception 'ECHEC tirage : % items', jsonb_array_length(v_json -> 'items'); end if;
  if v_json::text ilike '%corrige%' or v_json::text ilike '%"index"%' or v_json::text ilike '%paires%' then raise exception 'ECHEC : le tirage expose un corrige'; end if;
  v_json2 := public.academy_demarrer_entrainement(v_version, '0dddddd0-0000-4000-8000-000000000001');
  if (v_json ->> 'entrainement_id') <> (v_json2 ->> 'entrainement_id') then raise exception 'ECHEC : meme jeton, deux sessions'; end if;
  v_json2 := public.academy_demarrer_entrainement(v_version, gen_random_uuid());
  if (v_json ->> 'entrainement_id') <> (v_json2 ->> 'entrainement_id') then raise exception 'ECHEC : une session ouverte a ete doublee'; end if;
  v_ent := (v_json ->> 'entrainement_id')::uuid;

  -- Reponses calculees avec les droits postgres, envoyees en tant que camille.
  for e in select * from jsonb_array_elements(v_json -> 'items') loop
    v_item := (e ->> 'item_id')::uuid; v_type := e ->> 'type';
    execute 'reset role';
    select x.elem -> 'ordre' into v_ordre from public.academy_entrainements en, jsonb_array_elements(en.items) x(elem) where en.id = v_ent and (x.elem ->> 'item_id')::uuid = v_item;
    select c.corrige, i.payload into v_corr, v_pay from public.academy_items i join public.academy_items_corriges c on c.item_id = i.id where i.id = v_item;
    -- bonne reponse en indices presentes
    v_bonne := public.academy_verifier_reponse(v_type, v_pay, v_ordre, v_corr, 'null'::jsonb) -> 'bonne_reponse';
    if v_type in ('choix', 'trou_choix') then v_rep := v_bonne;
    elsif v_type = 'vrai_faux' then v_rep := v_bonne;
    elsif v_type in ('multi', 'ordre', 'association') then v_rep := v_bonne;
    elsif v_type = 'trou_saisie' then v_rep := to_jsonb((v_corr -> 'reponses' ->> 0)::text);
    elsif v_type = 'carte' then v_rep := '{"su":true}'::jsonb; v_carte := v_carte + 1;
    end if;
    -- le premier item de type choix est rate volontairement
    if v_type = 'choix' and v_premier_choix is null then
      v_premier_choix := v_item;
      v_rep := to_jsonb(((v_bonne #>> '{}')::int + 1) % jsonb_array_length(v_pay -> 'choix'));
    end if;
    execute 'set local role authenticated';
    v_res := public.academy_repondre(v_ent, v_item, v_rep);
    if v_item = v_premier_choix then
      if (v_res ->> 'correcte')::boolean then raise exception 'ECHEC : reponse fausse acceptee'; end if;
      if (v_res ->> 'force')::int <> 0 then raise exception 'ECHEC force apres echec : %', v_res ->> 'force'; end if;
    else
      if not (v_res ->> 'correcte')::boolean then raise exception 'ECHEC : bonne reponse refusee (% : % / % / %)', v_type, v_rep, v_res, v_ordre; end if;
      if (v_res ->> 'force')::int <> 1 then raise exception 'ECHEC force apres reussite : %', v_res ->> 'force'; end if;
    end if;
    if v_res ->> 'explication' is null or v_res ->> 'explication' = '' then raise exception 'ECHEC : explication absente'; end if;
  end loop;
  -- idempotence d une reponse
  v_res2 := public.academy_repondre(v_ent, v_premier_choix, '0'::jsonb);
  if not (v_res2 ->> 'deja')::boolean or (v_res2 ->> 'correcte')::boolean then raise exception 'ECHEC idempotence repondre : %', v_res2; end if;
  execute 'reset role';
  select count(*) into v_nb from public.academy_entrainement_reponses where entrainement_id = v_ent;
  if v_nb <> 12 then raise exception 'ECHEC : % reponses enregistrees', v_nb; end if;
  select count(*) into v_nb from public.academy_intervalles i join public.academy_sessions s on s.id = i.session_id where s.entrainement_id = v_ent;
  if v_nb < 1 then raise exception 'ECHEC : aucun intervalle d activite'; end if;
  execute 'set local role authenticated';

  v_res := public.academy_terminer_entrainement(v_ent);
  v_bons := (v_res ->> 'nb_bons')::int;
  if v_bons <> 11 or (v_res ->> 'nb_total')::int <> 12 then raise exception 'ECHEC fin de session : %', v_res; end if;
  v_xp_attendu := (11 - v_carte) * 10 + v_carte * 5 + 10;
  if (v_res ->> 'xp')::int <> v_xp_attendu then raise exception 'ECHEC XP : % au lieu de %', v_res ->> 'xp', v_xp_attendu; end if;
  if (v_res ->> 'serie')::int <> 1 or not (v_res ->> 'premiere_du_jour')::boolean then raise exception 'ECHEC serie : %', v_res; end if;
  if (v_res ->> 'couronnes_apres')::int <> 1 then raise exception 'ECHEC couronnes apres session 1 : %', v_res ->> 'couronnes_apres'; end if;
  if (v_res ->> 'statut_module') <> 'en_cours' then raise exception 'ECHEC statut : %', v_res ->> 'statut_module'; end if;
  if jsonb_array_length(v_res -> 'erreurs') <> 1 then raise exception 'ECHEC erreurs : %', v_res -> 'erreurs'; end if;
  v_res2 := public.academy_terminer_entrainement(v_ent);
  if (v_res2 ->> 'xp')::int <> (v_res ->> 'xp')::int then raise exception 'ECHEC idempotence terminer'; end if;
  v_erreur := false;
  begin v_res2 := public.academy_repondre(v_ent, v_premier_choix, '0'::jsonb); exception when others then v_erreur := true; end;
  -- une reponse deja enregistree est rendue meme apres la fin ; un nouvel item serait refuse
  resume := resume || '3 session 1 : tirage sans corrige, idempotence, 11/12, XP, serie, une couronne OK; ';

  -- ── 4. Sessions 2 et 3 : toutes bonnes, jusqu a la validation ───────────
  for k in 2..3 loop
    v_json := public.academy_demarrer_entrainement(v_version, gen_random_uuid());
    v_ent := (v_json ->> 'entrainement_id')::uuid;
    if jsonb_array_length(v_json -> 'items') <> 12 then raise exception 'ECHEC tirage session %', k; end if;
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
      if not (v_res ->> 'correcte')::boolean then raise exception 'ECHEC session % : bonne reponse refusee (%)', k, v_type; end if;
    end loop;
    v_res := public.academy_terminer_entrainement(v_ent);
    if (v_res ->> 'nb_bons')::int <> 12 then raise exception 'ECHEC session % : % bons', k, v_res ->> 'nb_bons'; end if;
    if (v_res ->> 'premiere_du_jour')::boolean then raise exception 'ECHEC : premiere du jour comptee deux fois'; end if;
    if (v_res ->> 'serie')::int <> 1 then raise exception 'ECHEC : la serie a bouge dans la journee'; end if;
  end loop;
  if (v_res ->> 'couronnes_apres')::int <> 3 then raise exception 'ECHEC couronnes apres session 3 : %', v_res ->> 'couronnes_apres'; end if;
  if not (v_res ->> 'valide')::boolean or v_res -> 'attestation' ->> 'numero' not like 'EA-%' then raise exception 'ECHEC validation : %', v_res; end if;
  if (v_res ->> 'statut_module') <> 'valide' then raise exception 'ECHEC statut valide : %', v_res ->> 'statut_module'; end if;
  v_json := public.academy_mon_parcours();
  if (v_json -> 'serie' ->> 'serie')::int <> 1 or (v_json -> 'xp' ->> 'total')::int < 300 then raise exception 'ECHEC mon parcours : %', v_json -> 'xp'; end if;
  if (select (a ->> 'couronnes')::int from jsonb_array_elements(v_json -> 'affectations') a where (a ->> 'version_id')::uuid = v_version) <> 3 then raise exception 'ECHEC couronnes dans mon parcours'; end if;
  v_json := public.academy_module('deck-test-entrainement');
  if (v_json ->> 'couronnes')::int <> 3 or (v_json ->> 'memo_md') not like '%Memo%' then raise exception 'ECHEC deck : %', v_json ->> 'couronnes'; end if;
  v_json := public.academy_mes_resultats();
  if jsonb_array_length(v_json -> 'sessions') <> 3 then raise exception 'ECHEC mes resultats : % sessions', jsonb_array_length(v_json -> 'sessions'); end if;
  resume := resume || '4 trois couronnes, validation, attestation, parcours et resultats OK; ';

  -- ── 5. Noe : cloisonnement ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_noe, 'role', 'authenticated')::text, true);
  if (select count(*) from public.academy_entrainements) <> 0 then raise exception 'ECHEC : noe voit des sessions'; end if;
  if (select count(*) from public.academy_forces) <> 0 then raise exception 'ECHEC : noe voit des forces'; end if;
  v_erreur := false;
  begin v_res := public.academy_terminer_entrainement(v_ent); exception when others then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : noe termine la session de camille'; end if;
  v_erreur := false;
  begin v_json := public.academy_fiche(c_camille); exception when insufficient_privilege then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : noe lit la fiche de camille'; end if;
  v_json := public.academy_mon_parcours();
  if (select (a ->> 'couronnes')::int from jsonb_array_elements(v_json -> 'affectations') a where (a ->> 'version_id')::uuid = v_version) <> 0 then raise exception 'ECHEC : noe a des couronnes'; end if;
  resume := resume || '5 cloisonnement OK; ';

  -- ── 6. Manager : pilotage, matrice, admin, immutabilite, version 2 ──────
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  v_json := public.academy_pilotage(null, null);
  if (v_json -> 'indicateurs' ->> 'obligatoires_validees')::int < 1 then raise exception 'ECHEC pilotage validees'; end if;
  if (select (l ->> 'serie')::int from jsonb_array_elements(v_json -> 'lignes') l where (l ->> 'profile_id')::uuid = c_camille) <> 1 then raise exception 'ECHEC pilotage serie'; end if;
  if (select count(*) from jsonb_array_elements(v_json -> 'lignes') l, jsonb_array_elements(l -> 'decks') d where (l ->> 'profile_id')::uuid = c_camille and (d ->> 'couronnes')::int = 3) <> 1 then raise exception 'ECHEC pilotage decks'; end if;
  if jsonb_array_length(v_json -> 'notions') < 1 then raise exception 'ECHEC pilotage notions'; end if;
  v_json := public.academy_matrice_competences();
  if (select count(*) from jsonb_array_elements(v_json -> 'lignes') l, jsonb_array_elements(l -> 'cellules') c where (l ->> 'profile_id')::uuid = c_camille and c ->> 'statut' = 'acquis' and (c ->> 'couronnes')::int = 3) <> 1 then raise exception 'ECHEC matrice'; end if;
  v_json := public.academy_fiche(c_camille);
  if jsonb_array_length(v_json -> 'sessions') <> 3 or (v_json ->> 'xp_total')::int < 300 then raise exception 'ECHEC fiche'; end if;
  v_json := public.academy_version_admin(v_version);
  if jsonb_array_length(v_json -> 'items') <> 12 or (v_json -> 'items' -> 0 -> 'statistiques' ->> 'reponses')::int <> 3 then raise exception 'ECHEC version admin : %', v_json -> 'items' -> 0 -> 'statistiques'; end if;
  v_erreur := false;
  begin update public.academy_items set competence = 'Modifie' where version_id = v_version; exception when check_violation then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : item d une version publiee modifie'; end if;
  v_erreur := false;
  begin perform public.academy_enregistrer_item(v_version, null, '{"type":"carte","payload":{"recto":"x","verso":"y"},"corrige":{}}'::jsonb); exception when check_violation then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : ajout d item sur une version publiee'; end if;
  v_v2 := public.academy_nouvelle_version(v_module);
  -- Les corriges ne se lisent pas en direct, meme par un manager : controle
  -- de la copie avec les droits postgres.
  execute 'reset role';
  if (select count(*) from public.academy_items where version_id = v_v2) <> 12 or (select count(*) from public.academy_items_corriges c join public.academy_items i on i.id = c.item_id where i.version_id = v_v2) <> 12 then raise exception 'ECHEC copie des items'; end if;
  if (select memo_md from public.academy_module_versions where id = v_v2) not like '%Memo%' then raise exception 'ECHEC copie du memo'; end if;
  execute 'set local role authenticated';
  v_json := public.academy_publier_version(v_v2, 'Relecteur v2', null, true);
  if (v_json ->> 'nouvelles_affectations')::int <> 2 then raise exception 'ECHEC nouvelles affectations : %', v_json; end if;
  if (select statut from public.academy_module_versions where id = v_version) <> 'archive' then raise exception 'ECHEC archivage v1'; end if;
  if not exists (select 1 from public.academy_validations where profile_id = c_camille and version_id = v_version) then raise exception 'ECHEC : validation v1 perdue'; end if;
  resume := resume || '6 pilotage, matrice, fiche, admin, immutabilite, version 2 OK; ';

  -- ── 7. Un deck de moins de 12 items ne se publie pas ───────────────────
  v_mod := public.academy_creer_module('deck-trop-court', 'Deck court', 'methode', 'decouverte');
  perform public.academy_enregistrer_item((v_mod ->> 'version_id')::uuid, null, '{"type":"carte","payload":{"recto":"x","verso":"y"},"corrige":{}}'::jsonb);
  v_erreur := false;
  begin v_json := public.academy_publier_version((v_mod ->> 'version_id')::uuid, 'R', null, false); exception when others then v_erreur := true; end;
  if not v_erreur then raise exception 'ECHEC : un deck d un item a ete publie'; end if;
  resume := resume || '7 deck trop court refuse OK; ';

  execute 'reset role';
  raise exception 'TESTS OK (transaction annulee volontairement) : %', resume;
end
$tests$;
