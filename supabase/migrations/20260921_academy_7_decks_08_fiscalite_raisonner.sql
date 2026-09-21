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

-- ── Deck : Fiscalité : raisonner avant de proposer (fiscalite-raisonner) ──
do $deck_fiscalite_raisonner$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$fiscalite-raisonner$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$fiscalite-raisonner$academy_deck$, $academy_deck$Fiscalité : raisonner avant de proposer$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Fiscalité : raisonner avant de proposer$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Distinguer déduction, réduction, crédit et logique économique$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$**Un avantage fiscal n'est pas le résultat : nommer le mécanisme, lire l'avis d'imposition, reconstituer le bilan complet avant de proposer.**

## Trois mécanismes
- Déduction : sur le revenu imposable, avant l'impôt. Vaut la tranche du client.
- Réduction : sur l'impôt calculé. Vaut au plus l'impôt dû ; surplus perdu, sauf report prévu.
- Crédit : sur l'impôt calculé. Vaut sa valeur faciale ; surplus remboursé, même non imposable, au-delà de 8 €.

## Effet réel d'une déduction
- Barème progressif : 0, 11, 30, 41 et 45 %. Seuils indexés chaque année, à lire sur impots.gouv.fr.
- TMI : taux de la dernière tranche atteinte. Économie : environ versement × TMI, tant qu'il reste dans la tranche.
- Annoncer « environ », confirmer au simulateur officiel.

## Deux plafonds
- Plafond épargne retraite : sur l'avis, année en cours plus reliquats des trois années précédentes.
- Plafonnement global : 10 000 € (18 000 € avec outre-mer ou Sofica) pour réductions et crédits liés à un investissement ou une prestation. Épargne retraite et dons hors champ.

## Cinq questions avant de proposer
Coût, durée d'immobilisation, sortie, reprise possible, épargne de précaution.
- PER : versements déduits imposés à la sortie, capital comme rente. Report, pas exonération.
- Girardin : apport à fonds perdus, portage minimal cinq ans, réduction reprenable même sans faute.

## En rendez-vous
- Lire impôt dû, revenu imposable, plafond épargne retraite avant tout chiffre.
- Tableau avec et sans, jusqu'à la sortie ; relier à un objectif de vie, sinon bilan patrimonial.$academy_deck$, competence = coalesce(nullif($academy_deck$Distinguer déduction, réduction, crédit et logique économique$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Sur quoi agit une déduction fiscale ?","choix":["Sur le revenu imposable, avant le calcul de l'impôt","Sur l'impôt calculé, sans remboursement du surplus","Sur l'impôt calculé, avec remboursement du surplus","Sur le plafond épargne retraite imprimé sur l'avis"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La déduction retire une somme du revenu imposable ; l'impôt est ensuite calculé sur ce qui reste.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif. L'impôt calculé d'une cliente est de 1 500 € et elle a droit à une réduction d'impôt de 700 €. Combien paie-t-elle ?","choix":["800 €","0 €","1 500 €","2 200 €"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La réduction s'impute sur l'impôt calculé : 1 500 moins 700 donne 800 € à payer.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client a un impôt calculé de 500 € et bénéficie d'un crédit d'impôt de 700 €. Quel est le résultat ?","choix":["Impôt à zéro et 200 € remboursés","Impôt à zéro et 200 € perdus","Impôt maintenu à 500 €, le crédit ne s'impute pas","Impôt à zéro et 200 € retirés du revenu imposable suivant"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le crédit d'impôt s'impute sur l'impôt et le surplus est remboursé au client, à la différence de la réduction.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 1, $academy_deck${"enonce":"Qu'est-ce que la tranche marginale d'imposition (TMI) ?","choix":["Le taux de la dernière tranche atteinte par le revenu imposable du client","Le taux moyen payé sur l'ensemble des revenus du client","Le taux appliqué au plafonnement global des avantages fiscaux","Le taux de la tranche la plus élevée du barème, soit 45 %"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La TMI est le taux de la dernière tranche atteinte ; c'est lui qui mesure l'effet d'une déduction.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client en TMI 11 % verse 6 000 € sur un dispositif déductible et le versement reste dans sa tranche. Quelle économie annoncez-vous ?","choix":["Environ 660 €","Environ 1 800 €","6 000 €","Environ 2 460 €"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'économie vaut environ le versement multiplié par la TMI : 6 000 × 11 % = 660 €.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Le revenu imposable d'une cliente dépasse de 2 000 € seulement la limite basse de la tranche à 41 %. Elle verse 6 000 € sur un dispositif déductible. Quelle économie est correcte ?","choix":["Environ 2 020 € (2 000 × 41 % + 4 000 × 30 %)","Environ 2 460 € (6 000 × 41 %)","Environ 1 800 € (6 000 × 30 %)","Environ 2 700 € (6 000 × 45 %)"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Seuls les 2 000 € situés dans la tranche à 41 % économisent ce taux ; les 4 000 € suivants retombent à 30 %.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client bénéficie déjà d'un crédit d'impôt pour emploi à domicile et d'une réduction pour investissement locatif. Quel plafond peut-il avoir en grande partie consommé ?","choix":["Le plafonnement global des avantages fiscaux de 10 000 €","Le plafond épargne retraite imprimé sur son avis","La limite haute de sa tranche marginale","Le seuil de 8 € de restitution des crédits d'impôt"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Emploi à domicile et investissement locatif sont des avantages en contrepartie d'une prestation ou d'un investissement, visés par le plafonnement global.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client a déduit ses versements sur un PER pendant quinze ans et sort en capital à la retraite. Comment ces versements sont-ils traités ?","choix":["Ils sont imposés à la sortie : la déduction était un report d'imposition","Ils sont exonérés : la déduction obtenue à l'entrée est définitivement acquise","Ils sont imposés seulement en cas de sortie en rente, pas en capital","Ils sont restitués sous forme de crédit d'impôt"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les versements déduits à l'entrée sont imposés à la sortie, en capital comme en rente : report, pas exonération.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un chirurgien-dentiste avec 6 000 € de livret et un rachat de parts prévu dans dix-huit mois veut souscrire 15 000 € dans un Girardin industriel « avant la fin de l'année ». Quelle prochaine étape proposez-vous ?","choix":["Un bilan patrimonial avec l'avis d'imposition complet et le prévisionnel du rachat de parts","La signature de la souscription avant le 31 décembre pour ne pas perdre l'avantage","Le même Girardin ramené à 10 000 € pour limiter l'apport perdu","Un versement PER immédiat pour consommer son plafond épargne retraite inutilisé"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Épargne de précaution insuffisante et projet à dix-huit mois : on ne recommande rien sans bilan patrimonial et simulation chiffrée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Lecture de l'avis d'imposition$academy_deck$, 2, $academy_deck${"enonce":"Quelles sont les deux lignes de l'avis d'imposition qui conditionnent toute proposition fiscale ?","choix":["L'impôt dû et le revenu imposable","Le plafond épargne retraite et les frais de scolarité","Le taux moyen et le montant des dons","Le plafonnement global et le quotient familial"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Sans impôt dû, une réduction n'a pas d'effet ; sans revenu dans une tranche élevée, une déduction rapporte peu.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Un crédit d'impôt est remboursé au client même s'il n'est pas imposable."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le surplus d'un crédit d'impôt est restitué, y compris à un contribuable non imposable.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 3, $academy_deck${"enonce":"Une réduction d'impôt qui dépasse l'impôt dû est remboursée au client pour la part excédentaire."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Le surplus d'une réduction est perdu, sauf report prévu par le dispositif ; seul un crédit d'impôt est remboursé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 3, $academy_deck${"enonce":"Les versements déduits sur un PER entrent dans le plafonnement global des avantages fiscaux de 10 000 €."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Les charges déductibles du revenu global, dont l'épargne retraite, sont hors champ du plafonnement global.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 1, $academy_deck${"enonce":"Les limites des tranches du barème de l'impôt sur le revenu sont indexées chaque année par la loi de finances."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Les seuils changent chaque année (relevés de 0,9 % pour l'imposition 2026) et se lisent sur la source officielle.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 3, $academy_deck${"enonce":"Dans un Girardin industriel, l'investisseur récupère son apport à l'issue de la durée de portage de cinq ans."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$L'apport est à fonds perdus : le gain réside uniquement dans la réduction d'impôt.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 2, $academy_deck${"enonce":"Un tableau comparatif limité à l'économie d'impôt de la première année flatte le dispositif le plus agressif et cache la sortie."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$La comparaison se construit sur toute la durée, jusqu'à la sortie, avec frais, fiscalité et scénario de reprise.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui agit sur l'impôt déjà calculé, et non sur le revenu imposable.","choix":["La réduction d'impôt","Le crédit d'impôt","La déduction","Le plafond épargne retraite"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1]}$academy_deck$::jsonb, $academy_deck$Réduction et crédit s'imputent sur l'impôt après calcul ; la déduction agit sur le revenu, avant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui est exclu du plafonnement global des avantages fiscaux.","choix":["Les dons","Les cotisations d'épargne retraite déduites du revenu global","Une réduction d'impôt en contrepartie d'un investissement locatif","Le quotient familial","Un crédit d'impôt pour emploi à domicile","Une souscription Sofica"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Dons, charges déductibles du revenu global et quotient familial sont hors champ ; investissement, prestation et Sofica sont visés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des cinq questions à poser avant de proposer un dispositif à avantage fiscal.","choix":["Que coûte l'opération, frais d'entrée, de gestion et de sortie compris ?","Combien de temps l'argent est-il immobilisé ?","Quel dispositif affiche l'économie la plus élevée en année 1 ?","L'épargne de précaution du client est-elle intacte ?","Le client est-il dans la tranche à 45 % ?"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Les cinq questions sont coût, durée, sortie, reprise possible et épargne de précaution ; l'économie d'année 1 n'en fait pas partie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui caractérise un dispositif Girardin selon l'AMF.","choix":["Un apport à fonds perdus","Une durée de portage minimale de cinq ans","Une réduction qui peut être reprise même sans faute de l'investisseur","Une épargne disponible à tout moment","Des versements imposés à la sortie en capital ou en rente","Une déduction du revenu imposable"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Fonds perdus, cinq ans de portage et reprise possible ; la fiscalité de sortie et la déduction relèvent du PER.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Lecture de l'avis d'imposition$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que vous relevez sur l'avis d'imposition en début de rendez-vous fiscal.","choix":["Le revenu imposable","L'impôt dû","Le plafond épargne retraite","Les frais de gestion du contrat envisagé","La durée de portage du dispositif","La forme de la société de portage"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Revenu imposable, impôt dû et plafond épargne retraite se lisent sur l'avis ; frais et portage viennent du dispositif.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre les cinq questions à poser avant de proposer un dispositif à avantage fiscal.","elements":["Que coûte l'opération ?","Combien de temps l'argent est-il immobilisé ?","Que se passe-t-il à la sortie ?","L'avantage peut-il être repris ?","L'épargne de précaution est-elle intacte ?"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Coût, durée, sortie, reprise possible, épargne de précaution : les cinq questions se posent dans cet ordre.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Lecture de l'avis d'imposition$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les étapes pour estimer en rendez-vous l'effet d'un versement déductible.","elements":["Demander le dernier avis d'imposition","Repérer le revenu imposable, l'impôt dû et le plafond épargne retraite","Situer la tranche marginale du client","Estimer l'économie en disant « environ » et en précisant la condition de tranche","Vérifier le plafond du dispositif, puis le plafonnement global s'il s'applique","Reporter la simulation dans la feuille de route avec la source et la date"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4,5]}$academy_deck$::jsonb, $academy_deck$On part de l'avis, on situe la TMI, on estime avec « environ », on vérifie les plafonds, puis on consigne avec la source.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre les étapes du calcul qui font intervenir déduction, réduction et crédit.","elements":["Déclarer le revenu","Retirer la déduction du revenu imposable","Calculer l'impôt sur le revenu restant, tranche par tranche","Imputer les réductions et crédits sur l'impôt calculé","Rembourser le surplus éventuel de crédit d'impôt"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$La déduction intervient avant le calcul de l'impôt ; réduction et crédit s'imputent après, et seul le surplus de crédit est remboursé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un prospect veut « juste savoir combien il économise » avec un Girardin. Remettez dans l'ordre votre réponse en rendez-vous.","elements":["Reformuler : il veut que son impôt serve à quelque chose plutôt que de le subir","Nommer les contraintes aussi clairement que l'avantage : apport perdu, reprise possible, plafonnement, liquidité","Proposer un bilan patrimonial avec l'avis d'imposition complet et le prévisionnel de ses projets","Comparer dans la feuille de route plusieurs trajectoires jusqu'à la sortie, chiffrées et sourcées"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Reformulation, contraintes nommées, bilan patrimonial, puis feuille de route comparée sur la durée : aucune souscription en fin de rendez-vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque mécanisme à ce qu'il vaut réellement pour le client.","gauche":["Déduction","Réduction d'impôt","Crédit d'impôt"],"droite":["Ce que vaut la tranche du client","Au plus l'impôt dû","Sa valeur faciale, surplus remboursé"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Une déduction vaut la tranche, une réduction au plus l'impôt dû, un crédit sa valeur faciale.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque avantage fiscal à ce qui l'attend ensuite.","gauche":["Déduction des versements sur un PER","Réduction d'impôt Girardin","Réduction d'impôt supérieure à l'impôt dû"],"droite":["Report d'imposition : les versements déduits sont imposés à la sortie","Gain à fonds perdus, reprenable si les conditions d'exploitation cessent","Surplus perdu, sauf report prévu par le dispositif"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Le PER reporte l'imposition, le Girardin est un gain à fonds perdus reprenable, la réduction excédentaire est perdue.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque plafond ou seuil à sa valeur pour l'imposition 2026 des revenus 2025.","gauche":["Plafond épargne retraite","Plafonnement global de droit commun","Plafonnement global avec outre-mer ou Sofica","Seuil de restitution du surplus d'un crédit d'impôt"],"droite":["Imprimé sur l'avis : année en cours plus reliquats des trois années précédentes","10 000 €","18 000 €","8 €"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Plafond épargne retraite sur l'avis, plafonnement global 10 000 € ou 18 000 €, restitution du crédit au-delà de 8 €.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 2, $academy_deck${"enonce":"Cas fictifs. Associez chaque versement déductible, resté dans la tranche, à l'économie d'impôt approximative.","gauche":["TMI 11 %, versement de 6 000 €","TMI 30 %, versement de 6 000 €","TMI 41 %, versement de 10 000 €"],"droite":["Environ 660 €","Environ 1 800 €","Environ 4 100 €"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$L'économie vaut environ le versement multiplié par la TMI tant qu'il reste dans la tranche.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"phrase":"Une réduction d'impôt ne profite qu'à un client ___.","choix":["imposable","non imposable","en tranche à 45 %","titulaire d'un PER"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Sans impôt dû, une réduction ne produit rien et ne se rembourse pas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 2, $academy_deck${"phrase":"Le plafonnement global est porté à 18 000 € en présence d'investissements ___ ou de souscriptions Sofica.","choix":["outre-mer","locatifs","en épargne retraite","en emploi à domicile"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le plafond de 10 000 € passe à 18 000 € avec des investissements outre-mer ou des souscriptions Sofica.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 2, $academy_deck${"phrase":"Dans un Girardin, la réduction d'impôt s'impute sur l'impôt de l'année ___.","choix":["suivante","en cours","précédente","de la retraite"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La réduction s'impute l'année suivante ; la part non imputée peut être reportée jusqu'à la cinquième année.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 2, $academy_deck${"phrase":"Un dispositif sans objectif de vie est un ___, pas une stratégie.","choix":["produit","placement","report d'imposition","avantage fiscal"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le dispositif se relie à un objectif de vie ; sans objectif, la prochaine étape est un bilan patrimonial.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Plafonds et plafonnement global$academy_deck$, 1, $academy_deck${"phrase":"Pour l'imposition 2026 des revenus 2025, le plafonnement global des avantages fiscaux est de ___ € hors outre-mer et Sofica.","aide":"Un montant en euros."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["10 000","10000","10 000 €","10000 €","dix mille"]}$academy_deck$::jsonb, $academy_deck$Le plafonnement global de droit commun est de 10 000 €, porté à 18 000 € dans certains cas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Sortie, blocage et reprise$academy_deck$, 1, $academy_deck${"phrase":"Un dispositif Girardin impose une durée de portage minimale de ___ ans.","aide":"Un chiffre."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["5","cinq"]}$academy_deck$::jsonb, $academy_deck$La durée de portage minimale d'un Girardin est de cinq ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 3, $academy_deck${"phrase":"Le surplus d'un crédit d'impôt n'est restitué que s'il dépasse ___ €.","aide":"Un très petit montant."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["8","huit","8 €"]}$academy_deck$::jsonb, $academy_deck$Les très petits montants ne sont pas restitués : le surplus de crédit n'est remboursé qu'au-delà de 8 €.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Effet réel selon la TMI$academy_deck$, 1, $academy_deck${"phrase":"Le taux de la dernière tranche atteinte par le revenu imposable est la tranche ___ d'imposition.","aide":"Un adjectif, celui du M de TMI."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["marginale","Marginale","marginal"]}$academy_deck$::jsonb, $academy_deck$La tranche marginale d'imposition, ou TMI, est le taux de la dernière tranche atteinte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Trois mécanismes fiscaux$academy_deck$, 1, $academy_deck${"recto":"Déduction, réduction, crédit : la phrase à retenir sur ce que vaut chacun ?","verso":"Une déduction vaut la tranche du client, une réduction au plus l'impôt dû, un crédit sa valeur faciale."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Cette phrase résume l'effet réel des trois mécanismes pour le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Bilan économique complet$academy_deck$, 1, $academy_deck${"recto":"Les cinq questions à poser avant de proposer un dispositif à avantage fiscal ?","verso":"Coût, durée d'immobilisation, sortie, reprise possible de l'avantage, épargne de précaution intacte."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L'avantage fiscal est une pièce du bilan économique, jamais le bilan lui-même.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Lecture de l'avis d'imposition$academy_deck$, 2, $academy_deck${"recto":"Que dire au client avant de citer un chiffre sur un versement déductible ?","verso":"Nommer le mécanisme : le versement diminue le revenu imposable, pas directement l'impôt, puis regarder ensemble ce que cela représente."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le mécanisme se nomme avant le chiffre ; la simulation chiffrée appartient à l'étude, pas à la conversation.$academy_deck$);
end
$deck_fiscalite_raisonner$;
