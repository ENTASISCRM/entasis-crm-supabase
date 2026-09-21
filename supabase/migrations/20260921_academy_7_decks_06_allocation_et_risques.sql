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

-- ── Deck : Allocation et risques (allocation-et-risques) ──
do $deck_allocation_et_risques$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$allocation-et-risques$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$allocation-et-risques$academy_deck$, $academy_deck$Allocation et risques$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Allocation et risques$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Relier diversification, volatilité, horizon et capacité de perte$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$**Une allocation se lit comme un ensemble, à la date de chaque projet, et la capacité de perte prime sur la tolérance déclarée.**

## Diversifier

- Diversifier dilue le risque propre à chaque actif ; le risque de marché et la perte en capital demeurent.
- L'AMF juge la diversification sur le portefeuille global : entreprise, immobilier, épargne salariale, contrats.
- Compter les expositions, pas les lignes : cinq fonds sur les mêmes valeurs forment une seule position.

## Volatilité et horizon

- Une baisse ne devient une perte que si l'on vend.
- DIC : indicateur de 1 à 7 (le niveau 1 n'est pas zéro risque), marché et crédit combinés, calculé pour la période de détention recommandée.
- Scénarios défavorable, intermédiaire, favorable, tension : des estimations, pas un engagement.
- Marché concentré : vingt ans n'éliminent pas le risque.
- Une somme se répartit par projet daté, pas par contrat.

## Tolérance et capacité

- Tolérance : ce que le client accepte de voir bouger. Capacité : ce qu'il peut perdre sans compromettre ses projets. La capacité prime.
- Article L. 541-8-1 : recueillir connaissances et expérience, situation financière, objectifs ; à défaut, s'abstenir. Déclaration d'adéquation écrite.
- « Perte maximale de 10 % » mesure une tolérance : peu d'offres plafonnent la perte.

## Pari sectoriel

- Ni refus sec, ni exécution : écouter, étudier par poche datée, expliquer sans promettre, tracer.
- Trois conditions : fraction limitée d'un patrimoine diversifié, horizon au moins égal à la période recommandée, perte supportable.$academy_deck$, competence = coalesce(nullif($academy_deck$Relier diversification, volatilité, horizon et capacité de perte$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"enonce":"Quel risque la diversification permet-elle de diluer ?","choix":["Le risque commun à tout le marché, comme une récession","Le risque propre à un actif, un secteur ou un émetteur","Le risque de perte en capital","Le risque de crédit mesuré par le DIC"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La diversification dilue le risque propre à chaque actif ; le risque de marché et le risque de perte en capital demeurent.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client détient cinq fonds chez trois assureurs. En ouvrant leurs documents, vous voyez qu'ils investissent tous surtout sur les grandes valeurs technologiques américaines. Que concluez-vous ?","choix":["Il est diversifié : cinq fonds et trois établissements","Il est concentré : les cinq lignes forment une seule position","Il est diversifié dès lors que les frais des fonds diffèrent","Il faut comparer les performances de chaque fonds avant de conclure"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La diversification se juge sur les expositions réelles, pas sur le nombre de lignes ou d'établissements.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un dirigeant de transport détient toutes les parts de sa société, ses locaux via une société civile, sa résidence et un appartement locatif. Il veut placer 120 000 euros en SCPI, « c'est de la pierre, je connais ». Que proposez-vous d'abord ?","choix":["Des SCPI, puisqu'il connaît la pierre et le demande","Des classes d'actifs qu'il ne détient pas encore, avant d'envisager la place éventuelle des SCPI","Le fonds en euros seul, pour ne prendre aucun risque","Un fonds de PME de son secteur, qu'il maîtrise"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Lu dans l'ensemble, le choix ajoute de l'immobilier à un patrimoine déjà fait d'immobilier et d'une entreprise ; on complète d'abord.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 1, $academy_deck${"enonce":"Que combine l'indicateur de risque du document d'informations clés (DIC) ?","choix":["Le risque de marché et le risque de crédit","Le risque de marché et les frais du fonds","La volatilité et la performance passée","Le risque de liquidité et le risque de change"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'indicateur de risque du DIC combine le risque de marché et le risque de crédit, sur une échelle de 1 à 7.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un fonds affiche un risque de 5 sur 7 et une période de détention recommandée de cinq ans. Le client a besoin de la somme dans dix-huit mois pour un apport immobilier. Que lui dites-vous ?","choix":["5 sur 7 est un niveau intermédiaire, le fonds convient à ce projet","Le niveau affiché suppose cinq ans de détention ; à dix-huit mois, le risque réel est plus élevé et le support ne convient pas","Un fonds noté 4 sur 7 suffirait pour dix-huit mois","La période de détention recommandée n'a pas de portée sur le choix"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le niveau de risque du DIC suppose la détention sur la période recommandée ; plus court, le risque réel est plus élevé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Une architecte de 44 ans a 90 000 euros sur un contrat d'assurance vie : 35 000 euros pour acheter ses bureaux dans trois ans, le reste pour un complément de revenus à partir de 64 ans. Comment raisonnez-vous ?","choix":["Un seul profil pour tout le contrat, selon sa tolérance déclarée","Deux poches : la première sur des supports peu volatils, la seconde avec une part d'unités de compte diversifiées","Tout en fonds en euros, le projet à trois ans l'impose","Tout en unités de compte, l'horizon de vingt ans l'autorise"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Une somme se répartit par projet daté, pas par contrat : trois ans appellent peu de volatilité, vingt ans autorisent des unités de compte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client se dit « très à l'aise avec le risque ». Il n'a pas d'épargne de précaution, rembourse un prêt professionnel important et ses revenus dépendent de sa seule activité. Comment qualifiez-vous sa situation ?","choix":["Tolérance et capacité élevées : une allocation dynamique est possible","Tolérance déclarée élevée mais capacité de perte limitée : la capacité prime","Tolérance faible : il se trompe sur lui-même","La question attendra qu'il demande un support précis"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le goût du risque est une déclaration ; la situation financière, ici fragile, fixe la capacité de perte, qui prime.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client refuse de communiquer ses revenus, charges, actifs et dettes, mais demande une recommandation d'allocation « équilibrée ». Que faites-vous ?","choix":["Recommander sur la seule base de la tolérance qu'il déclare","S'abstenir de recommander, lui expliquer pourquoi ces informations sont demandées, et tracer l'échange","Recommander uniquement le fonds en euros par prudence","Appliquer une allocation équilibrée standard du marché"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Sans information sur la situation financière et les objectifs, le cadre applicable aux conseillers en investissements financiers impose de s’abstenir de recommander.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 3, $academy_deck${"enonce":"Un questionnaire de profil propose de cocher « j'accepte une perte maximale de 10 % ». Quel point de vigilance signale l'AMF sur cette formulation ?","choix":["Aucun, cette formule protège le capital du client","Elle mesure une tolérance à la fluctuation, pas une protection : peu d'offres limitent réellement la perte à un pourcentage","Le seuil de 10 % est trop bas, il faut proposer 20 %","Il faut cocher au moins 30 % pour accéder aux unités de compte"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'AMF distingue volatilité, liée à la tolérance, et perte en capital, qui peut être totale ; peu d'offres plafonnent la perte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Une cliente de 40 ans refuse tout au-delà du fonds en euros et de l'immobilier « parce que la bourse fait peur ». Son objectif : un complément de revenus à la retraite dans vingt-cinq ans. Quelle attitude respecte la méthode ?","choix":["Lui affirmer que les actions gagnent sur vingt ans, donc qu'elle se trompe","Respecter son refus sans en discuter : l'adéquation est ainsi assurée","Explorer cette perception, montrer ce que l'horizon et la répartition changent au risque, sans promesse, puis lui laisser la décision et la tracer","Lui proposer un fonds sectoriel pour commencer petit"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Le conseiller explique et présente les possibilités de diversification adaptées à l'horizon, sans imposer ni promettre ; la décision reste à la cliente.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"enonce":"Une allocation correctement diversifiée supprime le risque de perte en capital."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$La diversification dilue le risque propre à chaque actif ; le risque de marché et le risque de perte en capital demeurent.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 1, $academy_deck${"enonce":"Le niveau 1 de l'indicateur de risque du DIC signifie que le placement est sans risque."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Le niveau 1 est le risque le plus faible de l'échelle, ce qui ne veut pas dire absence de risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 1, $academy_deck${"enonce":"Une baisse temporaire n'est pas une perte définitive tant que le client n'a pas besoin de vendre."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$La baisse devient une perte si le client doit sortir au mauvais moment ; la volatilité se lit donc avec l'horizon.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 2, $academy_deck${"enonce":"Selon l'AMF, une part importante des cas d'inadéquation relevés en contrôle vient de la confusion entre tolérance au risque et capacité de perte."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Un client peut avoir le goût du risque et une situation financière qui ne lui permet pas de perdre son capital.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 2, $academy_deck${"enonce":"Une mention d'acceptation du risque signée par le client rend adéquate une allocation que le conseiller sait inadaptée."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Une signature ne transforme pas un conseil inadéquat en conseil adéquat.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 2, $academy_deck${"enonce":"Les scénarios de performance du DIC sont des estimations fondées sur les variations passées et ne constituent pas un engagement."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Défavorable, intermédiaire, favorable et tension sont des estimations ; le scénario de tension n'est pas un plancher garanti.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie de l'allocation d'un client, même si cela ne passe pas par le cabinet.","choix":["Les parts de sa société","Son épargne salariale investie en actions de l'employeur","Ses biens immobiliers","Le nombre d'assureurs chez qui il détient des contrats","Le rendement passé de ses fonds"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$L'AMF apprécie la diversification sur le portefeuille global : entreprise, immobilier et épargne salariale comptent, pas le nombre de lignes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce que l'article L. 541-8-1 du code monétaire et financier impose au conseiller en investissements financiers de recueillir avant tout conseil.","choix":["Les connaissances et l'expérience du client","Sa situation financière, dont sa capacité à subir des pertes","Ses objectifs, dont sa tolérance au risque","Le nom de son établissement bancaire","La performance passée de ses contrats"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Le texte vise connaissances et expérience, situation financière et objectifs ; à défaut, le conseiller s'abstient de recommander.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui conditionne la place d'un pari sectoriel dans une stratégie d'ensemble.","choix":["Il porte sur une fraction limitée d'un patrimoine par ailleurs diversifié","Son horizon est au moins égal à la période de détention recommandée","Le client accepte de perdre l'essentiel de cette fraction sans que ses projets en souffrent","Le secteur a fortement progressé au cours des derniers mois","Un proche a obtenu un bon résultat sur ce fonds"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Le pari s'ajoute à la stratégie s'il y a de la place ; hausse passée et témoignage d'un proche ne sont pas des conditions.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un chirurgien-dentiste de 34 ans rembourse un emprunt professionnel de 400 000 euros et se dit « très à l'aise avec le risque ». Cochez tout ce qui réduit sa capacité de perte.","choix":["L'absence d'épargne de précaution","L'emprunt professionnel en cours","Des revenus qui reposent sur sa seule activité","Son âge","Sa déclaration d'aisance avec le risque"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$La capacité de perte tient à la situation financière : réserve, dettes, dépendance des revenus ; l'aisance déclarée relève de la tolérance.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qu'il faut lire avec le client dans le DIC avant de retenir un support.","choix":["L'indicateur de risque","La période de détention recommandée","Les scénarios défavorable et de tension","Le nom du dépositaire du fonds","La performance du dernier mois"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$On lit ensemble l'indicateur, la période recommandée comparée à la date du projet, et les scénarios, en précisant qu'ils ne promettent rien.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Une cliente veut arbitrer tout son contrat vers un fonds sectoriel qui vient de monter. Remettez dans l'ordre la démarche du conseiller.","elements":["Écouter et reformuler l'objectif réel","Étudier par poche datée","Expliquer sans promettre : perte en capital, volatilité, frais, performance passée","Tracer dans le recueil d'informations et la déclaration d'adéquation écrite"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Ni refus sec ni exécution : on écoute, on étudie, on explique, puis on formalise la recommandation dans la déclaration d'adéquation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les étapes du rendez-vous pour repérer une concentration cachée.","elements":["Dresser la carte complète du patrimoine, y compris ce qui ne se place pas","Ouvrir les documents des fonds déjà détenus","Nommer les expositions dominantes","Proposer ce qui les complète"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$On regarde tout, on lit ce que contiennent les fonds, on nomme les expositions, puis on propose ce qui complète.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l’ordre la lecture d’un support avec le client, avant de le retenir pour un projet.","elements":["Dater le projet : « cette somme, à quelle date en aurez-vous besoin ? »","Lire l'indicateur de risque du DIC","Lire la période de détention recommandée et la comparer à la date du projet","Montrer le scénario défavorable et le scénario de tension"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$On date le projet avant de parler de support, puis on lit le DIC : indicateur, période recommandée, scénarios.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un jeune professionnel endetté, sans réserve, aux revenus dépendant de sa seule activité, se dit très à l’aise avec le risque et veut « du rendement ». Remettez dans l’ordre sa feuille de route.","elements":["Constater que sa capacité de perte est faible malgré la tolérance déclarée","Protéger ses revenus","Constituer une réserve disponible","Envisager une allocation exposée, le rendement venant sur un horizon qui le permet"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$La capacité prime sur la tolérance : revenus protégés d’abord, puis réserve disponible, avant toute allocation exposée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque notion à sa définition.","gauche":["Tolérance au risque","Capacité de perte","Volatilité","Perte en capital"],"droite":["Ce que le client accepte de voir bouger","Ce qu'il peut perdre sans compromettre ses projets","Amplitude des variations d'un placement","Peut être totale lorsqu'elle existe"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$La tolérance décrit le rapport au risque, la capacité la situation financière ; volatilité et perte en capital ne se confondent pas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque élément du DIC à ce qu'il indique.","gauche":["Indicateur de risque","Période de détention recommandée","Scénario de tension"],"droite":["Échelle de 1 à 7, risque de marché et de crédit combinés","Durée que suppose le niveau de risque affiché","Évolution extrême, pas un plancher garanti"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$L'indicateur note de 1 à 7, il suppose la détention sur la période recommandée, et le scénario de tension ne garantit rien.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque situation au terme qui la désigne.","gauche":["Cinq fonds investis sur les mêmes grandes valeurs technologiques","Répartir à parts égales entre les options présentées sans regarder leur contenu","Imiter les choix de son entourage","Récession, hausse des taux, crise"],"droite":["Une seule position","Diversification naïve","Comportement moutonnier","Risque commun à tout le marché"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$L'AMF nomme la diversification naïve et le comportement moutonnier ; le risque de marché touche presque tout en même temps.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 3, $academy_deck${"enonce":"Cas fictifs. Associez chaque poche d'épargne à la lecture qui convient.","gauche":["35 000 euros pour acheter ses bureaux dans trois ans","Complément de revenus à partir de 64 ans, pour une cliente de 44 ans","40 000 euros pour sa fille dans deux ans, face à un fonds recommandé cinq ans","Poche retraite d'une cliente de 51 ans qui cesse son activité à 62 ans"],"droite":["Supports peu volatils, potentiel modeste accepté","Une part d'unités de compte diversifiées, risque expliqué et accepté","Incompatible : l'horizon est plus court que la période recommandée","Environ onze ans : une part d'unités de compte possible, pas un secteur unique"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Chaque poche se lit à sa date : peu de volatilité à court terme, une part d'unités de compte diversifiées à long terme.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"phrase":"L'AMF rappelle que la diversification s'apprécie au niveau du ___ dans sa globalité, sur la base de la situation financière et des objectifs du client.","choix":["portefeuille","contrat d'assurance vie","fonds","secteur"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$On regarde tout le patrimoine : entreprise, locaux, résidence, épargne salariale, contrats, pas seulement la somme apportée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 1, $academy_deck${"phrase":"Le niveau de risque affiché dans le DIC part du principe que le client conserve le produit sur la ___.","choix":["période de détention recommandée","durée du contrat d'assurance vie","année en cours","durée de vie du fonds"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Un fonds noté 5 sur 7 pour cinq ans est plus risqué que ne le dit le chiffre si l'argent ressort dans dix-huit mois.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 2, $academy_deck${"phrase":"Lorsque la tolérance déclarée et la capacité de perte ne concordent pas, c'est la ___ qui prime.","choix":["capacité de perte","tolérance déclarée","demande du client","performance attendue"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Un client peut avoir le goût du risque sans pouvoir se permettre de perdre son capital ; la capacité l'emporte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 3, $academy_deck${"phrase":"Entrer sur un secteur après une progression de 60 % n'est pas un argument, c'est une information sur ___.","choix":["le prix payé","la qualité du gérant","la tendance à venir","la solidité du secteur"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La hausse passée ne préjuge pas de la suite ; elle renseigne seulement sur le prix auquel on entre.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Lecture du DIC$academy_deck$, 1, $academy_deck${"phrase":"L'indicateur de risque du DIC situe le produit sur une échelle de 1 à ___.","aide":"Un chiffre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["7","sept"]}$academy_deck$::jsonb, $academy_deck$L'échelle va du risque le plus faible, qui n'est pas une absence de risque, au plus élevé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Méthode et traçabilité$academy_deck$, 1, $academy_deck${"phrase":"Le cadre applicable aux conseillers en investissements financiers prévoit que le conseil est formalisé dans une déclaration d'___ écrite.","aide":"Un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["adéquation","adequation"]}$academy_deck$::jsonb, $academy_deck$La recommandation est formalisée dans la déclaration d'adéquation écrite, avec ses avantages et ses risques.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"phrase":"L'AMF précise que sur un marché concentré, ___ ans de détention ne suffisent pas à éliminer totalement le risque d'un placement en actions.","aide":"Un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["20","vingt"]}$academy_deck$::jsonb, $academy_deck$Le temps et la diversification réduisent le risque, ils ne le suppriment pas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 2, $academy_deck${"phrase":"Répartir ses avoirs à parts égales entre les options présentées, sans regarder leur contenu ni ce que l'on détient déjà : l'AMF parle de diversification ___.","aide":"Un adjectif"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["naïve","naive"]}$academy_deck$::jsonb, $academy_deck$La diversification naïve multiplie les lignes sans changer les expositions.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Horizon du projet$academy_deck$, 1, $academy_deck${"recto":"Le cadrage étroit, selon l'AMF","verso":"Regarder le risque de court terme et le projeter sur un projet de long terme."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Un client qui consulte son contrat chaque semaine veut tout arbitrer après un mois de baisse, pour un projet à quinze ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Tolérance et capacité$academy_deck$, 2, $academy_deck${"recto":"Quelle question concrète mesure la capacité de perte, plutôt que « êtes-vous dynamique ? »","verso":"« Si cette somme perdait 30 % l'an prochain, qu'est-ce que cela changerait à vos projets ? »"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$On relie la réponse aux chiffres de la découverte : revenus, charges, dettes, réserve disponible, projets datés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Diversification d'ensemble$academy_deck$, 1, $academy_deck${"recto":"Quelle question pose-t-on au client pour faire apparaître une concentration cachée ?","verso":"« Si ce secteur perdait la moitié de sa valeur, quelle part de ce que vous possédez serait touchée ? »"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$La question fait apparaître ce qui réagit aux mêmes causes : entreprise, locaux, épargne salariale, immobilier.$academy_deck$);
end
$deck_allocation_et_risques$;
