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

-- ── Schemas : La méthode Entasis (methode-entasis) ──
do $schemas_methode_entasis$
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$methode-entasis$academy_deck$;
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', $academy_deck$methode-entasis$academy_deck$;
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', $academy_deck$methode-entasis$academy_deck$;
    return;
  end if;
  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := $academy_deck$[{"cle":"trois_temps","titre":"Les trois temps de la méthode Entasis","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les trois temps de la méthode Entasis</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les trois temps de la méthode Entasis</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"14\" fill=\"#8A95A8\">Une stratégie d’ensemble, pas une collection de produits</text>\n<line x1=\"110\" y1=\"92\" x2=\"530\" y2=\"92\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<g font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\" text-anchor=\"middle\">\n<circle cx=\"110\" cy=\"92\" r=\"16\" fill=\"#162443\"/>\n<text x=\"110\" y=\"98\">1</text>\n<circle cx=\"320\" cy=\"92\" r=\"16\" fill=\"#162443\"/>\n<text x=\"320\" y=\"98\">2</text>\n<circle cx=\"530\" cy=\"92\" r=\"16\" fill=\"#162443\"/>\n<text x=\"530\" y=\"98\">3</text>\n</g>\n<g fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\">\n<rect x=\"10\" y=\"124\" width=\"200\" height=\"176\" rx=\"8\"/>\n<rect x=\"220\" y=\"124\" width=\"200\" height=\"176\" rx=\"8\"/>\n<rect x=\"430\" y=\"124\" width=\"200\" height=\"176\" rx=\"8\"/>\n</g>\n<g stroke=\"#C5A55A\" stroke-width=\"2\">\n<line x1=\"50\" y1=\"166\" x2=\"170\" y2=\"166\"/>\n<line x1=\"260\" y1=\"166\" x2=\"380\" y2=\"166\"/>\n<line x1=\"470\" y1=\"166\" x2=\"590\" y2=\"166\"/>\n</g>\n<g font-size=\"18\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"110\" y=\"154\">Écoute</text>\n<text x=\"320\" y=\"154\">Étude</text>\n<text x=\"530\" y=\"154\">Accompagnement</text>\n</g>\n<g font-size=\"14\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"110\" y=\"190\">Premier entretien</text>\n<text x=\"110\" y=\"208\">de 30 minutes</text>\n<text x=\"110\" y=\"226\">confidentiel,</text>\n<text x=\"110\" y=\"244\">sans engagement</text>\n<text x=\"320\" y=\"190\">Analyse complète</text>\n<text x=\"320\" y=\"208\">du patrimoine</text>\n<text x=\"320\" y=\"226\">Feuille de route</text>\n<text x=\"320\" y=\"244\">argumentée et chiffrée</text>\n<text x=\"530\" y=\"190\">Un conseiller dédié</text>\n<text x=\"530\" y=\"208\">Un point annuel formel</text>\n<text x=\"530\" y=\"226\">Changement de vie :</text>\n<text x=\"530\" y=\"244\">l’étude est mise à jour</text>\n</g>\n<g font-size=\"14\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"110\" y=\"270\">Comprendre,</text>\n<text x=\"110\" y=\"288\">pas proposer</text>\n<text x=\"320\" y=\"270\">Les solutions</text>\n<text x=\"320\" y=\"288\">n’arrivent qu’ici</text>\n<text x=\"530\" y=\"270\">Ajuster</text>\n<text x=\"530\" y=\"288\">dans la durée</text>\n</g>\n<rect x=\"10\" y=\"308\" width=\"620\" height=\"46\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"327\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">Aucune solution avant l’étude</text>\n<text x=\"320\" y=\"346\" text-anchor=\"middle\" font-size=\"14\" fill=\"#2C3548\">Une demande de produit est notée, reportée à l’étude, ni acceptée ni rejetée.</text>\n</svg>","legende":"Écoute, étude, accompagnement : on comprend avant de proposer, on argumente et on chiffre, puis on ajuste dans la durée. Aucune solution ne précède l’étude."},{"cle":"ordre_etude","titre":"L’étude, dans l’ordre","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>L’étude, dans l’ordre</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">L’étude, dans l’ordre</text>\n<polygon points=\"310,278 310,172 460,172 460,130 630,130 630,278\" fill=\"#F5EDD8\"/>\n<polyline points=\"10,278 10,256 160,256 160,214 310,214 310,172 460,172 460,130 630,130 630,278 10,278\" fill=\"none\" stroke=\"#162443\" stroke-width=\"2\"/>\n<g fill=\"#162443\">\n<circle cx=\"85\" cy=\"190\" r=\"13\"/>\n<circle cx=\"235\" cy=\"148\" r=\"13\"/>\n<circle cx=\"385\" cy=\"106\" r=\"13\"/>\n<circle cx=\"545\" cy=\"64\" r=\"13\"/>\n</g>\n<g font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\" text-anchor=\"middle\">\n<text x=\"85\" y=\"195\">1</text>\n<text x=\"235\" y=\"153\">2</text>\n<text x=\"385\" y=\"111\">3</text>\n<text x=\"545\" y=\"69\">4</text>\n</g>\n<g font-size=\"17\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"85\" y=\"216\">Diagnostic</text>\n<text x=\"235\" y=\"174\">Objectifs</text>\n<text x=\"385\" y=\"132\">Stratégie</text>\n<text x=\"545\" y=\"90\">Moyens</text>\n</g>\n<g font-size=\"13\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"85\" y=\"234\">Où en est le client ?</text>\n<text x=\"85\" y=\"250\">le bilan patrimonial</text>\n<text x=\"235\" y=\"192\">Où aller ?</text>\n<text x=\"235\" y=\"208\">hiérarchisés, datés</text>\n<text x=\"385\" y=\"150\">Comment y aller ?</text>\n<text x=\"385\" y=\"166\">le cap, puis les moyens</text>\n<text x=\"545\" y=\"108\">Les solutions</text>\n<text x=\"545\" y=\"124\">au service d’un objectif</text>\n</g>\n<text x=\"470\" y=\"236\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#162443\">Les solutions arrivent ici seulement</text>\n<rect x=\"10\" y=\"294\" width=\"620\" height=\"48\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"314\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">Pour chaque recommandation</text>\n<text x=\"320\" y=\"333\" text-anchor=\"middle\" font-size=\"14\" fill=\"#2C3548\">objectif servi, chiffre, contrainte, risque, scénario défavorable</text>\n</svg>","legende":"Diagnostic, objectifs hiérarchisés, stratégie, puis moyens : les solutions n’arrivent qu’aux deux dernières marches, chacune au service d’un objectif."}]$academy_deck$::jsonb;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;
  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;
  if v_max >= 2 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"trois_temps"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 2 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un dirigeant ouvre le premier entretien par : « Quel placement me conseillez-vous ? » Quelle réponse correspond à la méthode Entasis ?","choix":["Présenter l'assurance vie, enveloppe souple qui convient à la plupart des situations.","Lui demander d'utiliser le simulateur en ligne et de revenir avec le résultat.","Expliquer que la recommandation viendra après l'écoute et l'étude, puis poser des questions sur sa situation et ses projets.","Refuser de poursuivre tant qu'il n'a pas signé un document d'entrée en relation."],"figure":{"ref":"trois_temps"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'écoute précède toute proposition : la demande est accueillie, notée, puis le conseiller recueille situation, projets, horizon et rapport au risque.$academy_deck$);
  end if;
  if v_max >= 7 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"trois_temps"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 7 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Après le premier entretien, le client écrit : « Envoyez-moi juste le bulletin de souscription, on verra l'étude plus tard. » Que faites-vous ?","choix":["Envoyer le bulletin pour ne pas perdre le client ; l'étude suivra.","Faire signer une décharge de responsabilité, puis envoyer le bulletin.","Expliquer que l'étude chiffrée protège sa décision, proposer une date de restitution proche, et tracer l'échange.","Transmettre le dossier à un collègue plus expérimenté sans répondre."],"figure":{"ref":"trois_temps"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Aucune recommandation ne précède l'étude ; on répond à la pression de calendrier par une date de restitution, et une décharge ne remplace pas l'analyse.$academy_deck$);
  end if;
  if v_max >= 10 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"ordre_etude"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 10 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un gérant majoritaire de 55 ans veut préparer sa retraite et réduire son impôt. L'écoute révèle qu'il n'a aucune prévoyance et que ses revenus chuteraient fortement en cas d'arrêt de travail. Quelle hiérarchie l'étude retient-elle ?","choix":["Réduire l'impôt, puis organiser l'épargne retraite, puis protéger les revenus.","Organiser l'épargne retraite, puis réduire l'impôt, puis protéger les revenus.","Protéger les revenus, puis organiser l'épargne retraite, puis traiter la fiscalité.","Traiter les trois volets en parallèle, sans hiérarchie, pour respecter la demande du client."],"figure":{"ref":"ordre_etude"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'étude hiérarchise les objectifs : le point aveugle révélé à l'écoute passe en premier et la demande initiale, réduire l'impôt, arrive en troisième position.$academy_deck$);
  end if;
  if v_max >= 31 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"ordre_etude"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 31 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 1, $academy_deck${"phrase":"Dans l'étude, les solutions n'apparaissent qu'à l'étape ___, comme des moyens au service d'un objectif.","choix":["du diagnostic","des objectifs","de la stratégie","de l'écoute"],"figure":{"ref":"ordre_etude"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Les solutions n'apparaissent qu'au stade de la stratégie, après le diagnostic et les objectifs hiérarchisés.$academy_deck$);
  end if;
  if v_max >= 41 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"trois_temps"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 41 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 41, $academy_deck$choix$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma des trois temps, dans quel temps apparaît pour la première fois une recommandation chiffrée ?","choix":["Dans l’écoute, dès que le client a exposé sa demande.","Dans l’étude, avec la feuille de route argumentée et chiffrée.","Dans l’accompagnement, au point annuel.","Dans aucun des trois : le chiffre vient du gestionnaire du contrat."],"figure":{"ref":"trois_temps"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le schéma le dit sous le deuxième temps : les solutions n’arrivent qu’ici, dans une feuille de route argumentée et chiffrée ; l’écoute comprend sans proposer, l’accompagnement ajuste.$academy_deck$);
  end if;
  if v_max >= 42 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"ordre_etude"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 42 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 42, $academy_deck$multi$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma de l’étude, cochez tout ce qui est déjà établi quand le conseiller atteint la marche « Stratégie ».","choix":["Le diagnostic : où en est le client","La hiérarchie des objectifs de vie","L’horizon de chaque objectif","Le choix des solutions","Le chiffre de chaque recommandation","Le scénario défavorable de chaque solution"],"figure":{"ref":"ordre_etude"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Avant la stratégie, l’étude a posé le diagnostic et hiérarchisé les objectifs avec leur horizon ; solutions, chiffres et scénarios n’arrivent qu’aux deux dernières marches.$academy_deck$);
  end if;
  if v_max >= 43 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"trois_temps"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 43 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 43, $academy_deck$trou_choix$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma des trois temps, une cession d’entreprise annoncée au point annuel renvoie le dossier au temps de l’___ : la feuille de route est mise à jour, sans réponse immédiate.","choix":["écoute","étude","accompagnement","entrée en relation"],"figure":{"ref":"trois_temps"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le troisième temps porte la mention « Changement de vie : l’étude est mise à jour » : un événement de vie relance le deuxième temps avant toute proposition, le point annuel ne se transforme pas en rendez vous de vente.$academy_deck$);
  end if;
end
$schemas_methode_entasis$;
