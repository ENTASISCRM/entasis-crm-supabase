-- Entasis Academy, migration 7 : les decks d exercices (mode entrainement).
--
-- Genere par scripts/academy/generer-decks.mjs depuis scripts/academy/decks/*.json :
-- ne pas editer a la main, regenerer. Un deck = un memo d une page et une
-- quarantaine d exercices (huit types), tout en BROUILLON, a relire avant
-- publication. Les corriges vont dans academy_items_corriges (illisible en
-- direct). Idempotent : une version qui porte deja des items est ignoree.
--
-- Contenu : la trame du rendez vous d audit patrimonial (deux pages de
-- Louis, 21 septembre 2026) et les douze modules du catalogue convertis
-- depuis leurs lecons verifiees, sans fait nouveau.

-- ── Deck : La trame du rendez vous d’audit patrimonial (trame-rendez-vous-audit) ──
do $deck_trame_rendez_vous_audit$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$trame-rendez-vous-audit$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$trame-rendez-vous-audit$academy_deck$, $academy_deck$La trame du rendez vous d’audit patrimonial$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$decouverte$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$La trame du rendez vous d’audit patrimonial$academy_deck$, $academy_deck$Savoir par cœur les sept étapes de la trame, leur durée, ce que l’on demande à chacune et les documents à récupérer.$academy_deck$, $academy_deck$Dérouler les sept étapes du rendez vous d’audit patrimonial standard, dans l’ordre et dans le temps imparti$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
    returning id into v_ver;
  else
    select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
    if v_ver is null then
      select coalesce(max(numero), 0) + 1 into v_numero from public.academy_module_versions where module_id = v_mod;
      insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, memo_md)
      select v_mod, v_numero, 'brouillon', titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, ''
        from public.academy_module_versions where module_id = v_mod order by (statut = 'publie') desc, numero desc limit 1
      returning id into v_ver;
    end if;
  end if;
  if exists (select 1 from public.academy_items where version_id = v_ver) then
    return;
  end if;
  update public.academy_module_versions set memo_md = $academy_deck$## La trame du rendez vous d’audit patrimonial

**Durée : 1 h.** Objectif : évaluer la situation patrimoniale globale du client, identifier des leviers d’optimisation, récupérer les documents clés.

[schema:frise]

1. **Accueil et cadrage, 5 min** : présenter le cabinet (indépendance, sur mesure, accompagnement long terme) ; reformuler l’objectif (situation pro et perso, projets, axes d’optimisation) ; confirmer le temps disponible et la disponibilité pour un futur rendez vous.
2. **Situation personnelle et familiale, 10 min** : état civil, régime matrimonial, enfants, succession ; lieu de résidence, résident fiscal français ou non ; objectifs familiaux (protection, transmission, donations).
3. **Situation professionnelle et revenus, 10 min** : profession et statut (salarié, indépendant, société, TNS, libéral) ; revenus annuels nets imposables et revenus du foyer ; régime social, IR ou IS, sociétés détenues.
4. **Patrimoine actuel, 15 min** : immobilier (résidence principale, locatif, SCI, SCPI) ; financier (assurance vie, PER, PEA, CTO, livrets, épargne) ; situation bancaire, crédits, endettement ; épargne retraite, prévoyance, Madelin ou 154 bis ; transmission en cours ou anticipée (donation, usufruit).
5. **Objectifs du client, 10 min** : réduire la fiscalité ; revenus complémentaires ou passifs ; retraite ; structuration de société ou de trésorerie ; transmission ou protection de la famille ; immobilier ou diversification à court ou moyen terme.
6. **Premiers axes de recommandation, 5 min** : structuration à l’IS, holding, dividendes contre rémunération ; ouverture ou arbitrage de contrats (AV, PER, CTO) ; optimisation immobilière (LMNP, déficit foncier, SCPI, MH) ; épargne pro ou perso selon la nature des flux.
7. **Documents à récupérer, 5 min** : un maximum de documents pour lancer l’analyse : dernier avis d’imposition (foyer complet) ; tableau d’actifs ou liste des placements ; relevés AV, PER, PEA, comptes titres ; bilan et liasse fiscale si entrepreneur ; relevé de carrière, tableau de retraite, mutuelle et prévoyance ; situation locative (baux, crédits, loyers perçus).

[schema:documents]
$academy_deck$, competence = coalesce(nullif($academy_deck$Dérouler les sept étapes du rendez vous d’audit patrimonial standard, dans l’ordre et dans le temps imparti$academy_deck$, ''), competence), schemas = $academy_deck$[{"cle":"frise","titre":"Les sept étapes et leurs durées","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les sept étapes et leurs durées</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"36\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Une heure, sept étapes</text>\n<line x1=\"40\" y1=\"72\" x2=\"40\" y2=\"306\" stroke=\"#8A95A8\" stroke-width=\"2\"/>\n<g font-size=\"17\" fill=\"#2C3548\">\n<circle cx=\"40\" cy=\"72\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"77\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">1</text>\n<text x=\"66\" y=\"78\">Accueil et cadrage</text>\n<rect x=\"384\" y=\"60\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"77\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n<circle cx=\"40\" cy=\"111\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"116\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">2</text>\n<text x=\"66\" y=\"117\">Situation personnelle et familiale</text>\n<rect x=\"384\" y=\"99\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"116\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"150\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"155\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">3</text>\n<text x=\"66\" y=\"156\">Situation professionnelle et revenus</text>\n<rect x=\"384\" y=\"138\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"155\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"189\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"194\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">4</text>\n<text x=\"66\" y=\"195\" font-weight=\"700\" fill=\"#162443\">Patrimoine actuel</text>\n<rect x=\"384\" y=\"177\" width=\"234\" height=\"24\" rx=\"8\" fill=\"#C5A55A\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"501\" y=\"194\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">15 min, la plus longue</text>\n<circle cx=\"40\" cy=\"228\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"233\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">5</text>\n<text x=\"66\" y=\"234\">Objectifs du client</text>\n<rect x=\"384\" y=\"216\" width=\"156\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"462\" y=\"233\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">10 min</text>\n<circle cx=\"40\" cy=\"267\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"272\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">6</text>\n<text x=\"66\" y=\"273\">Premiers axes de recommandation</text>\n<rect x=\"384\" y=\"255\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"272\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n<circle cx=\"40\" cy=\"306\" r=\"14\" fill=\"#162443\"/>\n<text x=\"40\" y=\"311\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\">7</text>\n<text x=\"66\" y=\"312\">Documents à récupérer</text>\n<rect x=\"384\" y=\"294\" width=\"78\" height=\"24\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"423\" y=\"311\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"600\">5 min</text>\n</g>\n<text x=\"320\" y=\"348\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">5 + 10 + 10 + 15 + 10 + 5 + 5 = 60 minutes, soit une heure</text>\n</svg>","legende":"Sept étapes pour une heure : le patrimoine actuel prend le quart du temps, les trois étapes de cinq minutes ouvrent et ferment le rendez vous."},{"cle":"documents","titre":"Les six documents à récupérer","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les six documents à récupérer</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"36\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les six documents à récupérer</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"15\" fill=\"#2C3548\">Étape 7, 5 minutes : un maximum de documents pour lancer l’analyse</text>\n<rect x=\"20\" y=\"72\" width=\"600\" height=\"272\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<g font-size=\"17\" fill=\"#2C3548\">\n<rect x=\"40\" y=\"85\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"102\"><tspan font-weight=\"700\" fill=\"#162443\">Dernier avis d’imposition</tspan>, foyer complet</text>\n<rect x=\"40\" y=\"129\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"146\"><tspan font-weight=\"700\" fill=\"#162443\">Tableau d’actifs</tspan>, sinon la liste des placements</text>\n<rect x=\"40\" y=\"173\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"190\"><tspan font-weight=\"700\" fill=\"#162443\">Relevés</tspan> d’assurance vie, PER, PEA, comptes titres</text>\n<rect x=\"40\" y=\"217\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"234\"><tspan font-weight=\"700\" fill=\"#162443\">Bilan et liasse fiscale</tspan>, si entrepreneur</text>\n<rect x=\"40\" y=\"261\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"278\"><tspan font-weight=\"700\" fill=\"#162443\">Relevé de carrière</tspan>, tableau de retraite, mutuelle, prévoyance</text>\n<rect x=\"40\" y=\"305\" width=\"22\" height=\"22\" rx=\"4\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"76\" y=\"322\"><tspan font-weight=\"700\" fill=\"#162443\">Situation locative</tspan> : baux, crédits, loyers perçus</text>\n</g>\n</svg>","legende":"Six familles de documents à demander à la dernière étape : plus le client en apporte, plus vite l’analyse démarre."}]$academy_deck$::jsonb, updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$ordre$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"enonce":"Remets les sept étapes de la trame dans l’ordre.","elements":["Accueil et cadrage","Documents à récupérer","Objectifs du client","Situation professionnelle et revenus","Premiers axes de recommandation","Patrimoine actuel","Situation personnelle et familiale"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,6,3,5,2,4,1]}$academy_deck$::jsonb, $academy_deck$Accueil, situation personnelle, situation professionnelle, patrimoine, objectifs, axes, documents.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$ordre$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 2, $academy_deck${"enonce":"Remets dans l’ordre les quatre premières étapes.","elements":["Situation personnelle et familiale","Accueil et cadrage","Situation professionnelle et revenus","Patrimoine actuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[1,0,2,3]}$academy_deck$::jsonb, $academy_deck$On cadre, puis la famille, puis le professionnel, puis le patrimoine.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$ordre$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 2, $academy_deck${"enonce":"Remets dans l’ordre les trois dernières étapes.","elements":["Premiers axes de recommandation","Objectifs du client","Documents à récupérer"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[1,0,2]}$academy_deck$::jsonb, $academy_deck$Objectifs, premiers axes, puis les documents pour lancer l’analyse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$ordre$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Remets dans l’ordre de la trame les points de l’étape Patrimoine actuel.","elements":["Immobilier","Situation bancaire et crédits","Transmission en cours ou anticipée","Financier","Épargne retraite et prévoyance"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,3,1,4,2]}$academy_deck$::jsonb, $academy_deck$Immobilier, financier, bancaire, retraite et prévoyance, transmission.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$association$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"Associe chaque étape à sa durée.","gauche":["Accueil et cadrage","Patrimoine actuel","Objectifs du client"],"droite":["10 min","5 min","15 min"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,1],[1,2],[2,0]]}$academy_deck$::jsonb, $academy_deck$Accueil 5 minutes, patrimoine 15, objectifs 10.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$multi$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Coche les étapes qui durent cinq minutes.","choix":["Accueil et cadrage","Situation personnelle et familiale","Premiers axes de recommandation","Documents à récupérer","Patrimoine actuel"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,2,3]}$academy_deck$::jsonb, $academy_deck$Trois étapes de cinq minutes : accueil, premiers axes, documents.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$association$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"Associe chaque point à son étape.","gauche":["Régime matrimonial","Revenus annuels nets imposables","Encours de crédits","Dernier avis d’imposition"],"droite":["Documents à récupérer","Situation personnelle et familiale","Situation professionnelle et revenus","Patrimoine actuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,1],[1,2],[2,3],[3,0]]}$academy_deck$::jsonb, $academy_deck$Le régime matrimonial est familial, les revenus sont professionnels, les crédits sont du patrimoine, l’avis est un document.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$association$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"enonce":"Associe chaque exemple à son axe de recommandation.","gauche":["Création de holding","Arbitrage d’un contrat","LMNP","Épargne pro ou perso"],"droite":["Structuration à l’IS","Selon la nature des flux","Ouverture ou arbitrage de contrats","Optimisation immobilière"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,2],[2,3],[3,1]]}$academy_deck$::jsonb, $academy_deck$Les quatre axes de la trame : IS et holding, contrats, immobilier, épargne selon les flux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$multi$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"Coche tout ce qui appartient à l’étape Situation personnelle et familiale.","choix":["État civil","Régime matrimonial","Statut professionnel","Objectifs familiaux","Encours de crédits","Résident fiscal en France ou non"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3,5]}$academy_deck$::jsonb, $academy_deck$État civil, régime matrimonial, résidence et fiscalité, objectifs familiaux ; le statut et les crédits viennent après.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$multi$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"Coche tout ce qui appartient à l’étape Situation professionnelle et revenus.","choix":["Profession et statut","Revenus du foyer","Régime social","Sociétés détenues","Régime matrimonial","Relevé de carrière"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Profession, revenus, régime social, fiscalité IR ou IS et sociétés ; le relevé de carrière est un document à récupérer.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$multi$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Coche tout ce qui relève du patrimoine financier dans la trame.","choix":["Assurance vie","PER","SCI","PEA","CTO","Livrets"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3,4,5]}$academy_deck$::jsonb, $academy_deck$La SCI est classée dans l’immobilier ; assurance vie, PER, PEA, CTO, livrets et épargne sont le financier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$multi$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Coche tout ce qui relève de l’immobilier dans la trame.","choix":["Résidence principale","Locatif","SCI","SCPI","PEA","Livrets"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Résidence principale, locatif, SCI et SCPI.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$multi$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 1, $academy_deck${"enonce":"Coche les documents à récupérer selon la trame.","choix":["Dernier avis d’imposition","Relevés d’assurance vie, PER, PEA, comptes titres","Carte d’identité du conjoint","Bilan et liasse fiscale si entrepreneur","Relevé de carrière","Ticket de caisse du dernier achat"],"figure":{"ref":"documents"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3,4]}$academy_deck$::jsonb, $academy_deck$Avis d’imposition, relevés de contrats, bilan et liasse, relevé de carrière ; la trame ne cite ni pièce d’identité ni ticket.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$multi$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Coche ce que la trame demande pour la situation locative.","choix":["Baux","Crédits","Loyers perçus","Photos du bien","Diagnostic énergétique"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Baux, crédits, loyers perçus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$multi$academy_deck$, $academy_deck$Les objectifs du client$academy_deck$, 2, $academy_deck${"enonce":"Coche les objectifs listés à l’étape 5.","choix":["Réduction de la fiscalité","Création de revenus complémentaires ou passifs","Préparation de la retraite","Changement de banque","Transmission ou protection de la famille","Immobilier ou diversification à court ou moyen terme"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2,4,5]}$academy_deck$::jsonb, $academy_deck$Six objectifs dans la trame ; changer de banque n’en fait pas partie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$multi$academy_deck$, $academy_deck$L’accueil et le cadrage$academy_deck$, 2, $academy_deck${"enonce":"Coche les trois marqueurs de l’approche du cabinet à présenter à l’accueil.","choix":["Indépendance","Sur mesure","Accompagnement long terme","Frais les plus bas du marché","Rendement garanti"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Indépendance, sur mesure, accompagnement long terme.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"Combien de temps dure le rendez vous d’audit patrimonial standard ?","choix":["30 minutes","45 minutes","1 heure","1 heure 30"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$La trame prévoit une heure.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$choix$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"enonce":"Combien d’étapes compte la trame ?","choix":["5","6","7","8"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Sept étapes, de l’accueil aux documents.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"Quelle est l’étape la plus longue ?","choix":["Situation personnelle et familiale","Patrimoine actuel","Objectifs du client","Documents à récupérer"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le patrimoine actuel prend quinze minutes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$choix$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"enonce":"Quelle est la dernière étape de la trame ?","choix":["Premiers axes de recommandation","Objectifs du client","Documents à récupérer","Patrimoine actuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$On termine par les documents, pour lancer l’analyse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$choix$academy_deck$, $academy_deck$L’accueil et le cadrage$academy_deck$, 2, $academy_deck${"enonce":"Quel est l’objectif de l’échange, tel qu’on le reformule à l’accueil ?","choix":["Vendre un contrat adapté","Comprendre la situation pro et perso, les projets et les axes d’optimisation","Signer un mandat de gestion","Comparer les frais des contrats en place"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$On reformule : comprendre la situation, les projets, les axes d’optimisation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$choix$academy_deck$, $academy_deck$L’accueil et le cadrage$academy_deck$, 2, $academy_deck${"enonce":"Que confirme t on à la fin de l’accueil ?","choix":["Le montant à investir","Le temps disponible et la disponibilité pour un futur rendez vous","Le choix de la compagnie","Le régime matrimonial"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le temps disponible aujourd’hui et la disponibilité du client pour la suite.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$choix$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"À quelle étape demande t on si le client est résident fiscal français ?","choix":["Accueil et cadrage","Situation personnelle et familiale","Situation professionnelle et revenus","Patrimoine actuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Lieu de résidence et fiscalité applicable sont dans la situation personnelle et familiale.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$choix$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"À quelle étape parle t on de régime social et d’IR ou IS ?","choix":["Situation personnelle et familiale","Situation professionnelle et revenus","Objectifs du client","Premiers axes de recommandation"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Régime social, fiscalité IR ou IS et sociétés détenues : étape professionnelle.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$choix$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Dans quel bloc du patrimoine actuel classe t on la SCPI ?","choix":["Immobilier","Financier","Situation bancaire","Épargne retraite"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Immobilier : résidence principale, locatif, SCI, SCPI.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$choix$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Que demande t on sur la transmission à l’étape Patrimoine actuel ?","choix":["Le montant des droits payés","Si une transmission est en cours ou anticipée, donation ou usufruit par exemple","Le nom du notaire","La date du dernier testament"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Transmission en cours ou anticipée ? Donation, usufruit, etc.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$choix$academy_deck$, $academy_deck$Les objectifs du client$academy_deck$, 2, $academy_deck${"enonce":"Lequel de ces objectifs figure dans la trame ?","choix":["Structuration de société ou de trésorerie","Obtenir un crédit immobilier","Ouvrir un compte à l’étranger","Changer d’assureur auto"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Structuration de société ou de trésorerie est un des six objectifs.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$choix$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"enonce":"Quel axe regroupe holding, IS et dividendes contre rémunération ?","choix":["Optimisation immobilière","Structuration à l’IS","Ouverture ou arbitrage de contrats","Épargne pro ou perso"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Structuration à l’IS, création de holding, stratégie dividendes contre rémunération.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$choix$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"enonce":"Selon la trame, de quoi dépend le choix entre épargne pro et épargne perso ?","choix":["De l’âge du client","De la nature des flux","Du nombre d’enfants","De la banque du client"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Épargne pro ou perso selon la nature des flux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 1, $academy_deck${"enonce":"Quel est l’objectif affiché de l’étape Documents ?","choix":["Vérifier l’identité du client","Récupérer un maximum de documents pour lancer l’analyse","Faire signer le mandat","Estimer les frais"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Important : récupérer un maximum de documents pour lancer l’analyse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Quel avis d’imposition demande t on ?","choix":["Le dernier, pour le foyer complet","Celui du client seul","Les trois derniers","Celui de l’année de mariage"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le dernier avis d’imposition, foyer complet.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Quels documents demande t on à un entrepreneur ?","choix":["Bilan et liasse fiscale","Kbis et statuts","Contrat de bail commercial","Attestation URSSAF"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Bilan et liasse fiscale, si entrepreneur.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Que demande t on pour la retraite ?","choix":["Relevé de carrière et tableau de retraite","Carte Vitale","Bulletins de salaire des cinq dernières années","Contrat de travail"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Relevé de carrière, tableau de retraite, mutuelle et prévoyance.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"L’accueil et le cadrage durent cinq minutes."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Cinq minutes, comme les axes et les documents.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"enonce":"Les objectifs du client prennent quinze minutes."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Dix minutes ; c’est le patrimoine actuel qui en prend quinze.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Les sept étapes additionnées font une heure."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$5 + 10 + 10 + 15 + 10 + 5 + 5 = 60 minutes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$vrai_faux$academy_deck$, $academy_deck$L’accueil et le cadrage$academy_deck$, 2, $academy_deck${"enonce":"À l’accueil, on présente l’indépendance, le sur mesure et l’accompagnement long terme du cabinet."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Ce sont les trois marqueurs de l’approche à présenter.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"enonce":"Les enfants et la succession se traitent à l’étape Situation professionnelle et revenus."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$État civil, régime matrimonial, enfants, succession : étape personnelle et familiale.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"enonce":"Le niveau d’endettement fait partie de l’étape Patrimoine actuel."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Situation bancaire, encours de crédits, niveau d’endettement.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"enonce":"Le déficit foncier est cité parmi les optimisations immobilières."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$LMNP, déficit foncier, SCPI, MH, etc.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 41, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 1, $academy_deck${"enonce":"La situation locative se documente avec les baux, les crédits et les loyers perçus."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$C’est le dernier point de la liste des documents.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 42, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"enonce":"Si le client n’a pas de tableau d’actifs, on ne demande rien d’autre.","figure":{"ref":"documents"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Tableau d’actifs si existant, sinon la liste des placements.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 43, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Les objectifs du client$academy_deck$, 2, $academy_deck${"enonce":"La préparation de la retraite fait partie des objectifs à explorer."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Un des six objectifs de l’étape 5.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 44, $academy_deck$trou_choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"phrase":"Durée du rendez vous : ___.","choix":["1 h","45 min","2 h","30 min"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une heure.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 45, $academy_deck$trou_choix$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"phrase":"Épargne retraite, prévoyance, contrats Madelin ou ___ bis.","choix":["154","163","83","62"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Contrats Madelin ou 154 bis.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 46, $academy_deck$trou_choix$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"phrase":"Stratégie ___ contre rémunération.","choix":["dividendes","holding","donation","usufruit"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Stratégie dividendes contre rémunération, dans l’axe structuration à l’IS.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 47, $academy_deck$trou_choix$academy_deck$, $academy_deck$Ce qu’on demande à chaque étape$academy_deck$, 2, $academy_deck${"phrase":"Revenus annuels nets ___ et revenus du foyer.","choix":["imposables","bruts","exonérés","différés"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Revenus annuels nets imposables.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 48, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Les durées$academy_deck$, 1, $academy_deck${"phrase":"Le patrimoine actuel dure ___ minutes.","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["15","quinze"]}$academy_deck$::jsonb, $academy_deck$Quinze minutes, l’étape la plus longue.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 49, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Le patrimoine actuel$academy_deck$, 2, $academy_deck${"phrase":"Contrats Madelin ou ___ bis.","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["154"]}$academy_deck$::jsonb, $academy_deck$154 bis.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 50, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"phrase":"La trame compte ___ étapes.","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["7","sept"]}$academy_deck$::jsonb, $academy_deck$Sept étapes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 51, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Les premiers axes$academy_deck$, 2, $academy_deck${"phrase":"Structuration à l’___, création de holding.","aide":"deux lettres"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["IS","is","impot sur les societes","impôt sur les sociétés"]}$academy_deck$::jsonb, $academy_deck$Structuration à l’IS.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 52, $academy_deck$carte$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"recto":"Étape 1 de la trame ?","verso":"Accueil et cadrage, 5 minutes"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Première étape.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 53, $academy_deck$carte$academy_deck$, $academy_deck$Les sept étapes$academy_deck$, 1, $academy_deck${"recto":"Étape 4 de la trame ?","verso":"Patrimoine actuel, 15 minutes"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Quatrième étape, la plus longue.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 54, $academy_deck$carte$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 1, $academy_deck${"recto":"Les six documents à récupérer ?","verso":"Avis d’imposition, tableau d’actifs ou liste des placements, relevés de contrats, bilan et liasse, relevé de carrière et retraite, situation locative"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$La liste de l’étape 7.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 55, $academy_deck$carte$academy_deck$, $academy_deck$L’accueil et le cadrage$academy_deck$, 1, $academy_deck${"recto":"Objectif global du rendez vous ?","verso":"Évaluer la situation patrimoniale globale, identifier des leviers d’optimisation, récupérer les documents clés"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L’objectif en tête de trame.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 56, $academy_deck$choix$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, combien de minutes se sont écoulées quand commence l’étape Patrimoine actuel ?","choix":["15 minutes","25 minutes","30 minutes","40 minutes"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Accueil 5, situation personnelle 10, situation professionnelle 10 : le patrimoine actuel commence à la 25e minute et occupe ensuite le quart du rendez vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 57, $academy_deck$multi$academy_deck$, $academy_deck$Les durées$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, coche les étapes qui durent dix minutes.","choix":["Situation personnelle et familiale","Situation professionnelle et revenus","Patrimoine actuel","Objectifs du client","Documents à récupérer"],"figure":{"ref":"frise"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Trois étapes de dix minutes : la situation personnelle, la situation professionnelle et les objectifs ; le patrimoine en prend quinze, les documents cinq.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 58, $academy_deck$trou_choix$academy_deck$, $academy_deck$Les documents à récupérer$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma, la ligne qui commence par le relevé de carrière regroupe aussi ___.","choix":["le tableau de retraite, la mutuelle et la prévoyance","le bilan et la liasse fiscale","les baux, les crédits et les loyers perçus","les relevés d’assurance vie et de PER"],"figure":{"ref":"documents"}}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une seule ligne de la liste porte la retraite et la protection : relevé de carrière, tableau de retraite, mutuelle, prévoyance. La mutuelle et la prévoyance se demandent donc en même temps que les pièces de retraite.$academy_deck$);
  -- La trame ouvre le parcours Integration.
  select id into v_p from public.academy_parcours where slug = 'integration-30-jours';
  if v_p is not null then
    insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
    values (v_p, v_mod, 0, true, 7) on conflict (parcours_id, module_id) do nothing;
  end if;
end
$deck_trame_rendez_vous_audit$;
