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

-- ── Deck : La méthode Entasis (methode-entasis) ──
do $deck_methode_entasis$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$methode-entasis$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$methode-entasis$academy_deck$, $academy_deck$La méthode Entasis$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$La méthode Entasis$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Préparer et structurer la découverte, l'analyse et le suivi$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$Une stratégie d'ensemble, pas une collection de produits.

## Les trois temps
- Écoute : premier entretien de 30 minutes, confidentiel et sans engagement. Comprendre, pas proposer.
- Étude : analyse patrimoniale complète, puis feuille de route argumentée, chaque recommandation chiffrée.
- Accompagnement : un conseiller dédié, un point annuel formel, des ajustements au fil de la vie.

## Avant tout conseil (AMF)
- Recueillir : situation financière (dont capacité à subir des pertes), connaissances et expérience, objectifs, horizon, tolérance au risque.
- Sans ces informations : s'abstenir de tout conseil.
- Demande de produit : notée, reportée à l'étude, ni acceptée ni rejetée.

## Le bilan patrimonial
Actifs, passifs, revenus, fiscalité, régime matrimonial, clauses bénéficiaires, objectifs de vie.

## L'étude, dans l'ordre
1. Diagnostic : où en est le client ?
2. Objectifs de vie hiérarchisés, avec leur horizon.
3. Stratégie, puis moyens : les solutions arrivent ici seulement.
- Pour chaque recommandation : objectif servi, chiffre, contrainte, risque, scénario défavorable.
- Aucun chiffre réglementaire de mémoire : source officielle datée, ou mention « à vérifier ».
- Le conseil écrit : la déclaration d'adéquation.

## Le suivi
- Point annuel : « Qu'est-ce qui a changé dans votre vie ? » Famille, activité, revenus, projets, rapport au risque.
- Mariage, naissance, cession, héritage, baisse de revenus : mettre à jour l'étude, pas de réponse immédiate.
- Notaire, avocat fiscaliste, expert-comptable : coordonnés avec l'accord du client, sans les remplacer.
- Chaque échange, même bref, est tracé dans le CRM le jour même.
$academy_deck$, competence = coalesce(nullif($academy_deck$Préparer et structurer la découverte, l'analyse et le suivi$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Recueillir avant de conseiller$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Madame Roux, pharmacienne, déclare en découverte : « Je veux du rendement, mais je ne veux surtout pas perdre. » Que faites-vous ?","choix":["Noter « profil équilibré » et passer à la question suivante.","Expliquer que rendement et risque sont liés, puis retenir un profil dynamique puisqu'elle veut du rendement.","Proposer un fonds en euros pour lever le doute immédiatement.","Explorer la contradiction : demander ce qu'elle ferait si son épargne baissait de 10 % sur un an, quel montant elle peut immobiliser, et pour quel projet."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":3}$academy_deck$::jsonb, $academy_deck$Une contradiction apparente se creuse par des questions concrètes sur la réaction à une baisse, la capacité de perte et l'horizon, avant toute solution.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un dirigeant ouvre le premier entretien par : « Quel placement me conseillez-vous ? » Quelle réponse correspond à la méthode Entasis ?","choix":["Présenter l'assurance vie, enveloppe souple qui convient à la plupart des situations.","Lui demander d'utiliser le simulateur en ligne et de revenir avec le résultat.","Expliquer que la recommandation viendra après l'écoute et l'étude, puis poser des questions sur sa situation et ses projets.","Refuser de poursuivre tant qu'il n'a pas signé un document d'entrée en relation."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'écoute précède toute proposition : la demande est accueillie, notée, puis le conseiller recueille situation, projets, horizon et rapport au risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Recueillir avant de conseiller$academy_deck$, 1, $academy_deck${"enonce":"Selon l'AMF, que doit faire le conseiller si le client ne communique pas sa situation financière, ses connaissances et ses objectifs ?","choix":["Limiter sa recommandation à des supports peu risqués.","S'abstenir de tout conseil.","Conseiller sur la base d'un profil moyen.","Faire signer une décharge, puis conseiller."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Sans ces informations, le conseiller doit s'abstenir de tout conseil, quel que soit le niveau de risque du support.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Au terme du premier entretien, quel signe montre que l'écoute a été correctement menée ?","choix":["Le client a signé un bulletin de souscription.","Le conseiller a présenté les métiers du cabinet et remis une plaquette.","Le conseiller résume la situation, les projets, l'horizon et le rapport au risque du client, et celui-ci confirme ce résumé.","L'entretien a duré plus de 30 minutes."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'écoute est réussie quand le conseiller restitue situation, projets, horizon et rapport au risque et que le client valide cette restitution.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Coordonner et tracer$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. En découverte, un dirigeant avance : « Mon expert-comptable me dit que je paie trop d'impôt. » Que faites-vous de cet argument ?","choix":["Le contester : l'expert-comptable n'est pas compétent en gestion de patrimoine.","Le valider et chiffrer aussitôt l'économie d'impôt qu'un PER permettrait.","Le prendre comme une information à intégrer et proposer, avec l'accord du client, de solliciter l'expert-comptable lors de l'étude.","Demander au client de changer d'expert-comptable avant de poursuivre."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'argument n'est ni contesté ni validé : le cabinet coordonne les professionnels du client autour d'une stratégie unique, avec son accord.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"enonce":"Qu'est-ce qui rend une feuille de route « argumentée » au sens de la méthode Entasis ?","choix":["Elle relie chaque recommandation à un objectif du client, s'appuie sur une simulation chiffrée et nomme les contraintes, les risques et un scénario défavorable.","Elle cite pour chaque solution le nom du contrat et de son gestionnaire.","Elle propose au moins trois solutions concurrentes pour laisser le choix au client.","Elle indique le rendement attendu de chaque solution sur dix ans."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Argumenter, c'est relier la recommandation à un objectif, la chiffrer et en montrer les limites ; un nom de contrat n'argumente rien.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Après le premier entretien, le client écrit : « Envoyez-moi juste le bulletin de souscription, on verra l'étude plus tard. » Que faites-vous ?","choix":["Envoyer le bulletin pour ne pas perdre le client ; l'étude suivra.","Faire signer une décharge de responsabilité, puis envoyer le bulletin.","Expliquer que l'étude chiffrée protège sa décision, proposer une date de restitution proche, et tracer l'échange.","Transmettre le dossier à un collègue plus expérimenté sans répondre."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Aucune recommandation ne précède l'étude ; on répond à la pression de calendrier par une date de restitution, et une décharge ne remplace pas l'analyse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 2, $academy_deck${"enonce":"Quel est l'objet premier du point annuel formel dans la méthode Entasis ?","choix":["Présenter une nouvelle solution chaque année pour entretenir la relation.","Renouveler les documents contractuels signés à l'entrée en relation.","Mettre à jour les données du client dans les simulateurs en ligne du site.","Vérifier que la situation, les objectifs et le rapport au risque n'ont pas changé, et que ce qui est en place reste adapté."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":3}$academy_deck$::jsonb, $academy_deck$Le point annuel détecte les changements de vie et vérifie l'adéquation de la stratégie ; arriver avec une solution en fait un rendez-vous de vente.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Coordonner et tracer$academy_deck$, 1, $academy_deck${"enonce":"Quel est le rôle du conseiller Entasis vis-à-vis du notaire et de l'expert-comptable de son client ?","choix":["Les consulter uniquement en cas de désaccord avec le client.","Les coordonner autour d'une stratégie unique, avec l'accord du client, sans se substituer à leur expertise.","Les remplacer progressivement pour simplifier les échanges du client.","Leur transmettre le dossier complet du client sans avoir à le lui demander."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le cabinet orchestre les professionnels déjà présents auprès du client, sans les remplacer, et tout échange suppose l'accord préalable du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un gérant majoritaire de 55 ans veut préparer sa retraite et réduire son impôt. L'écoute révèle qu'il n'a aucune prévoyance et que ses revenus chuteraient fortement en cas d'arrêt de travail. Quelle hiérarchie l'étude retient-elle ?","choix":["Réduire l'impôt, puis organiser l'épargne retraite, puis protéger les revenus.","Organiser l'épargne retraite, puis réduire l'impôt, puis protéger les revenus.","Protéger les revenus, puis organiser l'épargne retraite, puis traiter la fiscalité.","Traiter les trois volets en parallèle, sans hiérarchie, pour respecter la demande du client."]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'étude hiérarchise les objectifs : le point aveugle révélé à l'écoute passe en premier et la demande initiale, réduire l'impôt, arrive en troisième position.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 1, $academy_deck${"enonce":"Le premier entretien de découverte est confidentiel et sans engagement, qu'il ait lieu au cabinet, en visio ou par téléphone."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le premier entretien de 30 minutes est confidentiel et sans engagement, quel que soit le canal : cabinet, visio ou téléphone.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 1, $academy_deck${"enonce":"Une simulation chiffrée présentée au client doit aussi montrer ce qui se passe dans un scénario défavorable, et pas seulement dans le scénario espéré."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'AMF demande d'envisager avec le client l'évolution de ses investissements dans un scénario défavorable, pour mesurer la perte possible.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 3, $academy_deck${"enonce":"Quand un client demande un produit précis au premier entretien, le conseiller doit lui expliquer sur le moment pourquoi ce produit ne lui convient pas."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Une demande de produit se note et se reporte à l'étude, sans être ni acceptée ni rejetée sur le moment.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 1, $academy_deck${"enonce":"Le professionnel est tenu de mettre régulièrement à jour les informations concernant le client, notamment en cas de changement de situation familiale, personnelle ou professionnelle."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'AMF le rappelle : la mise à jour régulière sert à vérifier que ce qui est en place reste adapté.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 3, $academy_deck${"enonce":"Un plafond de déduction retenu de mémoire peut figurer dans une feuille de route s'il est présenté comme un simple ordre de grandeur."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Un chiffre réglementaire ne se cite pas de mémoire : source officielle datée, ou mention « à vérifier ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Au point annuel, un client annonce un héritage. La feuille de route ayant été validée l'an dernier, le conseiller peut lui proposer immédiatement une enveloppe pour accueillir les fonds."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Quand un changement apparaît au point annuel, le conseiller annonce une mise à jour de l'étude plutôt qu'une réponse immédiate.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Recueillir avant de conseiller$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce que l'AMF impose de recueillir avant tout conseil en investissement.","choix":["La situation financière du client, dont sa capacité à subir des pertes","Ses connaissances et son expérience","Ses objectifs, dont son horizon et sa tolérance au risque","Le nom de sa banque actuelle","Le montant qu'il souhaite placer dès le premier entretien","L'avis de son expert-comptable"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$L'AMF vise trois blocs : situation financière (dont capacité de perte), connaissances et expérience, objectifs avec horizon et tolérance au risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que couvre le bilan patrimonial dans la méthode Entasis.","choix":["Le régime matrimonial","Les clauses bénéficiaires","Les objectifs de vie","La liste des produits déjà retenus pour le client","Le rendement attendu de chaque solution"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Le bilan couvre actifs, passifs, revenus, fiscalité, régime matrimonial, clauses bénéficiaires et objectifs de vie ; aucune solution n'y figure encore.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Coordonner et tracer$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce que le conseiller trace dans le CRM à l'issue d'un premier entretien.","choix":["La demande initiale du client","L'accord ou non du client pour contacter son expert-comptable","La prochaine action datée","La recommandation de produit retenue","Le chiffre de déduction annoncé au client","Le nom du contrat pressenti"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$On trace la demande initiale, les informations recueillies, les accords de coordination et la prochaine action datée ; aucun produit n'est retenu à ce stade.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que le conseiller énonce pour chaque recommandation lors du rendez-vous de restitution.","choix":["L'objectif servi","Le chiffre issu de la simulation","La contrainte et le risque","Le nom du gestionnaire du contrat","Le rendement garanti sur dix ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Pour chaque recommandation, le conseiller dit l'objectif servi, le chiffre, la contrainte et le risque, et montre le scénario défavorable.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui, dans la méthode Entasis, peut rendre une stratégie patrimoniale obsolète.","choix":["Un mariage","Une cession d'entreprise","Un héritage","Un changement de conseiller dédié au cabinet","Une hausse des marchés financiers"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Mariage, naissance, cession d'entreprise, héritage, baisse de revenus : chacun de ces événements de vie peut rendre une stratégie obsolète.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les étapes du premier entretien de découverte.","elements":["Résumer oralement et faire valider par le client","Poser le cadre : « Je ne vous proposerai rien aujourd'hui. »","Consigner l'échange dans la fiche client","Poser des questions ouvertes et reformuler","Accueillir, noter et reporter la demande de produit","Annoncer l'analyse complète et une date de restitution"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[1,4,3,0,5,2]}$academy_deck$::jsonb, $academy_deck$Cadre, demande notée et reportée, questions ouvertes, résumé validé, annonce de la suite, puis traçage dans la fiche client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre les étapes de l'étude selon la méthode Entasis.","elements":["Le diagnostic : où en est le client ?","La stratégie : comment y aller ?","Les moyens : les solutions au service d'un objectif","Les objectifs de vie hiérarchisés, avec leur horizon"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,3,1,2]}$academy_deck$::jsonb, $academy_deck$L'étude suit un ordre : diagnostic, objectifs hiérarchisés, stratégie, puis moyens ; les solutions n'apparaissent qu'en dernier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre le déroulé du rendez-vous de restitution de l'étude.","elements":["Présenter le diagnostic : « Voici ce que j'ai compris de votre situation », et le faire valider","Exposer les objectifs hiérarchisés identifiés ensemble","Conclure par les décisions à prendre, les documents à réunir et la prochaine étape","Présenter la stratégie et les moyens, avec objectif servi, chiffre, contrainte, risque et scénario défavorable"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,3,2]}$academy_deck$::jsonb, $academy_deck$La restitution suit l'ordre de l'étude : diagnostic validé, objectifs hiérarchisés, stratégie et moyens, puis décisions et prochaine étape.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la préparation et la conduite du point annuel.","elements":["Tracer l'échange dans le CRM le jour même","Reprendre chaque brique en place et vérifier qu'elle sert toujours son objectif","Passer en revue famille, activité, revenus, projets, rapport au risque","Ouvrir par : « Qu'est-ce qui a changé dans votre vie depuis notre dernier point ? »","Relire la feuille de route et les échanges de l'année","Fixer la prochaine échéance"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[4,3,2,1,5,0]}$academy_deck$::jsonb, $academy_deck$Le point annuel se prépare par relecture, s'ouvre sur les changements, revoit chaque brique, puis fixe l'échéance et se trace le jour même.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque temps de la méthode Entasis à son contenu.","gauche":["L'écoute","L'étude","L'accompagnement"],"droite":["Conseiller dédié, point annuel formel, ajustements au fil de la vie","Analyse patrimoniale complète et feuille de route argumentée","Premier entretien de 30 minutes pour comprendre, sans proposer"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,2],[1,1],[2,0]]}$academy_deck$::jsonb, $academy_deck$La méthode tient en trois temps : l'écoute pour comprendre, l'étude pour argumenter, l'accompagnement pour ajuster dans la durée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque question de l'étude à l'étape qui y répond.","gauche":["Où en est le client ?","Où veut-il aller ?","Comment y aller ?"],"droite":["Les objectifs de vie hiérarchisés","Le diagnostic","La stratégie"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,1],[1,0],[2,2]]}$academy_deck$::jsonb, $academy_deck$Le diagnostic décrit la situation, les objectifs hiérarchisés fixent la destination, la stratégie dit comment y aller.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque phrase du conseiller au moment où elle se dit.","gauche":["« Je ne vous proposerai rien aujourd'hui. »","« C'est noté, nous l'examinerons dans l'étude. »","« Voici ce que j'ai compris de votre situation. »","« Qu'est-ce qui a changé dans votre vie depuis notre dernier point ? »"],"droite":["Ouverture du point annuel","Ouverture du rendez-vous de restitution","Réponse à une demande de produit en découverte","Ouverture du premier entretien"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,3],[1,2],[2,1],[3,0]]}$academy_deck$::jsonb, $academy_deck$Chaque temps de la méthode a sa phrase d'ouverture : le cadre, le report de la demande, le diagnostic à valider, la question des changements.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Recueillir avant de conseiller$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque information à recueillir à la question ouverte qui la fait émerger.","gauche":["Ce qui amène le client","L'objectif de l'épargne","L'horizon","La tolérance au risque"],"droite":["« Dans combien de temps ? »","« Comment réagiriez-vous si la valeur baissait ? »","« Qu'est-ce qui vous amène ? »","« À quoi doit servir cette épargne ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,2],[1,3],[2,0],[3,1]]}$academy_deck$::jsonb, $academy_deck$Les questions ouvertes du premier entretien recueillent projets, horizon et rapport au risque sans évoquer de solution.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 1, $academy_deck${"phrase":"La règle de la maison : une stratégie d'ensemble, pas une ___ de produits.","choix":["sélection","collection","gamme","liste"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La formule du cabinet est : une stratégie d'ensemble, pas une collection de produits.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 1, $academy_deck${"phrase":"Dans l'étude, les solutions n'apparaissent qu'à l'étape ___, comme des moyens au service d'un objectif.","choix":["du diagnostic","des objectifs","de la stratégie","de l'écoute"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Les solutions n'apparaissent qu'au stade de la stratégie, après le diagnostic et les objectifs hiérarchisés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"phrase":"Un chiffre réglementaire cité sans ___ n'a pas sa place dans une feuille de route.","choix":["validation du client","simulation sur dix ans","accord de l'expert-comptable","source officielle datée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":3}$academy_deck$::jsonb, $academy_deck$Tout chiffre réglementaire s'appuie sur une source officielle datée, ou porte la mention « à vérifier ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 1, $academy_deck${"phrase":"L'accompagnement Entasis : un conseiller dédié, un point ___ formel, des ajustements au fil de votre vie.","choix":["mensuel","trimestriel","semestriel","annuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":3}$academy_deck$::jsonb, $academy_deck$Le cabinet formule l'accompagnement ainsi : un conseiller dédié, un point annuel formel, des ajustements au fil de votre vie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Préparer la découverte$academy_deck$, 1, $academy_deck${"phrase":"Le premier entretien de découverte dure ___ minutes.","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["30","trente","Trente"]}$academy_deck$::jsonb, $academy_deck$Le premier entretien dure 30 minutes, confidentiel et sans engagement.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"phrase":"Le conseil en investissement est formalisé dans un rapport écrit, dit déclaration d'___.","aide":"un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["adéquation","adequation","Adéquation","Adequation"]}$academy_deck$::jsonb, $academy_deck$La déclaration d'adéquation détaille et justifie les propositions, leurs avantages et leurs risques au regard de la situation et des objectifs du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Recueillir avant de conseiller$academy_deck$, 1, $academy_deck${"phrase":"Avant tout conseil, la situation financière recueillie inclut la capacité du client à subir des ___.","aide":"un mot au pluriel"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["pertes","perte","Pertes"]}$academy_deck$::jsonb, $academy_deck$L'AMF inclut dans la situation financière la capacité du client à subir des pertes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Coordonner et tracer$academy_deck$, 1, $academy_deck${"phrase":"Chaque échange avec le client, même bref, est tracé dans le CRM le ___ même.","aide":"un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["jour","Jour"]}$academy_deck$::jsonb, $academy_deck$Chaque échange, même bref, est tracé le jour même ; un appel non consigné est une information perdue et un risque pour le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Structurer l'analyse$academy_deck$, 2, $academy_deck${"recto":"Quelle est l'erreur fréquente qui transforme l'étude en fiche produit ?","verso":"Rédiger trois pages sur une enveloppe et une ligne sur le client : on décrit un produit, on n'argumente pas."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Une étude décrit la situation du client et argumente une stratégie ; trois pages sur le fonctionnement d'une enveloppe n'argumentent rien.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Argumenter et chiffrer$academy_deck$, 2, $academy_deck${"recto":"Contrainte à énoncer sur un PER individuel : jusqu'à quand l'épargne est-elle bloquée ?","verso":"En principe jusqu'à la retraite, hors les cas de déblocage anticipé prévus par la loi."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le PER individuel est en principe bloqué jusqu'à la retraite ; seuls les cas de déblocage anticipé listés par Service-Public permettent de récupérer l'épargne.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Organiser le suivi$academy_deck$, 1, $academy_deck${"recto":"Selon le cabinet, à quoi tient un patrimoine solide ?","verso":"Jamais à un geste spectaculaire : à une suite d'ajustements justes, discrets, pensés dans la durée."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le cabinet le formule ainsi : un patrimoine solide repose sur une suite d'ajustements justes, discrets, pensés dans la durée.$academy_deck$);
end
$deck_methode_entasis$;
