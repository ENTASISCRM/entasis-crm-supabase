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

-- ── Deck : Protection sociale du dirigeant (protection-sociale-dirigeant) ──
do $deck_protection_sociale_dirigeant$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$protection-sociale-dirigeant$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$protection-sociale-dirigeant$academy_deck$, $academy_deck$Protection sociale du dirigeant$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Protection sociale du dirigeant$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Identifier les besoins de prévoyance, de santé et de protection des revenus d'un dirigeant$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$**La prévoyance est la fondation de toute stratégie patrimoniale : protéger les revenus d'abord, le patrimoine vient ensuite.**

## Statut social
- Il découle de la forme juridique et du capital, pas du titre.
- Travailleur indépendant : entrepreneur individuel, gérant majoritaire d'EURL ou de SARL, associé de SNC.
- Assimilé salarié : président de SASU, président ou DG de SAS, gérant minoritaire ou égalitaire de SARL. Régime général, protection de salarié cadre, sans assurance chômage.
- SARL : collège de gérance à plus de 50 % des parts, indépendant ; au plus 50 %, assimilé salarié. Les parts du conjoint, du partenaire de PACS et des enfants mineurs comptent avec celles du gérant.

## Arrêt de travail de l'indépendant (ameli.fr, 2026)
- 12 mois d'affiliation continus, IJ à partir du 4e jour.
- IJ égale à 1/730e du revenu annuel moyen des trois dernières années.
- Artisan, commerçant : revenu limité à 48 060 €, IJ maximale 65,84 € bruts par jour, IJ nulle sous 4 582 €.
- Profession libérale : IJ maximale 197,51 € bruts par jour, 90 jours au plus par l'Assurance Maladie.
- Le besoin se démontre par la soustraction revenu moins IJ, comparée aux charges fixes, jamais de mémoire.

## Audit avant recommandation
- Quatre risques (incapacité, invalidité, décès, santé), deux couches (régime obligatoire, contrats existants).
- Sur chaque contrat : montant, franchise, durée, définition de l'invalidité, capital décès, rentes, date d'effet.
- Capital décès 2026 de l'artisan cotisant 9 612 €, capital orphelin 2 403 € par enfant.
- Madelin : déduction du bénéfice imposable du travailleur non salarié, limites BOFiP, paramètre de l'étude et non argument de vente.
- Aucune solution au premier entretien.$academy_deck$, competence = coalesce(nullif($academy_deck$Identifier les besoins de prévoyance, de santé et de protection des revenus d'un dirigeant$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif : Madame Perrin est présidente rémunérée d'une SAS dont elle détient 80 % du capital. Quelle affirmation sur sa protection sociale est exacte ?","choix":["Elle relève du régime général comme un salarié cadre, mais ne cotise pas à l'assurance chômage","Elle relève du régime des indépendants, car elle détient plus de 50 % du capital","Elle relève du régime général et bénéficie de l'assurance chômage comme tout salarié","Elle n'a aucune protection sociale obligatoire tant qu'elle ne souscrit pas de contrat"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le président de SAS est assimilé salarié quelle que soit sa part de capital : régime général, sans cotisation chômage.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : Monsieur Adam est gérant d'une SARL et détient 45 % des parts ; l'autre gérant en détient 20 %. De quel régime social relève Monsieur Adam ?","choix":["Travailleur indépendant, car le collège de gérance détient 65 % des parts","Assimilé salarié, car il détient personnellement moins de 50 %","Salarié de droit commun, avec assurance chômage","Cela dépend uniquement de l'option choisie lors de la création"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La règle Urssaf s'apprécie au niveau du collège de gérance : 45 % plus 20 % font 65 %, donc les deux gérants sont indépendants.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif : un commerçant affilié depuis trois ans est arrêté dix jours pour une grippe sévère. Hors exception, combien de jours sont indemnisés par l'Assurance Maladie ?","choix":["7 jours, car les trois premiers jours ne sont pas indemnisés","10 jours, dès le premier jour d'arrêt","3 jours, le reste relevant d'un contrat facultatif","0 jour, les indépendants n'ayant pas d'indemnités journalières"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Selon ameli.fr, les IJ de l'artisan ou du commerçant sont versées à compter du 4e jour : sur dix jours, sept sont indemnisés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : un artisan gérant majoritaire a un revenu annuel moyen de 90 000 € sur trois ans. Quel ordre de grandeur d'indemnité journalière brute retenez-vous pour 2026 ?","choix":["Environ 66 € par jour, car le revenu retenu est limité au plafond annuel de la Sécurité sociale","Environ 123 € par jour, soit 1/730e de 90 000 €","Environ 197 € par jour, soit le maximum publié par ameli.fr","Environ 246 € par jour, soit son revenu journalier réel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Pour l'artisan, le revenu retenu est plafonné à 48 060 € en 2026, soit une IJ maximale de 65,84 € bruts.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : une avocate libérale vous annonce une opération qui l'arrêtera six mois. Quel point de vigilance sur le régime obligatoire notez-vous pour l'étude ?","choix":["L'Assurance Maladie indemnise au plus 90 jours ; le relais au-delà dépend de sa caisse professionnelle et doit être vérifié","Les IJ sont versées sans limite de durée tant que l'arrêt est prescrit","Elle percevra 197,51 € par jour pendant les six mois, sans autre vérification","Les professions libérales n'ont aucune indemnité journalière du régime obligatoire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Pour le libéral, l'arrêt indemnisé par l'Assurance Maladie est limité à 90 jours ; 197,51 € est un maximum, pas un montant acquis.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 2, $academy_deck${"enonce":"Pour juger si un contrat de prévoyance existant répond au besoin chiffré d'un dirigeant, quelle information est indispensable ?","choix":["La franchise applicable et la définition de l'invalidité retenue","Le montant de la cotisation annuelle","La date de souscription du contrat","Le nom du distributeur qui l'a vendu"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'audit relève ce qui déclenche et limite la garantie : franchise, montant, durée, définition de l'invalidité, capital et rentes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : un travailleur non salarié détient depuis dix ans un contrat de prévoyance avec une franchise de 90 jours et un capital décès faible. Un collègue propose de résilier et de tout remplacer avant le second rendez-vous. Quelle réponse est conforme à la méthode du cabinet ?","choix":["Chiffrer l'écart, envisager un complément, et rappeler qu'un nouveau contrat implique délai d'attente et questionnaire de santé ; la décision relève de l'étude","Résilier immédiatement, un contrat de dix ans étant forcément dépassé","Ne rien faire, un contrat ancien étant une garantie acquise qu'il ne faut pas toucher","Augmenter d'abord la cotisation pour profiter davantage de la déduction Madelin"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Aucune recommandation ne précède l'étude : résilier fait perdre une garantie acquise et rouvre délai d'attente et questionnaire de santé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Cadre Madelin$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : un client demande si la cotisation de son contrat de prévoyance Madelin « fait baisser l'impôt ». Quelle réponse est exacte ?","choix":["Pour un travailleur non salarié, elle est déductible du bénéfice imposable dans les limites du BOFiP","Elle est déductible pour tout dirigeant, y compris le président de SAS","Elle est déductible sans aucune limite de montant","Elle ouvre une réduction d'impôt égale au montant de la cotisation"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le cadre Madelin est une déduction du bénéfice de l'activité non salariée, plafonnée par le BOFiP ; ce n'est pas une réduction d'impôt.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : au premier entretien, un gérant majoritaire sans prévoyance individuelle demande un PER « pour réduire son impôt ». Quelle réponse suit la méthode du cabinet ?","choix":["Replacer la demande : chiffrer d'abord ce qu'il toucherait en cas d'arrêt ; le PER sera étudié dans l'étude, avec une simulation chiffrée","Ouvrir le PER dès ce rendez-vous, puisque l'objectif est clair","Refuser le PER tant qu'il n'a pas souscrit un contrat de prévoyance","Proposer un contrat Madelin à la place du PER, pour la déduction fiscale"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le conseiller ne refuse pas l'objectif, il le replace : prévoyance d'abord, aucune solution au premier entretien, PER étudié ensuite.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : un gérant majoritaire de SARL, ancien salarié, demande qui complétera ses indemnités journalières pendant un arrêt de trois mois. Que lui répondez-vous ?","choix":["Personne : l'IJ du régime obligatoire est plafonnée et rien ne la complète sans contrat facultatif","L'Assurance Maladie complète jusqu'à son revenu réel après le 90e jour","La SARL est tenue de maintenir sa rémunération de gérance pendant l'arrêt","L'assurance chômage prend le relais des indemnités journalières"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Pour l'indépendant, personne ne complète : l'IJ est plafonnée bien en dessous de la rémunération, sans maintien de salaire par un employeur.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : Monsieur Sala est l'unique gérant d'une SARL et détient exactement 50 % des parts. Il est assimilé salarié."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Au plus 50 % des parts : gérant minoritaire ou égalitaire, donc assimilé salarié ; il faut plus de 50 % pour être indépendant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif : un artisan dont le revenu moyen des trois dernières années dépasse le plafond annuel de la Sécurité sociale percevra en 2026 une indemnité journalière proche de sa rémunération réelle."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Le revenu retenu est limité au plafond annuel de la Sécurité sociale, ce qui plafonne l'IJ à 65,84 € bruts par jour en 2026.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 3, $academy_deck${"enonce":"Un dirigeant indépendant installé depuis huit mois, sans activité antérieure ouvrant un maintien de droits, perçoit les indemnités journalières du régime obligatoire dès son premier arrêt de travail."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Ameli.fr exige au moins 12 mois d'affiliation continus ; seul un maintien de droits d'une activité antérieure, sous conditions, peut ouvrir une indemnisation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 2, $academy_deck${"enonce":"Pour apprécier si la gérance d'une SARL est majoritaire, les parts détenues par le conjoint du gérant sont considérées comme possédées par lui."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'article L. 311-3, 11° du code de la sécurité sociale attribue au gérant les parts du conjoint, du partenaire de PACS et des enfants mineurs.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Cadre Madelin$academy_deck$, 2, $academy_deck${"enonce":"Face à un travailleur non salarié, la déduction fiscale des cotisations Madelin est l'argument principal à présenter en rendez-vous."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$La déductibilité Madelin est un paramètre de l'étude, pas l'argument du rendez-vous : on protège d'abord les revenus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 1, $academy_deck${"enonce":"Dans un contrat de prévoyance, la franchise peut différer selon que l'arrêt de travail suit une maladie, un accident ou une hospitalisation."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le nombre de jours avant versement peut varier selon l'origine de l'arrêt ; le conseiller relève chaque franchise sur les conditions particulières.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui relève du statut d'assimilé salarié selon l'Urssaf.","choix":["Le président de SASU","Le directeur général de SAS","Le gérant minoritaire de SARL","Le gérant majoritaire de SARL","L'associé de SNC","L'entrepreneur individuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Président de SASU, président ou DG de SAS, gérant minoritaire ou égalitaire de SARL sont assimilés salariés ; les autres sont indépendants.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce que le conseiller relève sur chaque contrat de prévoyance existant d'un dirigeant.","choix":["La franchise, c'est-à-dire le nombre de jours avant versement","La définition de l'invalidité retenue, professionnelle ou toutes professions","Le capital décès et la présence d'une rente pour le conjoint ou d'une rente éducation","Le nom du distributeur qui a vendu le contrat","L'économie d'impôt liée à la déduction Madelin","Le montant de la cotisation annuelle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$L'audit relève montant, franchise, durée, définition de l'invalidité, capital et rentes, date d'effet ; la cotisation ne dit rien de l'écart.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui est exact pour les indemnités journalières du professionnel libéral en 2026, selon ameli.fr.","choix":["L'IJ maximale est de 197,51 € bruts par jour","L'arrêt indemnisé par l'Assurance Maladie est limité à 90 jours","Le revenu retenu est plafonné à trois fois le plafond annuel de la Sécurité sociale","Les IJ sont versées dès le premier jour d'arrêt","L'IJ maximale est de 65,84 € bruts par jour"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Libéral : revenu plafonné à trois fois le plafond, IJ maximale 197,51 €, 90 jours au plus ; le 4e jour vaut aussi pour lui.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que le conseiller demande avant de conclure sur le régime social d'un dirigeant.","choix":["Les statuts ou l'extrait Kbis","La répartition du capital, y compris les parts du conjoint et des enfants mineurs","La dernière pièce de cotisations, échéancier Urssaf ou bulletin de paie","La notice du régime de la caisse professionnelle","Le contrat de complémentaire santé familiale"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Trois documents avant toute conclusion sur le statut : statuts ou Kbis, répartition du capital, dernière pièce de cotisations.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce à quoi s'expose le conseiller qui propose un nouveau contrat de prévoyance sans avoir lu les contrats en place.","choix":["Faire doublon avec une garantie déjà souscrite","Faire résilier une garantie acquise, avec un nouveau délai d'attente et un nouveau questionnaire de santé","Manquer le vrai écart entre couverture et besoin","Faire perdre au client ses indemnités journalières du régime obligatoire","Priver le client de la déduction Madelin de ses cotisations"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Recommander avant d'avoir lu expose au doublon, à la perte d'une garantie acquise et à un écart manqué ; le régime obligatoire n'est pas touché.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre les étapes de la méthode du cabinet face à un dirigeant qui demande un PER.","elements":["Identifier son régime social à partir de la forme juridique et du capital","Chiffrer ce que verserait le régime obligatoire en cas d'arrêt de travail","Auditer les couvertures existantes et repérer l'écart avec le besoin","Vérifier l'épargne de sécurité","Étudier le PER dans l'étude, avec une simulation chiffrée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Régime, chiffrage, audit, épargne de sécurité, puis PER : la prévoyance est la fondation, le patrimoine vient ensuite.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre chronologique ce que prévoit le régime obligatoire pour un professionnel libéral arrêté plusieurs mois.","elements":["Jours 1 à 3 : aucune indemnité journalière, hors exceptions","À partir du 4e jour : IJ de l'Assurance Maladie, au plus 197,51 € bruts par jour","Au 90e jour : fin de l'arrêt indemnisé par l'Assurance Maladie","Ensuite : relais éventuel de la caisse de retraite professionnelle, à vérifier sur la source officielle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Trois jours non indemnisés, IJ du 4e jour, arrêt de l'Assurance Maladie au 90e jour, puis relais à vérifier auprès de la caisse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les étapes du calcul de l'ordre de grandeur des IJ d'un artisan, tel que le conseiller l'écrit devant le client.","elements":["Relever le revenu d'activité annuel moyen des trois dernières années sur les avis d'imposition","Limiter ce revenu au plafond annuel de la Sécurité sociale, 48 060 € en 2026","Diviser par 730 pour obtenir l'indemnité journalière estimée","Multiplier par le nombre de jours d'arrêt, moins les trois jours non indemnisés","Comparer le résultat au revenu habituel et aux charges fixes"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Revenu moyen sur trois ans, plafonné, divisé par 730, multiplié par les jours indemnisés, comparé aux charges : la soustraction fait comprendre le besoin.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les gestes du conseiller pour établir le statut social d'un dirigeant en rendez-vous.","elements":["Demander les statuts ou le Kbis, la répartition du capital et la dernière pièce de cotisations","Reformuler à voix haute le régime dont relève le dirigeant","Si la structure est complexe (holding, plusieurs mandats), noter le point sans trancher seul","Proposer de le vérifier avec l'expert-comptable du client avant le second rendez-vous"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Documents, reformulation, point noté si la structure est complexe, puis vérification avec l'expert-comptable : le conseiller ne tranche pas seul.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque notion à sa définition.","gauche":["Travailleur indépendant","Assimilé salarié","Collège de gérance majoritaire","Parts attribuées au gérant"],"droite":["Entrepreneur individuel, gérant majoritaire d'EURL ou de SARL, associé de SNC","Président de SAS ou gérant minoritaire de SARL, au régime général sans assurance chômage","Ensemble des gérants d'une SARL détenant plus de 50 % des parts","Parts du conjoint, du partenaire de PACS et des enfants mineurs non émancipés"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Le statut social découle de la forme juridique et du capital, selon la règle du collège de gérance à plus de 50 %.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque repère publié par ameli.fr pour 2026 à son montant.","gauche":["Plafond annuel de la Sécurité sociale","IJ maximale de l'artisan ou du commerçant","IJ maximale du professionnel libéral","Revenu moyen en dessous duquel l'IJ de l'artisan ou du commerçant est nulle"],"droite":["48 060 €","65,84 € bruts par jour","197,51 € bruts par jour","4 582 €"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Plafond 48 060 €, IJ maximale 65,84 € pour l'artisan et 197,51 € pour le libéral, IJ nulle sous 4 582 € de revenu moyen.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque document demandé au dirigeant à ce qu'il permet de vérifier.","gauche":["Échéancier Urssaf","Bulletin de paie","Trois derniers avis d'imposition","Conditions particulières d'un contrat de prévoyance"],"droite":["Cotisations du travailleur indépendant","Cotisations de l'assimilé salarié","Base de calcul des indemnités journalières","Montant garanti, franchise, durée et définition de l'invalidité"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$La pièce de cotisations dépend du régime, les avis d'imposition fondent la base des IJ, les conditions particulières révèlent les garanties.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque prestation ou notion du régime obligatoire à sa valeur selon ameli.fr.","gauche":["Capital décès de l'artisan ou du commerçant cotisant (2026)","Capital orphelin (2026)","Capital décès forfaitaire du salarié (depuis le 1er avril 2026)","Invalidité"],"droite":["9 612 €","2 403 € par enfant","4 009 €","Capacité de travail ou de gain réduite d'au moins deux tiers"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Le socle obligatoire reste modeste : 9 612 € pour l'artisan cotisant, 2 403 € par enfant, 4 009 € pour le salarié.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 1, $academy_deck${"phrase":"Dans une SARL, le collège de gérance est majoritaire, donc travailleur indépendant, quand il détient ___ des parts.","choix":["plus de 50 %","au moins 50 %","plus des deux tiers","plus d'un tiers"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Plus de 50 % des parts : gérance majoritaire, travailleur indépendant ; au plus 50 % : assimilé salarié.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 1, $academy_deck${"phrase":"L'indemnité journalière de l'indépendant est égale à ___ du revenu d'activité annuel moyen des trois dernières années.","choix":["1/730e","1/365e","1/360e","1/1095e"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Selon ameli.fr, l'IJ vaut 1/730e du revenu d'activité annuel moyen des trois dernières années, revenu plafonné.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Cadre Madelin$academy_deck$, 2, $academy_deck${"phrase":"Selon le BOFiP, les cotisations de prévoyance du travailleur non salarié sont déductibles dans la limite de 3,75 % du bénéfice imposable et ___ du plafond annuel de la Sécurité sociale, sans dépasser 3 % de huit fois ce plafond.","choix":["7 %","3 %","10 %","3,75 %"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Limite BOFiP : 3,75 % du bénéfice imposable et 7 % du plafond annuel, sans excéder 3 % de huit fois ce plafond.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 3, $academy_deck${"phrase":"Cas fictif : un chirurgien-dentiste qui ne pourrait plus opérer mais pourrait enseigner ne serait pas couvert si son contrat définit l'invalidité « ___ ».","choix":["toutes professions","professionnelle","de deuxième catégorie","partielle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une invalidité définie « toutes professions » ne joue pas tant qu'une autre activité reste possible ; la définition est un point clé de l'audit.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 1, $academy_deck${"phrase":"Pour percevoir des indemnités journalières, un dirigeant indépendant doit justifier d'au moins ___ mois d'affiliation continus.","aide":"Un nombre."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["12","douze"]}$academy_deck$::jsonb, $academy_deck$Ameli.fr exige au moins 12 mois d'affiliation continus, sauf maintien de droits d'une activité précédente, sous conditions.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Conditions des IJ$academy_deck$, 1, $academy_deck${"phrase":"Hors exceptions, les indemnités journalières de l'indépendant démarrent au ___ jour d'arrêt.","aide":"Un nombre ordinal."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["4e","4","4ème","4eme","quatrième","quatrieme"]}$academy_deck$::jsonb, $academy_deck$Les IJ démarrent au 4e jour : les trois premiers jours d'arrêt ne sont pas indemnisés, hors exceptions.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Plafonds des IJ 2026$academy_deck$, 2, $academy_deck${"phrase":"L'Assurance Maladie indemnise l'arrêt de travail d'un professionnel libéral pendant ___ jours au plus.","aide":"Un nombre."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["90","quatre-vingt-dix","quatre vingt dix"]}$academy_deck$::jsonb, $academy_deck$Pour le libéral, la durée totale de l'arrêt indemnisé par l'Assurance Maladie ne peut dépasser 90 jours ; au-delà, relais de la caisse à vérifier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Statut social du dirigeant$academy_deck$, 1, $academy_deck${"phrase":"L'assimilé salarié relève du régime général, mais ne cotise pas à l'assurance ___.","aide":"Un mot."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["chômage","chomage"]}$academy_deck$::jsonb, $academy_deck$L'assimilé salarié a la protection d'un salarié cadre, hors droit du travail et sans cotisation à l'assurance chômage.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 1, $academy_deck${"recto":"Quelle question poser à un dirigeant pour lui faire sentir le trou de revenu en cas d'arrêt ?","verso":"« Si demain vous êtes arrêté trois mois, qui vous verse quoi, et à partir de quand ? »"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Poser la question, laisser le silence, puis chiffrer sur une feuille avec les chiffres officiels du jour, jamais de mémoire.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 1, $academy_deck${"recto":"Quelle est la phrase clé du cabinet sur la place de la prévoyance ?","verso":"La prévoyance est la fondation de toute stratégie patrimoniale : protéger les revenus d'abord, le patrimoine vient ensuite."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Tout ce que le cabinet recommande vient compléter le socle du régime obligatoire, après avoir protégé les revenus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Audit des couvertures$academy_deck$, 1, $academy_deck${"recto":"Le tableau d'audit des couvertures d'un dirigeant : quelles lignes, quelles colonnes ?","verso":"Quatre lignes : incapacité, invalidité, décès, santé. Trois colonnes : régime obligatoire, contrats existants, besoin chiffré."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L'écart entre le besoin chiffré et les deux premières colonnes est le seul sujet de la feuille de route.$academy_deck$);
end
$deck_protection_sociale_dirigeant$;
