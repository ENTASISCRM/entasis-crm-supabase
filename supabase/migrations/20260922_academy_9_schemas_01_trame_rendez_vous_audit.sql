-- Entasis Academy, migration 9 : schemas et figures des decks (brouillons).
--
-- Genere par scripts/academy/generer-decks.mjs depuis scripts/academy/decks/*.json :
-- ne pas editer a la main, regenerer. Complete le brouillon courant d un
-- module deja seme par la migration 7 : pose les schemas de la version
-- (remplacement par cle, les autres cles conservees), pose payload.figure
-- sur les exercices existants reperes par (ordre, type) qui n en ont pas
-- encore, insere les exercices nouveaux (ordre au dela du maximum existant)
-- avec leur corrige, ordre et association deja melanges. Idempotent. Une
-- version publiee n est jamais touchee : sans brouillon, raise notice et
-- rien. A appliquer apres la migration 8 (colonne academy_module_versions.schemas).

-- ── Schemas : La trame du rendez vous d’audit patrimonial (trame-rendez-vous-audit) ──
do $schemas_trame_rendez_vous_audit$
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$trame-rendez-vous-audit$academy_deck$;
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', $academy_deck$trame-rendez-vous-audit$academy_deck$;
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', $academy_deck$trame-rendez-vous-audit$academy_deck$;
    return;
  end if;
  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := $academy_deck$[{"cle":"frise","titre":"Les sept étapes et leurs durées","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les sept étapes et leurs durées</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"36\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Une heure, sept étapes</text>\n<line x1=\"40\" y1=\"72\" x2=\"40\" y2=\"306\" stroke=\"#8A95A8\" stroke-width=\"2\"/>\n<g font-size=\"17\" fill=\"#2C3548\">\n<circle cx=\"40\" cy=\"72\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"77\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">1</text>\n<text x=\"66\" y=\"78\">Accueil et cadrage</text>\n<rect x=\"384\" y=\"60\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"77\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n<circle cx=\"40\" cy=\"111\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"116\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">2</text>\n<text x=\"66\" y=\"117\">Situation personnelle et familiale</text>\n<rect x=\"384\" y=\"99\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"116\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"150\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"155\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">3</text>\n<text x=\"66\" y=\"156\">Situation professionnelle et revenus</text>\n<rect x=\"384\" y=\"138\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"155\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"189\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"194\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">4</text>\n<text x=\"66\" y=\"195\" font-weight=\"700\" fill=\"#162443\">Patrimoine actuel</text>\n<rect x=\"384\" y=\"177\" width=\"234\" height=\"24\" rx=\"8\" fill=\"#C5A55A\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"501\" y=\"194\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">15 min, la plus longue</text>\n<circle cx=\"40\" cy=\"228\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"233\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">5</text>\n<text x=\"66\" y=\"234\">Objectifs du client</text>\n<rect x=\"384\" y=\"216\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"233\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"267\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"272\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">6</text>\n<text x=\"66\" y=\"273\">Premiers axes de recommandation</text>\n<rect x=\"384\" y=\"255\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"272\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n<circle cx=\"40\" cy=\"306\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"311\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">7</text>\n<text x=\"66\" y=\"312\">Documents à récupérer</text>\n<rect x=\"384\" y=\"294\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"311\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n</g>\n<text x=\"320\" y=\"348\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">5 + 10 + 10 + 15 + 10 + 5 + 5 = 60 minutes, soit une heure</text>\n</svg>","legende":"Sept étapes pour une heure : le patrimoine actuel prend le quart du temps, les trois étapes de cinq minutes ouvrent et ferment le rendez vous."},{"cle":"documents","titre":"Les six documents à récupérer","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les six documents à récupérer</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"36\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les six documents à récupérer</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">Étape 7, 5 minutes : un maximum de documents pour lancer l’analyse</text>\n<rect x=\"20\" y=\"72\" width=\"600\" height=\"272\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<g font-size=\"17\" fill=\"#2C3548\">\n<rect x=\"40\" y=\"85\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"102\"><tspan font-weight=\"700\" fill=\"#162443\">Dernier avis d’imposition</tspan>, foyer complet</text>\n<rect x=\"40\" y=\"129\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"146\"><tspan font-weight=\"700\" fill=\"#162443\">Tableau d’actifs</tspan>, sinon la liste des placements</text>\n<rect x=\"40\" y=\"173\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"190\"><tspan font-weight=\"700\" fill=\"#162443\">Relevés</tspan> d’assurance vie, PER, PEA, comptes titres</text>\n<rect x=\"40\" y=\"217\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"234\"><tspan font-weight=\"700\" fill=\"#162443\">Bilan et liasse fiscale</tspan>, si entrepreneur</text>\n<rect x=\"40\" y=\"261\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"278\"><tspan font-weight=\"700\" fill=\"#162443\">Relevé de carrière</tspan>, tableau de retraite, mutuelle, prévoyance</text>\n<rect x=\"40\" y=\"305\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"322\"><tspan font-weight=\"700\" fill=\"#162443\">Situation locative</tspan> : baux, crédits, loyers perçus</text>\n</g>\n</svg>","legende":"Six familles de documents à demander à la dernière étape : plus le client en apporte, plus vite l’analyse démarre."}]$academy_deck$::jsonb;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;
  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;
  if v_max >= 6 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"frise"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 6 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 6, $academy_deck$multi$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Coche les étapes qui durent cinq minutes.","choix":["Accueil et cadrage","Situation personnelle et familiale","Premiers axes de recommandation","Documents à récupérer","Patrimoine actuel"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,2,3]}$academy_deck$::jsonb, $academy_deck$Trois étapes de cinq minutes : accueil, premiers axes, documents.$academy_deck$);
  end if;
  if v_max >= 13 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"documents"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 13 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 13, $academy_deck$multi$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 1, $academy_deck${"enonce":"Coche les documents à récupérer selon la trame.","choix":["Dernier avis d’imposition","Relevés d’assurance vie, PER, PEA, comptes titres","Carte d’identité du conjoint","Bilan et liasse fiscale si entrepreneur","Relevé de carrière","Ticket de caisse du dernier achat"],"figure":{"ref":"documents"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3,4]}$academy_deck$::jsonb, $academy_deck$Avis d’imposition, relevés de contrats, bilan et liasse, relevé de carrière ; la trame ne cite ni pièce d’identité ni ticket.$academy_deck$);
  end if;
  if v_max >= 19 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"frise"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 19 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 19, $academy_deck$choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"Quelle est l’étape la plus longue ?","choix":["Situation personnelle et familiale","Patrimoine actuel","Objectifs du client","Documents à récupérer"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le patrimoine actuel prend quinze minutes.$academy_deck$);
  end if;
  if v_max >= 42 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"documents"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 42 and type = $academy_deck$vrai_faux$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 42, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Si le client n’a pas de tableau d’actifs, on ne demande rien d’autre.","figure":{"ref":"documents"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Tableau d’actifs si existant, sinon la liste des placements.$academy_deck$);
  end if;
  if v_max >= 56 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"frise"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 56 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 56, $academy_deck$choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, combien de minutes se sont écoulées quand commence l’étape Patrimoine actuel ?","choix":["15 minutes","25 minutes","30 minutes","40 minutes"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Accueil 5, situation personnelle 10, situation professionnelle 10 : le patrimoine actuel commence à la 25e minute et occupe ensuite le quart du rendez vous.$academy_deck$);
  end if;
  if v_max >= 57 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"frise"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 57 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 57, $academy_deck$multi$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, coche les étapes qui durent dix minutes.","choix":["Situation personnelle et familiale","Situation professionnelle et revenus","Patrimoine actuel","Objectifs du client","Documents à récupérer"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Trois étapes de dix minutes : la situation personnelle, la situation professionnelle et les objectifs ; le patrimoine en prend quinze, les documents cinq.$academy_deck$);
  end if;
  if v_max >= 58 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"documents"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 58 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 58, $academy_deck$trou_choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma, la ligne qui commence par le relevé de carrière regroupe aussi ___.","choix":["le tableau de retraite, la mutuelle et la prévoyance","le bilan et la liasse fiscale","les baux, les crédits et les loyers perçus","les relevés d’assurance vie et de PER"],"figure":{"ref":"documents"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une seule ligne de la liste porte la retraite et la protection : relevé de carrière, tableau de retraite, mutuelle, prévoyance. La mutuelle et la prévoyance se demandent donc en même temps que les pièces de retraite.$academy_deck$);
  end if;
end
$schemas_trame_rendez_vous_audit$;
