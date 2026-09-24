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

-- ── Schemas : Conduire un rendez-vous et répondre aux objections (conduire-un-rendez-vous) ──
do $schemas_conduire_un_rendez_vous$
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$conduire-un-rendez-vous$academy_deck$;
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', $academy_deck$conduire-un-rendez-vous$academy_deck$;
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', $academy_deck$conduire-un-rendez-vous$academy_deck$;
    return;
  end if;
  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := $academy_deck$[{"cle":"reformulation","titre":"Les trois temps de la reformulation","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les trois temps de la reformulation</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les trois temps de la reformulation</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"14\" fill=\"#8A95A8\">Une objection dit ce que le client comprend, craint ou attend</text>\n<line x1=\"110\" y1=\"84\" x2=\"530\" y2=\"84\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<g fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\">\n<rect x=\"10\" y=\"84\" width=\"200\" height=\"130\" rx=\"8\"/>\n<rect x=\"220\" y=\"84\" width=\"200\" height=\"130\" rx=\"8\"/>\n<rect x=\"430\" y=\"84\" width=\"200\" height=\"130\" rx=\"8\"/>\n</g>\n<g font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\" text-anchor=\"middle\">\n<circle cx=\"110\" cy=\"84\" r=\"16\" fill=\"#162443\"/>\n<text x=\"110\" y=\"90\">1</text>\n<circle cx=\"320\" cy=\"84\" r=\"16\" fill=\"#162443\"/>\n<text x=\"320\" y=\"90\">2</text>\n<circle cx=\"530\" cy=\"84\" r=\"16\" fill=\"#162443\"/>\n<text x=\"530\" y=\"90\">3</text>\n</g>\n<g font-size=\"17\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"110\" y=\"124\">Accueillir</text>\n<text x=\"320\" y=\"124\">Reformuler</text>\n<text x=\"530\" y=\"124\">Faire préciser</text>\n</g>\n<g stroke=\"#C5A55A\" stroke-width=\"2\">\n<line x1=\"60\" y1=\"134\" x2=\"160\" y2=\"134\"/>\n<line x1=\"270\" y1=\"134\" x2=\"370\" y2=\"134\"/>\n<line x1=\"480\" y1=\"134\" x2=\"580\" y2=\"134\"/>\n</g>\n<g font-size=\"14\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"110\" y=\"152\">Une information,</text>\n<text x=\"110\" y=\"170\">pas une attaque.</text>\n<text x=\"110\" y=\"188\">« C’est une question</text>\n<text x=\"110\" y=\"206\">légitime. »</text>\n<text x=\"320\" y=\"152\">Avec les mots du client,</text>\n<text x=\"320\" y=\"170\">sans traduire ni orienter,</text>\n<text x=\"320\" y=\"188\">jusqu’à la validation :</text>\n<text x=\"320\" y=\"206\">« C’est bien cela ? »</text>\n<text x=\"530\" y=\"152\">Une seule question,</text>\n<text x=\"530\" y=\"170\">après la confirmation :</text>\n<text x=\"530\" y=\"188\">« Concrètement, que</text>\n<text x=\"530\" y=\"206\">feriez vous seul ? »</text>\n</g>\n<polygon points=\"308,218 332,218 320,232\" fill=\"#C5A55A\"/>\n<rect x=\"10\" y=\"236\" width=\"620\" height=\"38\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"320\" y=\"261\" text-anchor=\"middle\" font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\">Répondre, seulement après la confirmation du client</text>\n<rect x=\"10\" y=\"284\" width=\"620\" height=\"68\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"305\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#162443\">Trois erreurs : répondre à la question que l’on croit avoir entendue</text>\n<g font-size=\"14\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"110\" y=\"326\">Argumenter</text>\n<text x=\"320\" y=\"326\">Déformer</text>\n<text x=\"530\" y=\"326\">Orienter</text>\n</g>\n<g font-size=\"14\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"110\" y=\"344\">sans avoir vérifié</text>\n<text x=\"320\" y=\"344\">traduire par « trop cher »</text>\n<text x=\"530\" y=\"344\">souffler la réponse</text>\n</g>\n</svg>","legende":"Accueillir, reformuler avec les mots du client jusqu’à la validation, faire préciser par une seule question : on ne répond qu’après la confirmation. Argumenter sans vérifier, déformer ou orienter, c’est répondre à côté."},{"cle":"etages_frais","titre":"Les deux étages de frais en assurance vie","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\" font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n<title>Les deux étages de frais en assurance vie</title>\n<rect x=\"0\" y=\"0\" width=\"640\" height=\"360\" fill=\"#FFFFFF\"/>\n<text x=\"320\" y=\"34\" text-anchor=\"middle\" font-size=\"20\" font-weight=\"700\" fill=\"#162443\">Les deux étages de frais en assurance vie</text>\n<text x=\"320\" y=\"58\" text-anchor=\"middle\" font-size=\"14\" fill=\"#8A95A8\">Deux familles selon l’AMF : ponctuels (entrée, sortie) et récurrents (gestion annuelle)</text>\n<rect x=\"10\" y=\"72\" width=\"620\" height=\"120\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"24\" y=\"95\" font-size=\"16\" font-weight=\"700\" fill=\"#162443\">Étage 1 : le contrat</text>\n<g fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\">\n<rect x=\"24\" y=\"106\" width=\"142\" height=\"74\" rx=\"8\"/>\n<rect x=\"174\" y=\"106\" width=\"142\" height=\"74\" rx=\"8\"/>\n<rect x=\"324\" y=\"106\" width=\"142\" height=\"74\" rx=\"8\"/>\n<rect x=\"474\" y=\"106\" width=\"142\" height=\"74\" rx=\"8\"/>\n</g>\n<g font-size=\"15\" font-weight=\"700\" fill=\"#162443\" text-anchor=\"middle\">\n<text x=\"95\" y=\"130\">Versement</text>\n<text x=\"245\" y=\"130\">Gestion</text>\n<text x=\"395\" y=\"130\">Arbitrage</text>\n<text x=\"545\" y=\"130\">Retrait</text>\n</g>\n<g font-size=\"13\" fill=\"#2C3548\" text-anchor=\"middle\">\n<text x=\"95\" y=\"150\">à l’entrée,</text>\n<text x=\"95\" y=\"167\">sur chaque versement</text>\n<text x=\"245\" y=\"150\">chaque année,</text>\n<text x=\"245\" y=\"167\">sur l’encours</text>\n<text x=\"395\" y=\"150\">à chaque transfert</text>\n<text x=\"395\" y=\"167\">entre supports</text>\n<text x=\"545\" y=\"150\">à la sortie,</text>\n<text x=\"545\" y=\"167\">quand le client retire</text>\n</g>\n<circle cx=\"320\" cy=\"198\" r=\"12\" fill=\"#FFFFFF\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"204\" text-anchor=\"middle\" font-size=\"17\" font-weight=\"700\" fill=\"#162443\">+</text>\n<rect x=\"10\" y=\"204\" width=\"620\" height=\"74\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#162443\" stroke-width=\"2\"/>\n<text x=\"24\" y=\"227\" font-size=\"16\" font-weight=\"700\" fill=\"#162443\">Étage 2 : les supports</text>\n<rect x=\"24\" y=\"238\" width=\"592\" height=\"30\" rx=\"8\" fill=\"#F5EDD8\" stroke=\"#C5A55A\" stroke-width=\"2\"/>\n<text x=\"320\" y=\"258\" text-anchor=\"middle\" font-size=\"14\" fill=\"#2C3548\">Frais courants de chaque fonds, récurrents, lus dans son document d’informations clés</text>\n<rect x=\"10\" y=\"290\" width=\"620\" height=\"62\" rx=\"8\" fill=\"#162443\"/>\n<text x=\"320\" y=\"315\" text-anchor=\"middle\" font-size=\"16\" font-weight=\"700\" fill=\"#FFFFFF\">Toujours en pourcentage et en euros sur le montant réel</text>\n<text x=\"320\" y=\"338\" text-anchor=\"middle\" font-size=\"14\" fill=\"#FFFFFF\">2 % sur 40 000 euros, c’est 800 euros. Jamais « négligeable », « classique » ni « offert ».</text>\n</svg>","legende":"Les frais du contrat (versement, gestion, arbitrage, retrait) et les frais courants de chaque fonds s’additionnent. Ne présenter qu’un étage, c’est faire croire au client qu’il paie moins qu’il ne paie."}]$academy_deck$::jsonb;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;
  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;
  if v_max >= 3 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reformulation"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 3 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client dit : « Je peux très bien faire cela seul avec une application. » Quelle reformulation est fidèle ?","choix":["« Vous trouvez que nos frais sont trop élevés, c'est cela ? »","« Vous voulez donc un conseil personnalisé, ce que nous faisons justement, n'est-ce pas ? »","« Si je vous comprends bien, vous savez déjà investir seul et vous cherchez ce que notre accompagnement apporterait en plus. C'est bien cela ? »","« Vous avez sans doute eu une mauvaise expérience avec un conseiller ? »"],"figure":{"ref":"reformulation"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Une reformulation fidèle reprend les mots du client et demande validation ; les autres déforment, orientent ou supposent.$academy_deck$);
  end if;
  if v_max >= 5 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"etages_frais"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 5 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client envisage un versement de 20 000 euros sur un contrat dont les frais sur versement sont de 2 %. Quelle présentation est conforme ?","choix":["« 2 %, c'est le tarif classique, et c'est négligeable sur la durée. »","« 2 %, soit 400 euros prélevés à l'entrée ; s'y ajoutent chaque année les frais du contrat et ceux des supports, que je vous détaille maintenant. »","« 2 % à l'entrée, mais je vous les offre, donc n'en parlons plus. »","« Il y a des frais d'entrée, je vous enverrai le détail après signature. »"],"figure":{"ref":"etages_frais"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Chaque frais s'annonce en pourcentage et en euros sur le montant réel, avant la recommandation, sans s'arrêter au premier étage.$academy_deck$);
  end if;
  if v_max >= 13 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"etages_frais"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 13 and type = $academy_deck$vrai_faux$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"enonce":"En assurance vie, les frais courants des fonds détenus dans le contrat sont compris dans les frais de gestion du contrat.","figure":{"ref":"etages_frais"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Il y a deux étages distincts : les frais du contrat et les frais des supports, lus dans le document d'informations clés du fonds.$academy_deck$);
  end if;
  if v_max >= 18 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reformulation"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 18 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui constitue une erreur de reformulation.","choix":["Dérouler une liste d'arguments sans avoir vérifié la question","Reformuler « Vous trouvez que c'est trop cher » alors que le client parle de valeur ajoutée","Reformuler par « Vous voulez donc un conseil personnalisé, n'est-ce pas ? »","Reprendre le mot exact employé par le client","Terminer la reformulation par « C'est bien cela ? »"],"figure":{"ref":"reformulation"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Les trois erreurs : argumenter sans vérifier, déformer, orienter ; reprendre le mot exact et faire valider sont la bonne pratique.$academy_deck$);
  end if;
  if v_max >= 41 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"reformulation"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 41 and type = $academy_deck$choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 41, $academy_deck$choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client trouve les frais élevés. Le conseiller répond : « Si je vous comprends bien, ce qui vous gêne n’est pas le montant, mais de payer sans voir ce que vous achetez. C’est bien cela ? » Sur le schéma, où se place cette phrase ?","choix":["Au premier temps, l’accueil de l’objection","Au deuxième temps, la reformulation qui attend la validation du client","Au troisième temps, la question de précision","Après la réponse, pour vérifier que le client a suivi"],"figure":{"ref":"reformulation"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Elle reprend les mots du client et demande validation : c’est le deuxième temps. Vient ensuite une seule question de précision, et la réponse seulement après la confirmation.$academy_deck$);
  end if;
  if v_max >= 42 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"etages_frais"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 42 and type = $academy_deck$multi$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 42, $academy_deck$multi$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 2, $academy_deck${"enonce":"Sur le schéma des deux étages, le conseiller n’a présenté que les frais sur versement. Cochez tout ce qu’il lui reste à annoncer avant de recommander.","choix":["Les frais de gestion du contrat, chaque année sur l’encours","Les frais d’arbitrage, à chaque transfert entre supports","Les frais de retrait, à la sortie","Les frais courants de chaque fonds, lus dans son document d’informations clés","Une remise sur les frais sur versement","Le rendement attendu de l’allocation"],"figure":{"ref":"etages_frais"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Le premier étage compte encore gestion, arbitrage et retrait, le second les frais courants des fonds : tout s’annonce avant la recommandation. Une remise ou un rendement attendu ne sont pas des frais.$academy_deck$);
  end if;
  if v_max >= 43 then
    update public.academy_items set payload = payload || jsonb_build_object('figure', $academy_deck${"ref":"etages_frais"}$academy_deck$::jsonb), updated_at = now()
     where version_id = v_ver and ordre = 43 and type = $academy_deck$trou_choix$academy_deck$ and archive_le is null and not (payload ? 'figure');
  else
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (v_ver, 43, $academy_deck$trou_choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 2, $academy_deck${"phrase":"Sur le schéma, un contrat à 0,8 % de frais de gestion investi sur un fonds à 1,5 % de frais courants cumule les deux étages : le client supporte chaque année ___.","choix":["2,3 %","0,8 %","1,5 %","0,7 %"],"figure":{"ref":"etages_frais"}}$academy_deck$::jsonb)
    returning id into v_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les deux étages s’additionnent : 0,8 % de gestion du contrat et 1,5 % de frais courants du fonds, soit 2,3 % par an. N’annoncer que 0,8 %, c’est faire croire au client qu’il paie moins qu’il ne paie.$academy_deck$);
  end if;
end
$schemas_conduire_un_rendez_vous$;
