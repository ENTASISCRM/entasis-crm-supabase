-- Scenarios d acceptation d Entasis Academy, a jouer sur le projet de
-- DEVELOPPEMENT (entasis-crm-DEV, leuqchrianpasianwmjg) apres les migrations
-- academy_1, academy_2 et le seed. JAMAIS en production.
--
-- Tout se passe dans un seul bloc DO qui se termine par une exception
-- volontaire : la transaction est annulee, rien ne reste en base, et le
-- message de l exception porte le resume des controles. Un controle qui
-- echoue leve sa propre exception (message « ECHEC ... »).
--
-- Les identites sont simulees comme PostgREST le fait : role authenticated
-- et request.jwt.claims = {"sub": "<uuid>"}. Les fonctions security definer
-- s executent alors exactement comme depuis le navigateur.
--
-- Profils DEV utilises (fictifs) : camille et noe (advisor), martin borgis
-- (manager). Remplacer les uuid si le projet DEV change.

do $tests$
declare
  c_camille uuid := '11111111-1111-1111-1111-111111111111';
  c_noe     uuid := '22222222-2222-2222-2222-222222222222';
  c_manager uuid := 'af124117-104e-4958-9283-e0864b6c8f17';
  v_module uuid; v_version uuid; v_v2 uuid; v_l1 uuid; v_l2 uuid; v_l3 uuid;
  v_nb int; v_json jsonb; v_json2 jsonb; v_id uuid; v_rep int;
  v_reponses jsonb; v_bonnes jsonb; v_tentative uuid; v_tentative2 uuid; v_res jsonb; v_res2 jsonb;
  v_sess1 uuid; v_sess2 uuid; v_duree int; v_erreur boolean;
  e jsonb; v_q uuid; v_ordre jsonb; v_bonne int; v_pos int;
  resume text := '';
begin
  -- ── Contexte : identite manager, publication du module 1 ────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select m.id, v.id into v_module, v_version
    from public.academy_modules m join public.academy_module_versions v on v.module_id = m.id
   where m.slug = 'methode-entasis' order by v.numero desc limit 1;
  if v_version is null then raise exception 'ECHEC seed : module methode-entasis absent'; end if;

  v_json := public.academy_publier_version(v_version, 'Relecteur de test', 'scenario', false);
  if (select statut from public.academy_module_versions where id = v_version) <> 'publie' then raise exception 'ECHEC publication'; end if;
  resume := resume || '1 publication OK; ';

  v_nb := public.academy_affecter(array[c_camille, c_noe], v_module, null, public.academy_aujourdhui() + 7, true);
  if v_nb <> 2 then raise exception 'ECHEC affectation : % creees', v_nb; end if;
  v_nb := public.academy_affecter(array[c_camille], v_module, null, null, true);
  if v_nb <> 0 then raise exception 'ECHEC affectation idempotente : % creees', v_nb; end if;
  resume := resume || '2 affectations idempotentes OK; ';

  -- ── Identite camille : ce qu un conseiller ne voit pas ──────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);

  v_erreur := false;
  begin
    perform 1 from public.academy_corriges limit 1;
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit academy_corriges'; end if;

  v_erreur := false;
  begin
    perform mini_reponse from public.academy_lecons limit 1;
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit mini_reponse'; end if;

  v_erreur := false;
  begin
    perform 1 from public.academy_intervalles limit 1;
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit academy_intervalles'; end if;

  v_erreur := false;
  begin
    insert into public.academy_tentatives (profile_id, version_id, type, numero, jeton_client) values (c_camille, v_version, 'quiz', 99, gen_random_uuid());
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller insere une tentative en direct'; end if;
  -- Le temps d activite d un collegue ne se lit pas par la fonction interne
  v_erreur := false;
  begin
    perform public.academy_duree_active(c_noe, null, null);
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller appelle academy_duree_active'; end if;
  resume := resume || '3 corriges, mini_reponse, intervalles, tentatives, duree_active illisibles ou inecrivables en direct OK; ';

  -- Catalogue et module
  v_json := public.academy_catalogue();
  if jsonb_array_length(v_json) < 1 then raise exception 'ECHEC catalogue vide'; end if;
  if (select count(*) from jsonb_array_elements(v_json) x where x ->> 'slug' = 'methode-entasis' and (x -> 'affectation' ->> 'statut') = 'non_commence') <> 1 then
    raise exception 'ECHEC catalogue : affectation non trouvee ou statut errone';
  end if;
  v_json := public.academy_module('methode-entasis');
  select (l ->> 'id')::uuid into v_l1 from jsonb_array_elements(v_json -> 'lecons') l where (l ->> 'ordre')::int = 1;
  select (l ->> 'id')::uuid into v_l2 from jsonb_array_elements(v_json -> 'lecons') l where (l ->> 'ordre')::int = 2;
  select (l ->> 'id')::uuid into v_l3 from jsonb_array_elements(v_json -> 'lecons') l where (l ->> 'ordre')::int = 3;
  v_json := public.academy_lecon(v_l1);
  if v_json -> 'mini_question' ? 'bonne_reponse' then raise exception 'ECHEC : la lecon expose la bonne reponse de la mini question'; end if;
  resume := resume || '4 catalogue, module, lecon sans corrige OK; ';

  -- Quiz refuse avant la fin des lecons
  v_erreur := false;
  begin
    v_json := public.academy_ouvrir_tentative(v_version, 'quiz', gen_random_uuid());
  exception when others then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : quiz ouvert sans lecons terminees'; end if;

  -- Sessions et battements (deux onglets)
  v_sess1 := public.academy_ouvrir_session(v_l1, '0aaaaaaa-0000-4000-8000-000000000001');
  v_sess2 := public.academy_ouvrir_session(v_l1, '0aaaaaaa-0000-4000-8000-000000000001');
  if v_sess1 <> v_sess2 then raise exception 'ECHEC : le meme jeton ouvre deux sessions'; end if;
  perform public.academy_battement(v_sess1);
  perform public.academy_battement(v_sess1);
  v_sess2 := public.academy_ouvrir_session(v_l1, '0aaaaaaa-0000-4000-8000-000000000002');
  perform public.academy_battement(v_sess2);
  -- Position sauvee en direct (upsert autorise sur position seulement)
  update public.academy_progression_lecons set position = '{"scroll": 42}'::jsonb where lecon_id = v_l1 and profile_id = c_camille;
  if (select position ->> 'scroll' from public.academy_progression_lecons where lecon_id = v_l1 and profile_id = c_camille) <> '42' then raise exception 'ECHEC sauvegarde de position'; end if;
  -- Une progression inseree en direct porte la version de sa lecon, pas
  -- celle que le client annonce (v_l2 appartient a v_version ; on annonce v_l1 comme version).
  -- Le reglage academy.serveur pose par les fonctions est local a la transaction
  -- du test : on le remet a off, comme l est toute requete directe du navigateur.
  perform set_config('academy.serveur', 'off', true);
  insert into public.academy_progression_lecons (profile_id, lecon_id, version_id) values (c_camille, v_l2, v_l1) on conflict (profile_id, lecon_id) do nothing;
  if (select version_id from public.academy_progression_lecons where lecon_id = v_l2 and profile_id = c_camille) <> v_version then raise exception 'ECHEC : version_id de progression non corrige par le trigger'; end if;
  -- Le navigateur ne peut pas se declarer termine
  v_erreur := false;
  begin
    update public.academy_progression_lecons set terminee_le = now() where lecon_id = v_l1 and profile_id = c_camille;
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : terminee_le modifiable en direct'; end if;
  resume := resume || '5 sessions, battements, position, terminee_le protegee OK; ';

  -- Fusion des intervalles : deux sessions qui se chevauchent comptent une fois.
  execute 'reset role';
  insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin)
  values (v_sess1, c_camille, v_l1, now() - interval '10 minutes', now() - interval '5 minutes'),
         (v_sess2, c_camille, v_l1, now() - interval '7 minutes', now() - interval '3 minutes');
  v_duree := public.academy_duree_active(c_camille, now() - interval '1 day', null);
  if v_duree < 7 * 60 - 5 or v_duree > 7 * 60 + 5 then raise exception 'ECHEC fusion des intervalles : % s au lieu de 420', v_duree; end if;
  resume := resume || '6 fusion des intervalles (420 s) OK; ';
  execute 'set local role authenticated';

  -- Terminer les lecons : mauvaise reponse puis bonne reponse
  execute 'reset role';
  select mini_reponse into v_rep from public.academy_lecons where id = v_l1;
  execute 'set local role authenticated';
  v_json := public.academy_terminer_lecon(v_l1, (v_rep + 1) % 2);
  if (v_json ->> 'correcte')::boolean then raise exception 'ECHEC : mauvaise reponse acceptee'; end if;
  if v_json ->> 'terminee_le' is not null then raise exception 'ECHEC : lecon terminee sur mauvaise reponse'; end if;
  v_json := public.academy_terminer_lecon(v_l1, v_rep);
  if not (v_json ->> 'correcte')::boolean or v_json ->> 'terminee_le' is null then raise exception 'ECHEC : bonne reponse refusee'; end if;
  if (v_json ->> 'statut_module') <> 'en_cours' then raise exception 'ECHEC statut en_cours : %', v_json ->> 'statut_module'; end if;
  execute 'reset role';
  select mini_reponse into v_rep from public.academy_lecons where id = v_l2;
  execute 'set local role authenticated';
  perform public.academy_terminer_lecon(v_l2, v_rep);
  execute 'reset role';
  select mini_reponse into v_rep from public.academy_lecons where id = v_l3;
  execute 'set local role authenticated';
  perform public.academy_terminer_lecon(v_l3, v_rep);
  resume := resume || '7 lecons terminees par la mini question OK; ';

  -- Tirage : 5 questions, aucun corrige, idempotent par jeton
  v_json := public.academy_ouvrir_tentative(v_version, 'quiz', '0bbbbbbb-0000-4000-8000-000000000001');
  if jsonb_array_length(v_json -> 'questions') <> 5 then raise exception 'ECHEC tirage : % questions', jsonb_array_length(v_json -> 'questions'); end if;
  if v_json::text ilike '%bonne_reponse%' or v_json::text ilike '%explication%' then raise exception 'ECHEC : le tirage expose un corrige'; end if;
  v_json2 := public.academy_ouvrir_tentative(v_version, 'quiz', '0bbbbbbb-0000-4000-8000-000000000001');
  if (v_json ->> 'tentative_id') <> (v_json2 ->> 'tentative_id') then raise exception 'ECHEC : meme jeton, deux tentatives'; end if;
  v_tentative := (v_json ->> 'tentative_id')::uuid;
  if (select count(distinct (q ->> 'lecon_id')) from jsonb_array_elements(v_json -> 'questions') q) < 3 then raise exception 'ECHEC tirage : pas equilibre sur les 3 lecons'; end if;
  resume := resume || '8 tirage equilibre sans corrige, idempotent OK; ';

  -- Reponses toutes fausses (calculees avec les droits postgres), soumission
  execute 'reset role';
  v_reponses := '{}'::jsonb; v_bonnes := '{}'::jsonb;
  for e in select * from jsonb_array_elements((select questions from public.academy_tentatives where id = v_tentative)) loop
    v_q := (e ->> 'question_id')::uuid; v_ordre := e -> 'ordre';
    select bonne_reponse into v_bonne from public.academy_corriges where question_id = v_q;
    select (o.pos - 1)::int into v_pos from jsonb_array_elements_text(v_ordre) with ordinality o(idx, pos) where o.idx::int = v_bonne;
    v_bonnes := v_bonnes || jsonb_build_object(v_q::text, v_pos);
    v_reponses := v_reponses || jsonb_build_object(v_q::text, (v_pos + 1) % jsonb_array_length(v_ordre));
  end loop;
  execute 'set local role authenticated';
  v_res := public.academy_soumettre_tentative(v_tentative, v_reponses);
  if (v_res ->> 'score')::int <> 0 then raise exception 'ECHEC score attendu 0 : %', v_res ->> 'score'; end if;
  if (v_res ->> 'reussie')::boolean then raise exception 'ECHEC : echec attendu'; end if;
  if (v_res ->> 'statut_module') <> 'a_revoir' then raise exception 'ECHEC statut a_revoir : %', v_res ->> 'statut_module'; end if;
  if jsonb_array_length(v_res -> 'corrections') <> 5 or (v_res -> 'corrections' -> 0) ->> 'explication' is null then raise exception 'ECHEC corrections'; end if;
  -- Idempotence : resoumettre renvoie le meme resultat, sans doublon
  v_res2 := public.academy_soumettre_tentative(v_tentative, v_bonnes);
  if (v_res2 ->> 'score')::int <> 0 then raise exception 'ECHEC idempotence : une resoumission a change le score'; end if;
  execute 'reset role';
  select count(*) into v_nb from public.academy_reponses where tentative_id = v_tentative;
  if v_nb <> 5 then raise exception 'ECHEC doublons de reponses : %', v_nb; end if;
  execute 'set local role authenticated';
  resume := resume || '9 echec au premier essai, corrections, idempotence OK; ';

  -- Seconde tentative, toutes bonnes
  v_json := public.academy_ouvrir_tentative(v_version, 'quiz', '0bbbbbbb-0000-4000-8000-000000000002');
  v_tentative2 := (v_json ->> 'tentative_id')::uuid;
  if (v_json ->> 'numero')::int <> 2 then raise exception 'ECHEC numero de tentative : %', v_json ->> 'numero'; end if;
  execute 'reset role';
  v_bonnes := '{}'::jsonb;
  for e in select * from jsonb_array_elements((select questions from public.academy_tentatives where id = v_tentative2)) loop
    v_q := (e ->> 'question_id')::uuid; v_ordre := e -> 'ordre';
    select bonne_reponse into v_bonne from public.academy_corriges where question_id = v_q;
    select (o.pos - 1)::int into v_pos from jsonb_array_elements_text(v_ordre) with ordinality o(idx, pos) where o.idx::int = v_bonne;
    v_bonnes := v_bonnes || jsonb_build_object(v_q::text, v_pos);
  end loop;
  execute 'set local role authenticated';
  v_res := public.academy_soumettre_tentative(v_tentative2, v_bonnes);
  if not (v_res ->> 'reussie')::boolean or not (v_res ->> 'module_valide')::boolean then raise exception 'ECHEC validation : %', v_res; end if;
  if v_res -> 'attestation' ->> 'numero' not like 'EA-%' then raise exception 'ECHEC attestation'; end if;
  if (v_res ->> 'statut_module') <> 'valide' then raise exception 'ECHEC statut valide'; end if;
  if (select count(*) from public.academy_revisions where profile_id = c_camille and version_id = v_version) <> 2 then raise exception 'ECHEC revisions J7 J30'; end if;
  v_json := public.academy_mes_tentatives();
  if jsonb_array_length(v_json) <> 2 then raise exception 'ECHEC historique : % tentatives', jsonb_array_length(v_json); end if;
  if (select min((t ->> 'score')::int) from jsonb_array_elements(v_json) t) <> 0 then raise exception 'ECHEC : le premier score n est plus 0'; end if;
  resume := resume || '10 reussite, attestation, deux revisions uniques, premier score conserve OK; ';

  -- Revision J+7 : pas due avant sa date, due a sa date, une seule fois
  v_erreur := false;
  begin
    v_json := public.academy_ouvrir_tentative(v_version, 'revision_j7', gen_random_uuid());
  exception when others then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : revision ouverte avant sa date'; end if;
  execute 'reset role';
  update public.academy_revisions set echeance = public.academy_aujourdhui() where profile_id = c_camille and version_id = v_version and type = 'J7';
  execute 'set local role authenticated';
  v_json := public.academy_ouvrir_tentative(v_version, 'revision_j7', '0ccccccc-0000-4000-8000-000000000001');
  if jsonb_array_length(v_json -> 'questions') <> 4 then raise exception 'ECHEC revision : % questions', jsonb_array_length(v_json -> 'questions'); end if;
  v_id := (v_json ->> 'tentative_id')::uuid;
  execute 'reset role';
  v_bonnes := '{}'::jsonb;
  for e in select * from jsonb_array_elements((select questions from public.academy_tentatives where id = v_id)) loop
    v_q := (e ->> 'question_id')::uuid; v_ordre := e -> 'ordre';
    select bonne_reponse into v_bonne from public.academy_corriges where question_id = v_q;
    select (o.pos - 1)::int into v_pos from jsonb_array_elements_text(v_ordre) with ordinality o(idx, pos) where o.idx::int = v_bonne;
    v_bonnes := v_bonnes || jsonb_build_object(v_q::text, v_pos);
  end loop;
  execute 'set local role authenticated';
  v_res := public.academy_soumettre_tentative(v_id, v_bonnes);
  if (select resultat from public.academy_revisions where profile_id = c_camille and version_id = v_version and type = 'J7') <> 'reussie' then raise exception 'ECHEC resultat de revision'; end if;
  v_erreur := false;
  begin
    v_json := public.academy_ouvrir_tentative(v_version, 'revision_j7', gen_random_uuid());
  exception when others then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : revision refaite'; end if;
  resume := resume || '11 revision J+7 due a sa date, une seule fois OK; ';

  -- Identite noe : rien des donnees de camille
  perform set_config('request.jwt.claims', json_build_object('sub', c_noe, 'role', 'authenticated')::text, true);
  if (select count(*) from public.academy_tentatives) <> 0 then raise exception 'ECHEC : noe voit des tentatives'; end if;
  if (select count(*) from public.academy_progression_lecons) <> 0 then raise exception 'ECHEC : noe voit une progression'; end if;
  v_erreur := false;
  begin
    v_json := public.academy_corrige(v_tentative2);
  exception when others then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : noe lit le corrige de camille'; end if;
  v_erreur := false;
  begin
    v_json := public.academy_pilotage(null, null);
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit le pilotage'; end if;
  v_erreur := false;
  begin
    v_json := public.academy_fiche(c_camille);
  exception when insufficient_privilege then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : un conseiller lit la fiche d un collegue'; end if;
  resume := resume || '12 cloisonnement entre collegues OK; ';

  -- Identite manager : pilotage, fiche, matrice ; immutabilite ; nouvelle version
  perform set_config('request.jwt.claims', json_build_object('sub', c_manager, 'role', 'authenticated')::text, true);
  v_json := public.academy_pilotage(null, null);
  if (v_json -> 'indicateurs' ->> 'affectes')::int < 2 then raise exception 'ECHEC pilotage : affectes'; end if;
  if (v_json -> 'indicateurs' ->> 'premiere_reussite_den')::int <> 1 or (v_json -> 'indicateurs' ->> 'premiere_reussite_num')::int <> 0 then raise exception 'ECHEC premiere reussite : %', v_json -> 'indicateurs'; end if;
  if (select count(*) from jsonb_array_elements(v_json -> 'lignes') l where (l ->> 'profile_id')::uuid = c_noe and (l ->> 'premier_score') is null) <> 1 then raise exception 'ECHEC : noe devrait etre non evalue'; end if;
  v_json := public.academy_fiche(c_camille);
  if jsonb_array_length(v_json -> 'evenements') < 3 then raise exception 'ECHEC fiche : evenements'; end if;
  v_json := public.academy_matrice_competences();
  if (select count(*) from jsonb_array_elements(v_json -> 'lignes') l, jsonb_array_elements(l -> 'cellules') c where (l ->> 'profile_id')::uuid = c_camille and c ->> 'statut' = 'acquis') <> 1 then raise exception 'ECHEC matrice'; end if;

  v_erreur := false;
  begin
    update public.academy_lecons set titre = 'Modifie' where id = v_l1;
  exception when check_violation then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : lecon d une version publiee modifiee'; end if;
  v_erreur := false;
  begin
    update public.academy_module_versions set titre = 'Modifie' where id = v_version;
  exception when check_violation then v_erreur := true;
  end;
  if not v_erreur then raise exception 'ECHEC : version publiee modifiee'; end if;

  v_v2 := public.academy_nouvelle_version(v_module);
  if (select statut from public.academy_module_versions where id = v_v2) <> 'brouillon' then raise exception 'ECHEC nouveau brouillon'; end if;
  if (select count(*) from public.academy_lecons where version_id = v_v2) <> 3 or (select count(*) from public.academy_questions where version_id = v_v2) <> 10 then raise exception 'ECHEC copie du brouillon'; end if;
  perform public.academy_enregistrer_version(v_v2, '{"titre": "La méthode Entasis, v2"}'::jsonb);
  v_json := public.academy_publier_version(v_v2, 'Relecteur v2', null, true);
  if (v_json ->> 'nouvelles_affectations')::int <> 2 then raise exception 'ECHEC : nouvelles affectations attendues 2, % ', v_json ->> 'nouvelles_affectations'; end if;
  if (select statut from public.academy_module_versions where id = v_version) <> 'archive' then raise exception 'ECHEC archivage de l ancienne version'; end if;
  if (select version_id from public.academy_tentatives where id = v_tentative2) <> v_version then raise exception 'ECHEC : l ancienne tentative a change de version'; end if;
  if not exists (select 1 from public.academy_validations where profile_id = c_camille and version_id = v_version) then raise exception 'ECHEC : validation anterieure perdue'; end if;
  resume := resume || '13 pilotage, fiche, matrice, immutabilite, nouvelle version imposee sans perte OK; ';

  -- Rappels de camille : la nouvelle affectation apparait comme echeance proche
  perform set_config('request.jwt.claims', json_build_object('sub', c_camille, 'role', 'authenticated')::text, true);
  v_json := public.academy_mon_parcours();
  if (select count(*) from jsonb_array_elements(v_json -> 'affectations')) <> 2 then raise exception 'ECHEC mon parcours : % affectations', (select count(*) from jsonb_array_elements(v_json -> 'affectations')); end if;
  resume := resume || '14 mon parcours OK; ';

  execute 'reset role';
  raise exception 'TESTS OK (transaction annulee volontairement) : %', resume;
end
$tests$;
