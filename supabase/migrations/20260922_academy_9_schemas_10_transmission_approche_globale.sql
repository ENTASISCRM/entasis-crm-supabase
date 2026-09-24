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

-- ── Schemas : Transmission et approche globale (transmission-approche-globale) ──
do $schemas_transmission_approche_globale$
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$transmission-approche-globale$academy_deck$;
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', $academy_deck$transmission-approche-globale$academy_deck$;
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', $academy_deck$transmission-approche-globale$academy_deck$;
    return;
  end if;
  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := $academy_deck$[{"cle":"reserve_quotite","titre":"Réserve et quotité selon le nombre d’enfants","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Réserve et quotité selon le nombre d’enfants</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Réserve et quotité selon le nombre d’enfants</text>\n<text x=\"320\" y=\"56\" text-anchor=\"middle\" font-size=\"14\" fill=\"#8A95A8\">Chaque barre est la totalité de la succession</text>\n<rect x=\"170\" y=\"70\" width=\"14\" height=\"14\" rx=\"3\" fill=\"#162443\"/>\n<text x=\"192\" y=\"82\" font-size=\"14\" fill=\"#2C3548\">Réserve héréditaire, garantie aux enfants</text>\n<rect x=\"470\" y=\"70\" width=\"14\" height=\"14\" rx=\"3\" fill=\"#C5A55A\"/>\n<text x=\"492\" y=\"82\" font-size=\"14\" fill=\"#2C3548\">Quotité disponible</text>\n<g font-size=\"15\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"end\">\n<text x=\"150\" y=\"128\">Un enfant</text>\n<text x=\"150\" y=\"188\">Deux enfants</text>\n<text x=\"150\" y=\"240\">Trois enfants</text>\n<text x=\"150\" y=\"258\">et plus</text>\n</g>\n<g fill=\"#C5A55A\" stroke=\"#162443\" stroke-width=\"2\">\n<rect x=\"170\" y=\"100\" width=\"460\" height=\"44\" rx=\"8\"/>\n<rect x=\"170\" y=\"160\" width=\"460\" height=\"44\" rx=\"8\"/>\n<rect x=\"170\" y=\"220\" width=\"460\" height=\"44\" rx=\"8\"/>\n</g>\n<g fill=\"#162443\">\n<path d=\"M178,100 H400 V144 H178 A8,8 0 0 1 170,136 V108 A8,8 0 0 1 178,100 Z\"/>\n<path d=\"M178,160 H477 V204 H178 A8,8 0 0 1 170,196 V168 A8,8 0 0 1 178,160 Z\"/>\n<path d=\"M178,220 H515 V264 H178 A8,8 0 0 1 170,256 V228 A8,8 0 0 1 178,220 Z\"/>\n</g>\n<g font-size=\"15\" font-weight=\"700\" fill=\"#FFFFFF\" text-anchor=\"middle\">\n<text x=\"285\" y=\"127\">la moitié</text>\n<text x=\"323\" y=\"187\">les deux tiers</text>\n<text x=\"342\" y=\"247\">les trois quarts</text>\n</g>\n<g font-size=\"15\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"515\" y=\"127\">la moitié</text>\n<text x=\"553\" y=\"187\">le tiers</text>\n<text x=\"572\" y=\"247\">le quart</text>\n</g>\n<rect x=\"10\" y=\"290\" width=\"620\" height=\"60\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"314\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">La quotité disponible est la seule part que l’on attribue librement</text>\n<text x=\"320\" y=\"336\" text-anchor=\"middle\" font-size=\"14\" fill=\"#2C3548\">Partenaire de PACS et concubin : aucun droit sans testament</text>\n</svg>","legende":"Un enfant : la moitié ; deux : les deux tiers ; trois et plus : les trois quarts sont réservés aux enfants. Le reste, la quotité disponible, est la seule part que l’on attribue librement ; sans testament, partenaire de PACS et concubin n’ont rien."},{"cle":"six_volets","titre":"Les six volets du bilan de transmission","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les six volets du bilan de transmission</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les six volets du bilan de transmission</text>\n<text x=\"320\" y=\"56\" text-anchor=\"middle\" font-size=\"14\" fill=\"#8A95A8\">La photographie complète, avant toute recommandation</text>\n<g fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\">\n<rect x=\"10\" y=\"70\" width=\"305\" height=\"66\" rx=\"8\"/>\n<rect x=\"325\" y=\"70\" width=\"305\" height=\"66\" rx=\"8\"/>\n<rect x=\"10\" y=\"146\" width=\"305\" height=\"66\" rx=\"8\"/>\n<rect x=\"325\" y=\"146\" width=\"305\" height=\"66\" rx=\"8\"/>\n<rect x=\"10\" y=\"222\" width=\"305\" height=\"66\" rx=\"8\"/>\n<rect x=\"325\" y=\"222\" width=\"305\" height=\"66\" rx=\"8\"/>\n</g>\n<g fill=\"#162443\">\n<circle cx=\"36\" cy=\"103\" r=\"13\"/>\n<circle cx=\"351\" cy=\"103\" r=\"13\"/>\n<circle cx=\"36\" cy=\"179\" r=\"13\"/>\n<circle cx=\"351\" cy=\"179\" r=\"13\"/>\n<circle cx=\"36\" cy=\"255\" r=\"13\"/>\n<circle cx=\"351\" cy=\"255\" r=\"13\"/>\n</g>\n<g font-size=\"14\" font-weight=\"700\" fill=\"#FFFFFF\" text-anchor=\"middle\">\n<text x=\"36\" y=\"108\">1</text>\n<text x=\"351\" y=\"108\">2</text>\n<text x=\"36\" y=\"184\">3</text>\n<text x=\"351\" y=\"184\">4</text>\n<text x=\"36\" y=\"260\">5</text>\n<text x=\"351\" y=\"260\">6</text>\n</g>\n<g font-size=\"16\" font-weight=\"700\" fill=\"#162443\">\n<text x=\"58\" y=\"93\">Situation civile</text>\n<text x=\"373\" y=\"93\">Donations passées</text>\n<text x=\"58\" y=\"169\">Assurance vie</text>\n<text x=\"373\" y=\"169\">Biens et dettes</text>\n<text x=\"58\" y=\"245\">Entreprise</text>\n<text x=\"373\" y=\"245\">Volontés écrites</text>\n</g>\n<g font-size=\"13\" fill=\"#2C3548\">\n<text x=\"58\" y=\"111\">Régime matrimonial, première union</text>\n<text x=\"373\" y=\"111\">Déjà donné : à qui, quand, combien</text>\n<text x=\"58\" y=\"187\">Clauses et âge de versement des primes</text>\n<text x=\"373\" y=\"187\">Ce que l’on possède, ce que l’on doit</text>\n<text x=\"58\" y=\"263\">Valorisée par l’expert comptable</text>\n<text x=\"373\" y=\"263\">Testament, donation entre époux</text>\n</g>\n<g font-size=\"13\" fill=\"#8A95A8\">\n<text x=\"58\" y=\"128\">Livret de famille, contrat de mariage</text>\n<text x=\"373\" y=\"128\">Actes des donations antérieures</text>\n<text x=\"58\" y=\"204\">Relevés et clauses des contrats</text>\n<text x=\"373\" y=\"204\">Titres de propriété, avis d’imposition</text>\n<text x=\"58\" y=\"280\">Statuts de société, comptes</text>\n<text x=\"373\" y=\"280\">Ce qui est déjà décidé et signé</text>\n</g>\n<rect x=\"10\" y=\"298\" width=\"620\" height=\"52\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"319\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">Pas de bilan, pas de chiffre</text>\n<text x=\"320\" y=\"339\" text-anchor=\"middle\" font-size=\"14\" fill=\"#2C3548\">Sans les pièces : un second rendez vous, jamais un chiffre</text>\n</svg>","legende":"Situation civile, donations passées, assurance vie, biens et dettes, entreprise, volontés écrites : chaque volet se lit dans ses pièces avant tout chiffre. Sans les pièces, on propose un second rendez vous, pas une solution."}]$academy_deck$::jsonb;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;
  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;
  if v_max >= 11 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reserve_quotite"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 11 and type = $academy_deck$trou_saisie$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 11, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 3, $academy_deck${"phrase":"Cas fictif : une veuve laisse 600 000 euros et trois enfants. Par testament, elle peut attribuer librement à une amie au plus ___ euros.","aide":"quotité disponible","figure":{"ref":"reserve_quotite"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["150 000","150000","150 000 euros","150000 euros","150.000"]}$academy_deck$::jsonb, $academy_deck$Trois enfants : réserve des trois quarts, soit 450 000 euros ; la quotité disponible est le quart, 150 000 euros.$academy_deck$);
  end if;
  if v_max >= 13 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reserve_quotite"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 13 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 13, $academy_deck$choix$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : un couple marié, deux enfants communs, veut « tout laisser au conjoint survivant, les enfants verront après ». Quelle réponse est la plus juste ?","choix":["C'est possible sans limite, un testament suffit","En présence d'enfants, une part leur est réservée par la loi ; le souhait s'étudie dans ce cadre, avec le notaire","Il suffit de placer tout le patrimoine sur un contrat d'assurance vie au profit du conjoint","Le conjoint marié hérite automatiquement de la totalité, aucun acte n'est utile"],"figure":{"ref":"reserve_quotite"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Deux enfants : les deux tiers des biens leur sont réservés ; le souhait s'inscrit dans ce cadre et demande un acte.$academy_deck$);
  end if;
  if v_max >= 15 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"six_volets"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 15 and type = $academy_deck$ordre$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 15, $academy_deck$ordre$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la démarche du cabinet face à un projet de transmission.","elements":["Établir la photographie complète sur les six volets","Évoquer les formes juridiques avec le notaire","Demander les pièces : livret de famille, contrat de mariage, actes de donations, clauses d'assurance vie, titres, statuts, avis d'imposition","Annoncer la méthode : analyse patrimoniale complète avant toute recommandation","Bâtir la feuille de route argumentée"],"figure":{"ref":"six_volets"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[3,2,0,4,1]}$academy_deck$::jsonb, $academy_deck$L'étude, c'est l'analyse complète puis la feuille de route ; la forme juridique se choisit ensuite avec le notaire.$academy_deck$);
  end if;
  if v_max >= 20 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"six_volets"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 20 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : M. et Mme Marchetti, mariés sans contrat en 1984, trois enfants, veulent donner la maison de vacances avant la fin de l'année et refusent le bilan. Cochez tout ce qui doit être clarifié avant toute recommandation.","choix":["Le régime matrimonial et le mode d'acquisition de la maison, qui disent qui peut donner quoi","Le « coup de pouce » de 60 000 euros au fils aîné : déclaré ou non, par qui, à quelle date","Le bon moment indiqué par le voisin","La clause bénéficiaire et l'âge de versement des primes du contrat d'assurance vie de M. Marchetti","Les droits à payer sur 450 000 euros, à chiffrer dès ce rendez-vous"],"figure":{"ref":"six_volets"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Régime, donation antérieure, contrat, divorce, benjamin, volontés écrites : tout se vérifie ; l'urgence du voisin n'est pas un objectif.$academy_deck$);
  end if;
  if v_max >= 41 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reserve_quotite"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 41 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 41, $academy_deck$choix$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma, lisez la barre du bas : un client père de trois enfants veut laisser la moitié de ses biens à une association. Que lui répondre ?","choix":["C’est possible : la quotité disponible couvre la moitié des biens","Ce n’est pas possible tel quel : la quotité disponible n’est que le quart, les trois quarts sont réservés aux enfants","C’est possible si les enfants donnent leur accord oral en rendez vous","C’est possible à condition de passer par un contrat d’assurance vie"],"figure":{"ref":"reserve_quotite"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Trois enfants et plus : les trois quarts leur sont réservés, le quart seulement se donne librement ; le souhait s’étudie dans ce cadre, avec le notaire.$academy_deck$);
  end if;
  if v_max >= 42 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"six_volets"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 42 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 42, $academy_deck$multi$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma des six volets, cochez tout ce qu’il faut lire avant de se prononcer sur la donation d’une maison de vacances par un couple marié sans contrat, trois enfants, sans entreprise.","choix":["Situation civile","Donations passées","Assurance vie","Biens et dettes","Entreprise","Volontés écrites"],"figure":{"ref":"six_volets"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2,3,5]}$academy_deck$::jsonb, $academy_deck$Sans entreprise, le cinquième volet reste vide ; les cinq autres se lisent avant tout geste, l’assurance vie comprise : une clause bénéficiaire peut contredire la donation envisagée.$academy_deck$);
  end if;
  if v_max >= 43 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reserve_quotite"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 43 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 43, $academy_deck$trou_choix$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma, la seule part qu’un testament peut orienter vers un partenaire de PACS ou un concubin est ___.","choix":["la quotité disponible","la réserve héréditaire","la moitié des biens, quel que soit le nombre d’enfants","la part du conjoint survivant"],"figure":{"ref":"reserve_quotite"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Sans testament, partenaire de PACS et concubin n’ont aucun droit ; avec, ils ne peuvent recevoir que la quotité disponible, la réserve restant aux enfants.$academy_deck$);
  end if;
end
$schemas_transmission_approche_globale$;
