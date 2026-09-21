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

-- ── Deck : Conduire un rendez-vous et répondre aux objections (conduire-un-rendez-vous) ──
do $deck_conduire_un_rendez_vous$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$conduire-un-rendez-vous$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$conduire-un-rendez-vous$academy_deck$, $academy_deck$Conduire un rendez-vous et répondre aux objections$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Conduire un rendez-vous et répondre aux objections$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Reformuler, expliquer les frais, répondre sans promettre et conclure une prochaine étape$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$On reformule avant de répondre, on dit les frais avant de recommander, on s'engage sur une méthode et jamais sur une performance, et l'on conclut sur une étape datée.

## Reformuler l'objection
- Une objection est une information, pas une attaque : ce que le client comprend, craint ou attend.
- Trois temps : accueillir, reformuler jusqu'à « C'est bien cela ? », faire préciser par une seule question. Répondre après confirmation.
- Trois erreurs : argumenter sans vérifier, déformer (« trop cher »), orienter (« n'est-ce pas ? »).

## Expliquer les frais
- Deux familles (AMF) : ponctuels (entrée, sortie) et récurrents (gestion annuelle, parfois surperformance).
- Assurance vie : arbitrage à chaque transfert entre supports ; deux étages, contrat et supports (document d'informations clés).
- Toujours en pourcentage et en euros sur le montant réel : 2 % sur 40 000 euros, c'est 800 euros.
- Mots interdits : « négligeable », « classique », « offert ».
- CIF : lettre de mission signée des deux parties avant le conseil (rémunération, coûts et frais, mise en garde).

## Répondre sans promettre
- Exacte, claire, non trompeuse : ni promesse de résultat, ni superlatif, ni garantie implicite comme « sécurisé ».
- Test : la phrase est-elle vraie quel que soit le marché ?
- Performance passée : mention « ne préjuge pas des performances futures » et information sur le risque.

## Conclure
- Action, date, responsable, document : validés, puis saisis dans le CRM.
- « Réfléchissez et rappelez-moi » n'est pas une étape.
$academy_deck$, competence = coalesce(nullif($academy_deck$Reformuler, expliquer les frais, répondre sans promettre et conclure une prochaine étape$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"enonce":"En rendez-vous, un client formule une objection. Qu'est-ce que cette objection, avant tout ?","choix":["Une attaque qu'il faut désamorcer par des arguments","Une information sur ce que le client comprend, craint ou attend","Le signe que le rendez-vous doit se terminer rapidement","Une demande implicite de remise sur les frais"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Une objection n'est pas une attaque : elle dit ce que le client comprend, craint ou attend.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Une kinésithérapeute coupe : « Avec une application je place moi-même, pourquoi payer des frais ? » Après reformulation, elle précise ne pas vouloir payer quelqu'un qui la met sur un fonds sans regarder sa situation. Quelle est sa vraie objection ?","choix":["Le niveau des frais du contrat proposé","La crainte d'un conseil impersonnel","Une préférence pour les outils numériques","Un refus de l'assurance vie"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La question de précision fait apparaître la vraie objection : elle craint un conseil impersonnel, pas le coût en soi.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client dit : « Je peux très bien faire cela seul avec une application. » Quelle reformulation est fidèle ?","choix":["« Vous trouvez que nos frais sont trop élevés, c'est cela ? »","« Vous voulez donc un conseil personnalisé, ce que nous faisons justement, n'est-ce pas ? »","« Si je vous comprends bien, vous savez déjà investir seul et vous cherchez ce que notre accompagnement apporterait en plus. C'est bien cela ? »","« Vous avez sans doute eu une mauvaise expérience avec un conseiller ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Une reformulation fidèle reprend les mots du client et demande validation ; les autres déforment, orientent ou supposent.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"enonce":"Dans un contrat d'assurance vie, à quel moment les frais d'arbitrage sont-ils prélevés ?","choix":["À chaque versement sur le contrat","Chaque année sur l'encours du contrat","À chaque transfert entre supports","Au moment du retrait"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Les frais d'arbitrage sont prélevés à chaque transfert entre supports ; versement, gestion et retrait sont d'autres frais.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client envisage un versement de 20 000 euros sur un contrat dont les frais sur versement sont de 2 %. Quelle présentation est conforme ?","choix":["« 2 %, c'est le tarif classique, et c'est négligeable sur la durée. »","« 2 %, soit 400 euros prélevés à l'entrée ; s'y ajoutent chaque année les frais du contrat et ceux des supports, que je vous détaille maintenant. »","« 2 % à l'entrée, mais je vous les offre, donc n'en parlons plus. »","« Il y a des frais d'entrée, je vous enverrai le détail après signature. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Chaque frais s'annonce en pourcentage et en euros sur le montant réel, avant la recommandation, sans s'arrêter au premier étage.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Une cliente compare votre assurance vie avec l'application de courtage où elle détient un tracker. Pour comparer honnêtement, que doit ajouter le conseiller à la présentation des frais de sa solution ?","choix":["Les frais de sa solution actuelle : courtage, tenue de compte ou inactivité, et frais courants du tracker","La performance passée du tracker sur les trois dernières années","Une remise sur les frais sur versement pour aligner les deux offres","Uniquement les frais du contrat, les supports étant comparables"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La solution actuelle du client a aussi des frais (courtage, tenue de compte, inactivité, frais courants) : la comparaison les inclut.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Lettre de mission et textes$academy_deck$, 1, $academy_deck${"enonce":"Pour un conseiller en investissements financiers, à quel moment la lettre de mission est-elle remise au client ?","choix":["Après la souscription, avec le premier compte rendu","Avant de formuler le conseil, signée des deux parties","En même temps que la recommandation, lors de la restitution","Seulement si le client en fait la demande"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'article 325-6 du règlement général de l'AMF impose une lettre de mission signée des deux parties avant tout conseil.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un chirurgien-dentiste demande : « Vous me garantissez que je ferai mieux avec vous qu'avec mes placements en ligne ? » Quelle réponse est conforme ?","choix":["« Avec notre sélection, vous serez gagnant. »","« En principe, oui, sauf accident de marché. »","« Non, personne ne peut le garantir ; je m'engage sur la méthode, et je vous nommerai les risques par écrit. »","« Nos fonds ont fait 7 % l'an dernier, cela parle de soi-même. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$On s'engage sur une méthode de travail, jamais sur une performance ; un oui atténué reste une promesse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client hésite entre votre feuille de route et son application et vous demande de « trancher en une phrase ». Laquelle passe le test « vraie quel que soit le comportement des marchés » ?","choix":["« Avec notre allocation, vous ferez mieux que votre tracker. »","« Notre contrat est le meilleur du marché sur les frais. »","« Je ne peux pas vous dire ce que fera le marché ; je peux vous dire ce que nous faisons, ce que cela coûte et ce que vous risquez. »","« Avec nous, vous êtes sécurisé, alors qu'une application vous laisse seul. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Seule cette phrase décrit méthode, coût et risque sans promesse, superlatif ni garantie implicite.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Conclure sur une étape$academy_deck$, 2, $academy_deck${"enonce":"Le rendez-vous se termine. Quelle formulation constitue une véritable prochaine étape ?","choix":["« Réfléchissez de votre côté et rappelez-moi quand vous serez prêt. »","« Je reviens vers vous très vite avec des éléments. »","« Je vous adresse jeudi la lettre de mission et l'état des frais chiffré ; nous nous revoyons le 12 à 18 h pour la feuille de route. Cela vous convient-il ? »","« On se rappelle dans le mois pour voir où vous en êtes. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Une prochaine étape a une action, une date, un responsable et un document, validés avec le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"enonce":"Une fois l'objection reformulée, le conseiller répond sans attendre la confirmation du client, pour ne pas ralentir le rendez-vous."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$On ne répond qu'après la confirmation du client (« C'est bien cela ? ») et une question de précision.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 2, $academy_deck${"enonce":"Reformuler une objection avec les mots du client puis la faire valider est la version orale du recueil de la situation et des objectifs que le code monétaire et financier impose au conseiller en investissements financiers avant de conseiller."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'article L541-8-1 demande de recueillir situation et objectifs avant de conseiller ; la reformulation en est la version orale.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"enonce":"En assurance vie, les frais courants des fonds détenus dans le contrat sont compris dans les frais de gestion du contrat."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Il y a deux étages distincts : les frais du contrat et les frais des supports, lus dans le document d'informations clés du fonds.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Lettre de mission et textes$academy_deck$, 2, $academy_deck${"enonce":"Même si un entretien ne donne lieu à aucune facturation, dire au client que le conseil est « offert » est une erreur."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le conseil a un mode de rémunération que le client doit connaître ; un entretien non facturé ne rend pas le conseil gratuit.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 3, $academy_deck${"enonce":"Qualifier de « sécurisée » une allocation en unités de compte est une garantie implicite, interdite hors mention exacte de la garantie du fonds en euros."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$« Sans risque » et « sécurisé » sont des garanties implicites ; seule la garantie du fonds en euros peut être citée exactement.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Conclure sur une étape$academy_deck$, 1, $academy_deck${"enonce":"Terminer un rendez-vous par « Réfléchissez et rappelez-moi » est une prochaine étape acceptable, puisque le client garde la main."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Cette formule laisse au client la charge de la suite ; une prochaine étape a une action, une date, un responsable et un document.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 2, $academy_deck${"enonce":"Un client lance : « Pourquoi payer des frais alors que je peux investir seul ? » Cochez tout ce que cette phrase dit à la fois.","choix":["Il a une idée du coût","Il a une idée de ce qu'il sait faire seul","Il ne voit pas encore ce que le cabinet apporte","Il refuse l'assurance vie","Il demande une remise sur les frais"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$La phrase dit trois choses : une idée du coût, une idée de ce qu'il sait faire seul, et l'apport du cabinet pas encore perçu.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui constitue une erreur de reformulation.","choix":["Dérouler une liste d'arguments sans avoir vérifié la question","Reformuler « Vous trouvez que c'est trop cher » alors que le client parle de valeur ajoutée","Reformuler par « Vous voulez donc un conseil personnalisé, n'est-ce pas ? »","Reprendre le mot exact employé par le client","Terminer la reformulation par « C'est bien cela ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Les trois erreurs : argumenter sans vérifier, déformer, orienter ; reprendre le mot exact et faire valider sont la bonne pratique.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui relève des frais ponctuels dans la classification de l'AMF.","choix":["Les frais d'entrée ou frais sur versement","Les frais de sortie ou de retrait","Les frais de gestion prélevés chaque année","La commission de surperformance"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1]}$academy_deck$::jsonb, $academy_deck$Ponctuels : entrée ou versement, sortie ou retrait. Récurrents : frais de gestion annuels et, parfois, commission de surperformance.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Lettre de mission et textes$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que la lettre de mission du conseiller en investissements financiers précise, selon l'article 325-6 du règlement général de l'AMF.","choix":["Les conditions de rémunération","Une mise en garde sur les risques","Les coûts et frais associés","Le rendement attendu de la solution recommandée","Les scénarios de performance de chaque support"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$La lettre de mission précise nature du service, rémunération, indépendance ou non, mise en garde sur les risques, coûts et frais.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 3, $academy_deck${"enonce":"Cochez toutes les phrases interdites par l'exigence d'information exacte, claire et non trompeuse.","choix":["« Vous ferez mieux qu'en solo. »","« C'est le meilleur contrat. »","« C'est sans risque. »","« Je ne peux pas vous dire ce que fera le marché. »","« Les unités de compte présentent un risque de perte en capital. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Trois familles interdites : promesse de résultat, superlatif, garantie implicite ; dire ce qu'on ignore et nommer le risque est conforme.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre le traitement d'une objection, de son apparition à la réponse.","elements":["Accueillir : « C'est une question légitime. »","Reformuler : « Si je vous comprends bien... C'est bien cela ? »","Faire préciser : « Concrètement, que feriez-vous seul ? »","Répondre, après la confirmation du client"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Accueillir, reformuler, faire préciser ; la réponse ne vient qu'après la confirmation du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la présentation des frais en rendez-vous, de la préparation à la recommandation.","elements":["Préparer les documents d'informations clés et repérer la rubrique frais","Présenter les frais du contrat et des supports, en euros sur le versement réel","Terminer par la rémunération du cabinet et ce qu'elle comprend","Demander : « Est-ce clair pour vous ? Souhaitez-vous que je vous l'adresse par écrit ? »","Formuler la recommandation"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Les frais se présentent avant la recommandation, pas après, et la rémunération du cabinet clôt la présentation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les temps d'une réponse honnête à une objection, jusqu'à la conclusion.","elements":["Reconnaître la part de vérité de l'objection","Décrire ce que le cabinet apporte","Nommer les risques et les limites","Proposer une prochaine étape datée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Une réponse honnête tient en trois temps : part de vérité, apport du cabinet, risques et limites, puis l'étape suivante.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Conclure sur une étape$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la conclusion d'un rendez-vous, de l'agenda à la trace écrite.","elements":["Proposer une action, une date et un livrable","Faire valider la prochaine étape par le client","La relire à voix haute avant de se quitter","La saisir dans le CRM dès la fin du rendez-vous, avec l'objection reformulée et la réponse donnée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Proposer, faire valider, relire à voix haute, puis saisir dans le CRM dès la fin du rendez-vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque geste de reformulation à la phrase qui l'illustre.","gauche":["Reformulation qui déforme","Reformulation qui oriente","Reformulation fidèle","Question de précision"],"droite":["« Vous trouvez que c'est trop cher », alors que le client parlait de valeur ajoutée","« Vous voulez donc un conseil personnalisé, n'est-ce pas ? »","« Si je vous comprends bien... C'est bien cela ? »","« Concrètement, que feriez-vous seul ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Déformer traduit le client, orienter déguise une réponse ; la reformulation fidèle demande validation avant une seule question.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque frais d'assurance vie au moment où il est prélevé.","gauche":["Frais sur versement","Frais de gestion","Frais d'arbitrage","Frais de retrait"],"droite":["À l'entrée, sur chaque versement","Chaque année","À chaque transfert entre supports","À la sortie, quand le client retire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Versement et retrait sont ponctuels, la gestion est annuelle, l'arbitrage suit chaque transfert entre supports.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Lettre de mission et textes$academy_deck$, 3, $academy_deck${"enonce":"Associez chaque texte à ce qu'il établit.","gauche":["Article 325-6 du règlement général de l'AMF","Article L541-8-1 du code monétaire et financier","Article L521-4 du code des assurances","Article L522-5 du code des assurances","Recommandation ACPR 2024-R-03"],"droite":["Lettre de mission signée des deux parties avant tout conseil du CIF","Le CIF agit de manière honnête, loyale et professionnelle ; information exacte, claire et non trompeuse","Exigences et besoins du client précisés par écrit avant tout contrat d'assurance","Pour les unités de compte, performance brute de frais, nette de frais et frais prélevés","Devoir de conseil dans la durée pour les contrats d'assurance vie"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3],[4,4]]}$academy_deck$::jsonb, $academy_deck$Chaque texte porte une obligation distincte : lettre de mission, loyauté et information, écrit préalable, transparence des UC, conseil dans la durée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 3, $academy_deck${"enonce":"Associez chaque famille de phrase à proscrire à l'exemple qui l'illustre.","gauche":["Promesse de résultat","Superlatif","Garantie implicite","Performance passée sans mise en garde"],"droite":["« Vous ferez mieux qu'en solo. »","« C'est le meilleur contrat. »","« C'est sécurisé. »","« Nos fonds ont fait 7 % l'an dernier, cela parle de soi-même. »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Promesse, superlatif et garantie implicite sont interdits ; une performance passée exige la mention sur les performances futures et le risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"phrase":"Répondre tout de suite à une objection, c'est répondre à la question que l'on croit avoir ___.","choix":["entendue","posée","préparée","évitée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Sans reformulation, on répond à la question que l'on croit avoir entendue ; reformuler, c'est vérifier que l'on a bien entendu.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"phrase":"En assurance vie, les frais courants d'un fonds détenu dans le contrat se lisent dans son ___.","choix":["document d'informations clés","relevé annuel de situation","bulletin de versement","compte rendu de rendez-vous"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les frais des supports sont indiqués dans le document d'informations clés de chaque fonds, à préparer avant le rendez-vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 2, $academy_deck${"phrase":"Avant de répondre, le conseiller se demande si sa phrase est vraie quel que soit le comportement des ___.","choix":["marchés","clients","assureurs","taux d'intérêt"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le test : la phrase reste-t-elle vraie quel que soit le comportement des marchés ? Sinon, on la reformule.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Conclure sur une étape$academy_deck$, 1, $academy_deck${"phrase":"Une prochaine étape comporte une action, une date, un responsable et un ___.","choix":["document","montant","objectif","risque"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les quatre composantes : une action, une date, un responsable, un document, validées avec le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"phrase":"Exemple du guide AMF : 5 000 euros placés avec 1 % de frais par an supportent ___ euros de frais la première année.","aide":"Un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["50","cinquante"]}$academy_deck$::jsonb, $academy_deck$1 % de 5 000 euros, soit 50 euros la première année ; les frais récurrents pèsent dans la durée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Répondre sans promettre$academy_deck$, 2, $academy_deck${"phrase":"Toute information adressée au client doit être exacte, claire et non ___.","aide":"Un adjectif"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["trompeuse","trompeur","trompeuses"]}$academy_deck$::jsonb, $academy_deck$Exacte, claire et non trompeuse : c'est l'exigence du code monétaire et financier (L541-8-1) et du code des assurances.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"phrase":"Après la validation de la reformulation, le conseiller pose une seule question de ___.","aide":"Un nom"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["précision","precision"]}$academy_deck$::jsonb, $academy_deck$Une seule question de précision, par exemple « Concrètement, que feriez-vous seul ? », avant toute réponse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Lettre de mission et textes$academy_deck$, 1, $academy_deck${"phrase":"Avant de formuler un conseil, le conseiller en investissements financiers soumet au client une ___ de mission signée des deux parties.","aide":"Un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["lettre","Lettre"]}$academy_deck$::jsonb, $academy_deck$La lettre de mission précède le conseil et précise rémunération, coûts et frais et mise en garde sur les risques.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Reformuler une objection$academy_deck$, 1, $academy_deck${"recto":"Les trois temps de la reformulation","verso":"Accueillir, reformuler jusqu'à « C'est bien cela ? », faire préciser par une seule question. Répondre après confirmation."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Accueillir, reformuler, faire préciser ; la réponse attend la confirmation du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Familles et étages de frais$academy_deck$, 1, $academy_deck${"recto":"Les deux étages de frais en assurance vie","verso":"Frais du contrat (versement, gestion, arbitrage) et frais des supports (frais courants du fonds, dans son document d'informations clés)."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Ne présenter qu'un étage fait croire au client qu'il paie moins qu'il ne paie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Conclure sur une étape$academy_deck$, 2, $academy_deck${"recto":"Ce qui remplace « je reviens vers vous » en fin de rendez-vous","verso":"Une action, une date, un responsable, un document : relus à voix haute, validés, saisis dans le CRM."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$« Je reviens vers vous » sans date n'est pas une prochaine étape ; les quatre composantes se valident avec le client.$academy_deck$);
end
$deck_conduire_un_rendez_vous$;
