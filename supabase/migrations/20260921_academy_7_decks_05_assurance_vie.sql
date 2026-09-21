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

-- ── Deck : Assurance vie : enveloppe, supports, frais, rachats et transmission (assurance-vie) ──
do $deck_assurance_vie$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$assurance-vie$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$assurance-vie$academy_deck$, $academy_deck$Assurance vie : enveloppe, supports, frais, rachats et transmission$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Assurance vie : enveloppe, supports, frais, rachats et transmission$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Expliquer enveloppe, supports, frais, rachats et principes de transmission$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$Disponible ne veut pas dire sans risque : l'assurance vie est une enveloppe, le rendement et le risque viennent des supports.

## Enveloppe et supports
- Fonds en euros : capital garanti par l'assureur, net des frais.
- Unités de compte : nombre de parts garanti, valeur non garantie, risque de perte en capital.
- Rachat à la valeur du jour. Renonciation : 30 jours calendaires.
- Trois questions : horizon, part intacte, baisse supportable.

## Frais et rachats
- Quatre frais : versement, gestion (fonds en euros compris), arbitrage, support.
- Paiement du rachat : deux mois au plus.
- Seuls les gains sont imposés, jamais le capital versé.
- Versements depuis le 27 septembre 2017 : 12,8 % avant huit ans, 7,5 % après (12,8 % au delà de 150 000 euros).
- Après huit ans : abattement annuel 4 600 euros (seul) ou 9 200 euros (couple).
- Prélèvements sociaux : 17,2 % (fiche F2329), 18,6 % en général. À revérifier.
- Fonds en euros : prélevés chaque année sur les intérêts.

## Transmission
- L132-13 : ni rapport ni réduction, sauf primes manifestement exagérées.
- Primes avant 70 ans : 152 500 euros par bénéficiaire, puis 20 % jusqu'à 700 000 euros, puis 31,25 %.
- Primes après 70 ans : 30 500 euros en tout, puis droits de succession.
- Conjoint marié et partenaire de PACS exonérés.
- Clause à éviter : personne sans précision, enfant sans « vivant ou représenté », montant fixe.
- Bénéficiaire acceptant : rien sans son accord.$academy_deck$, competence = coalesce(nullif($academy_deck$Expliquer enveloppe, supports, frais, rachats et principes de transmission$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 1, $academy_deck${"enonce":"Qu'est-ce que l'assurance vie ?","choix":["Une enveloppe : un contrat conclu avec un assureur, dans lequel les sommes versées sont investies sur des supports","Un support financier dont l'assureur fixe le rendement chaque année","Un placement dont le capital est garanti quel que soit le support choisi","Un compte d'épargne dont les fonds restent bloqués pendant huit ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'assurance vie est une enveloppe ; le rendement et le risque viennent des supports, pas du contrat.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$carte$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 1, $academy_deck${"recto":"Disponible veut-il dire sans risque ?","verso":"Non. Le rachat est possible à tout moment, mais à la valeur du jour des unités de compte."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L'enveloppe permet le rachat ; seul le fonds en euros garantit le capital, les unités de compte exposent à une perte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$association$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque élément du contrat à ce qu'il apporte.","gauche":["Enveloppe","Fonds en euros","Unités de compte"],"droite":["Nombre de parts garanti, valeur qui suit les marchés","Capital garanti par l'assureur, net des frais prévus au contrat","Contrat avec l'assureur qui apporte la souplesse : versements, arbitrages, rachats"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,2],[1,1],[2,0]]}$academy_deck$::jsonb, $academy_deck$L'enveloppe donne la souplesse ; le fonds en euros garantit le capital, les unités de compte seulement un nombre de parts.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 1, $academy_deck${"enonce":"Sur le fonds en euros, l'assureur garantit le capital investi, net des frais prévus au contrat, et les intérêts acquis restent acquis."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$C'est la définition du fonds en euros ; la garantie n'exclut ni les frais de gestion ni les prélèvements sociaux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 1, $academy_deck${"enonce":"Sur une unité de compte, que garantit l'assureur ?","choix":["Le capital investi, net des frais","Un nombre de parts, pas leur valeur","La valeur des parts au jour du versement","Les intérêts acquis, qui restent acquis"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'assureur garantit un nombre de parts ; leur valeur suit les marchés, d'où un risque de perte en capital.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$trou_choix$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 2, $academy_deck${"phrase":"Un contrat investi pour partie en unités de compte reste rachetable, mais ___.","choix":["à la valeur du jour, qui peut être inférieure aux sommes versées","au capital net des frais, garanti par l'assureur","uniquement après le délai de renonciation de 30 jours","uniquement avec l'accord du bénéficiaire, qu'il ait accepté ou non"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Un rachat sur unités de compte se fait à la valeur du jour ; le client peut récupérer moins que ses versements.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client vous dit : « Avec l'assurance vie, je peux retirer quand je veux, donc je ne peux pas perdre d'argent. » Quelle réponse est juste ?","choix":["Le rachat est possible à tout moment, mais sur les unités de compte il se fait à la valeur du jour, qui peut être inférieure aux versements","C'est exact : l'assureur garantit au moins les sommes versées, quel que soit le support","C'est exact avant huit ans ; ensuite l'épargne est bloquée","Le rachat n'est possible qu'après huit ans, ce qui protège le capital"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Disponible ne veut pas dire sans risque : seul le fonds en euros garantit le capital.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Une cliente dispose de 60 000 euros. Elle aura besoin de 20 000 euros dans dix-huit mois pour des travaux ; le reste n'a pas d'usage prévu avant dix ans. Quelle orientation retenir pour les 20 000 euros ?","choix":["Un support sans risque de perte en capital, car l'horizon est court et la somme doit être retrouvée intacte","Des unités de compte, car dix-huit mois suffisent pour absorber une baisse","La même répartition que les 40 000 euros restants, pour simplifier le contrat","Aucune décision possible : l'assurance vie bloque les fonds pendant huit ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le support découle de l'horizon et de la part à retrouver intacte ; une somme à court terme ne s'expose pas au risque de perte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$ordre$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la démarche en rendez-vous avant de parler de supports.","elements":["« Quelle baisse temporaire pourriez-vous supporter sans racheter ? »","« Quand aurez-vous besoin de ces sommes ? »","Reformuler : retrait possible à tout moment, mais à la valeur du jour des unités de compte","« Quelle part devez-vous pouvoir retrouver intacte ? »","Remettre la note d'information et le document d'informations clés"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[1,3,0,2,4]}$academy_deck$::jsonb, $academy_deck$Trois questions dans l'ordre (horizon, part intacte, baisse supportable), puis la reformulation, puis les documents précontractuels.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Rachat et délais$academy_deck$, 1, $academy_deck${"enonce":"Après avoir été informé de la conclusion du contrat, le client dispose de 30 jours calendaires pour y renoncer."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le délai de renonciation est de 30 jours calendaires après l'information de la conclusion du contrat.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$multi$academy_deck$, $academy_deck$Enveloppe et supports$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client veut placer 120 000 euros et réclame une répartition fonds en euros / unités de compte dès le premier entretien. Cochez tout ce que le conseiller doit connaître avant de proposer une répartition.","choix":["L'horizon de chaque somme","L'épargne de précaution dont il dispose déjà","Son rapport au risque et la baisse temporaire qu'il accepterait sans racheter","Le rendement du fonds en euros de l'année passée","Le délai de paiement d'un rachat par l'assureur"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Horizon, épargne de précaution, rapport au risque, situation fiscale et objectifs : sans cela, aucune répartition ne peut être argumentée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$multi$academy_deck$, $academy_deck$Frais du contrat$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des familles de frais d'un contrat d'assurance vie.","choix":["Frais sur versement","Frais d'arbitrage","Prélèvements sociaux","Abattement annuel de 4 600 euros","Frais propres à chaque unité de compte"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,4]}$academy_deck$::jsonb, $academy_deck$Quatre familles : versement, gestion, arbitrage, support ; les prélèvements sociaux sont un impôt, l'abattement une règle fiscale.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$association$academy_deck$, $academy_deck$Frais du contrat$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque famille de frais au moment où elle s'applique.","gauche":["Frais sur versement","Frais de gestion du contrat","Frais d'arbitrage","Frais du support"],"droite":["Chaque année sur l'épargne, fonds en euros compris","À l'entrée, sur chaque somme versée","Quand le client change de support","Prélevés à l'intérieur de chaque unité de compte"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,1],[1,0],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Versement à l'entrée, gestion chaque année, arbitrage au changement de support, frais du support dans l'unité de compte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Frais du contrat$academy_deck$, 2, $academy_deck${"enonce":"Les frais de gestion du contrat ne s'appliquent pas à l'épargne placée sur le fonds en euros."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Les frais de gestion du contrat sont prélevés chaque année sur l'épargne, fonds en euros compris.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$choix$academy_deck$, $academy_deck$Frais du contrat$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client lit la ligne « frais de gestion du contrat » sur son relevé annuel et conclut qu'il connaît le coût total de son assurance vie. Que lui manque-t-il ?","choix":["Les frais propres à chaque unité de compte, prélevés à l'intérieur du support, et les éventuels frais d'arbitrage et de gestion déléguée","Rien : les frais de gestion du contrat regroupent l'ensemble des frais","Les prélèvements sociaux, qui sont des frais de l'assureur","Les frais sur versement, qui sont prélevés chaque année"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les frais du support sont absents de la ligne « frais de gestion du contrat » ; le document d'informations clés les affiche.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$choix$academy_deck$, $academy_deck$Rachat et délais$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif. Un client a envoyé une demande de rachat total avec toutes les pièces. Trois semaines plus tard, il s'inquiète de ne rien avoir reçu. Que lui répondre ?","choix":["L'assureur dispose au plus de deux mois à compter de la réception du dossier complet ; au delà, des intérêts de retard courent","Le délai légal est de dix jours ouvrés ; il faut saisir immédiatement le médiateur","Aucun délai n'encadre le paiement d'un rachat ; seul le contrat en décide","Le rachat total n'est pas possible avant huit ans ; il faut attendre l'échéance"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$ABE Info Service rappelle le délai maximal de deux mois à réception de l'intégralité des pièces, puis des intérêts de retard.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 1, $academy_deck${"phrase":"Pour les versements effectués depuis le 27 septembre 2017, les gains rachetés avant huit ans supportent un prélèvement forfaitaire de ___ %.","aide":"taux en chiffres"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["12,8","12.8","12,8 %","12.8 %","12,8%","12.8%"]}$academy_deck$::jsonb, $academy_deck$12,8 % avant huit ans, 7,5 % après (12,8 % pour la fraction des primes au delà de 150 000 euros).$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$ordre$academy_deck$, $academy_deck$Rachat et délais$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre chronologique la vie d'un contrat, de la souscription au rachat.","elements":["Le délai de renonciation de 30 jours calendaires court","Le client envoie une demande de rachat avec le dossier complet","L'assureur paie sous deux mois au plus","Passé ce délai, des intérêts de retard courent","L'assureur adresse chaque année un relevé de situation avec les frais prélevés","Le client est informé de la conclusion du contrat"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[5,0,4,1,2,3]}$academy_deck$::jsonb, $academy_deck$Information, renonciation sous 30 jours, relevé annuel, demande de rachat, paiement sous deux mois, puis intérêts de retard.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$association$academy_deck$, $academy_deck$Rachat et délais$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque repère à sa durée ou à sa date.","gauche":["Délai de renonciation","Délai maximal de paiement d'un rachat","Ancienneté du contrat ouvrant l'abattement annuel","Date charnière des versements pour les taux de 12,8 % et 7,5 %"],"droite":["30 jours calendaires","Huit ans","Deux mois à réception du dossier complet","27 septembre 2017"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,2],[2,1],[3,3]]}$academy_deck$::jsonb, $academy_deck$Renonciation 30 jours, paiement deux mois, abattement après huit ans, régime des versements depuis le 27 septembre 2017.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 1, $academy_deck${"enonce":"Lors d'un rachat partiel, le capital versé par le client est imposé à l'impôt sur le revenu au même titre que les gains."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Seule la part de gains comprise dans le rachat est imposable ; le capital versé revient sans impôt.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 1, $academy_deck${"phrase":"Après huit ans, l'abattement annuel sur les gains rachetés est de ___ euros pour une personne seule.","aide":"montant en euros"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["4600","4 600","4.600","4600 euros","4 600 euros"]}$academy_deck$::jsonb, $academy_deck$4 600 euros pour une personne seule, 9 200 euros pour un couple soumis à imposition commune.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$multi$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui s'applique aux gains rachetés sur un contrat de plus de huit ans, alimenté par des versements postérieurs au 27 septembre 2017 et inférieurs à 150 000 euros.","choix":["Un abattement annuel de 4 600 ou 9 200 euros","Un prélèvement forfaitaire de 7,5 % sur le solde","L'option pour le barème progressif","Une exonération totale d'impôt sur le revenu","Une dispense de prélèvements sociaux"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Abattement annuel, puis 7,5 % ou barème sur option ; les prélèvements sociaux restent dus dans tous les cas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$choix$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un couple soumis à imposition commune rachète, sur un contrat de dix ans alimenté uniquement par des versements postérieurs au 27 septembre 2017 pour un total inférieur à 150 000 euros, une somme contenant 12 000 euros de gains. Comment ces gains sont-ils traités à l'impôt sur le revenu, hors prélèvements sociaux ?","choix":["Abattement de 9 200 euros, puis prélèvement de 7,5 % sur le solde (ou barème progressif sur option)","Abattement de 4 600 euros, puis prélèvement de 12,8 % sur le solde","Exonération totale, car le contrat a plus de huit ans","Prélèvement de 12,8 % sur la totalité des 12 000 euros, sans abattement"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Après huit ans, 9 200 euros d'abattement pour un couple, puis 7,5 % jusqu'à 150 000 euros de primes (fiche F22414).$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client rachète 30 000 euros sur un contrat de onze ans, alimenté par des versements postérieurs au 27 septembre 2017 et inférieurs à 150 000 euros. Remettez dans l'ordre les étapes du traitement fiscal de ce rachat.","elements":["Le capital versé compris dans le rachat revient sans impôt","L'assureur calcule au prorata la part de gains comprise dans le rachat","Les prélèvements sociaux s'ajoutent sur les gains","L'abattement annuel de 4 600 ou 9 200 euros s'impute sur les gains","Le solde des gains supporte 7,5 %, ou le barème progressif sur option"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[1,0,3,4,2]}$academy_deck$::jsonb, $academy_deck$Prorata des gains, capital hors impôt, abattement annuel, 7,5 % sur le solde, prélèvements sociaux en plus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$trou_choix$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 1, $academy_deck${"phrase":"Les produits des contrats d'assurance vie supportent des prélèvements sociaux au taux global de ___ (fiche F2329 vérifiée le 30 juin 2026).","choix":["17,2 %","18,6 %","12,8 %","7,5 %"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$17,2 % pour l'assurance vie (CSG 9,2 %, CRDS 0,5 %, solidarité 7,5 %) ; 18,6 % est le taux général depuis 2026.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$choix$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un conseiller annonce à un client dont l'épargne est sur le fonds en euros : « Zéro impôt tant que vous ne rachetez pas. » Qu'en penser ?","choix":["Inexact : les prélèvements sociaux sont prélevés chaque année lors de l'inscription des intérêts en compte","Exact : aucun prélèvement n'intervient avant un rachat, quel que soit le support","Inexact : l'impôt sur le revenu est prélevé chaque année sur les intérêts du fonds en euros","Exact seulement après huit ans, grâce à l'abattement annuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Sur le fonds en euros, les prélèvements sociaux sont dus chaque année à l'inscription des intérêts en compte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque situation au régime des capitaux décès qui s'applique.","gauche":["Primes versées avant 70 ans","Primes versées après 70 ans","Conjoint marié ou partenaire de PACS","Primes manifestement exagérées"],"droite":["Exception à l'article L132-13 : rapport et réduction redeviennent possibles","Exonération, quel que soit l'âge au versement","Abattement global de 30 500 euros, puis droits de succession","Abattement de 152 500 euros par bénéficiaire, puis 20 % et 31,25 %"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,3],[1,2],[2,1],[3,0]]}$academy_deck$::jsonb, $academy_deck$Le régime dépend de l'âge au versement ; le conjoint et le partenaire de PACS sont exonérés ; les primes exagérées sont requalifiables.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$trou_choix$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 1, $academy_deck${"phrase":"Pour les primes versées avant 70 ans, chaque bénéficiaire dispose d'un abattement de ___ euros.","choix":["152 500","30 500","150 000","700 000"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$152 500 euros par bénéficiaire pour les primes versées avant 70 ans ; 30 500 euros en tout après 70 ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 1, $academy_deck${"phrase":"Pour les primes versées après 70 ans, l'abattement est global et s'élève à ___ euros, tous contrats et bénéficiaires confondus.","aide":"montant en euros"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["30500","30 500","30.500","30500 euros","30 500 euros"]}$academy_deck$::jsonb, $academy_deck$30 500 euros en tout après 70 ans ; le surplus des primes suit les droits de succession selon le lien de parenté.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$carte$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 1, $academy_deck${"recto":"Primes versées avant 70 ans : quel prélèvement au delà de l'abattement de 152 500 euros ?","verso":"20 % jusqu'à 700 000 euros, puis 31,25 % au delà."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Après l'abattement de 152 500 euros par bénéficiaire, 20 % jusqu'à 700 000 euros puis 31,25 %.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 1, $academy_deck${"enonce":"Le conjoint marié et le partenaire de PACS sont exonérés sur les capitaux décès, que les primes aient été versées avant ou après 70 ans."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le conjoint marié et le partenaire de PACS sont exonérés dans les deux régimes, avant et après 70 ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$choix$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client de 72 ans souhaite verser 100 000 euros sur une assurance vie au profit de ses deux enfants « pour profiter des 152 500 euros par enfant ». Que lui expliquer ?","choix":["L'abattement de 152 500 euros par bénéficiaire ne concerne que les primes versées avant 70 ans ; après 70 ans, c'est un abattement global de 30 500 euros, puis les droits de succession sur le surplus des primes","Il a raison : l'abattement de 152 500 euros s'applique quel que soit l'âge au versement","Après 70 ans, plus aucun versement n'est autorisé sur une assurance vie","Après 70 ans, le capital transmis est intégralement exonéré pour les enfants"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le régime des capitaux décès dépend de l'âge de l'assuré au moment des versements ; après 70 ans, 30 500 euros en tout.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Fiscalité décès$academy_deck$, 2, $academy_deck${"phrase":"Selon l'article L132-13 du code des assurances, le capital décès n'est soumis ni au rapport à succession ni à la réduction pour atteinte à la réserve, sauf ___.","choix":["primes manifestement exagérées au regard des facultés du souscripteur","primes versées après 70 ans","acceptation du bénéfice par un bénéficiaire","contrat de moins de huit ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'article L132-13 réserve le cas des primes manifestement exagérées eu égard aux facultés du souscripteur.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$multi$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 2, $academy_deck${"enonce":"Cochez toutes les rédactions de clause bénéficiaire qu'ABE Info Service invite à éviter.","choix":["Une personne nommée sans précision","Un enfant désigné sans la mention « vivant ou représenté »","Une répartition en pourcentage entre les bénéficiaires","Des parts exprimées en montant fixe","Une modification de la clause par courrier signé"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$À éviter : personne sans précision, enfant sans « vivant ou représenté », bénéficiaires difficiles à identifier, parts en montant fixe.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 2, $academy_deck${"phrase":"Dans une clause bénéficiaire, un enfant se désigne avec la mention « vivant ou ___ ».","aide":"un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["représenté","represente","représentés","representes","représentée","representee"]}$academy_deck$::jsonb, $academy_deck$La mention « vivant ou représenté » prévoit le prédécès de l'enfant ; sans elle, la répartition devient inadaptée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Une cliente a fait accepter le bénéfice de son contrat par son fils il y a trois ans. Elle peut aujourd'hui modifier seule la clause bénéficiaire."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Un bénéficiaire acceptant bloque toute modification de la clause et tout rachat sans son accord.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$multi$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Le fils d'une cliente a accepté le bénéfice de son contrat. Cochez toutes les opérations qui exigent désormais son accord.","choix":["Un rachat partiel ou total","Une avance","Un versement libre complémentaire","La modification de la clause bénéficiaire","La réception du relevé de situation annuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$L'accord du bénéficiaire acceptant est requis pour le rachat, l'avance, le nantissement et la modification de la clause.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Fiscalité du rachat$academy_deck$, 2, $academy_deck${"recto":"Quels événements exonèrent d'impôt sur le revenu les gains d'un rachat ?","verso":"Licenciement, retraite anticipée, invalidité, liquidation judiciaire, sous condition de délai."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Ces événements exonèrent d'impôt sur le revenu sous condition de délai ; les prélèvements sociaux restent dus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$choix$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client vous montre sa clause : « Mes enfants Paul et Léa, 50 000 euros chacun, le solde à mon conjoint. » Quel est le principal point de vigilance à lui signaler ?","choix":["Les parts en montant fixe et l'absence de la mention « vivants ou représentés » exposent à une répartition inadaptée si la valeur du contrat évolue ou si un enfant décède avant lui","La clause est parfaite : elle nomme précisément chaque bénéficiaire","Le conjoint ne peut jamais être bénéficiaire d'une assurance vie","Il faut convertir la clause en rente viagère pour éviter les droits de succession"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Parts en valeur absolue et enfant désigné sans prévoir son prédécès sont deux rédactions à éviter ; préférer un pourcentage.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$ordre$academy_deck$, $academy_deck$Clause bénéficiaire$academy_deck$, 3, $academy_deck${"enonce":"Remettez dans l'ordre la démarche du conseiller sur la clause bénéficiaire en rendez-vous.","elements":["Consigner la clause retenue au dossier et la réexaminer au point annuel","Poser la question : « Si vous disparaissiez demain, qui recevrait ce contrat ? »","Situer les régimes avant et après 70 ans en citant la source et sa date","Faire relire par le notaire toute clause complexe","Demander à voir la clause actuelle, pas seulement le nom du bénéficiaire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[4,1,2,3,0]}$academy_deck$::jsonb, $academy_deck$Lire la clause, questionner le souhait, situer les régimes, faire relire par le notaire, consigner et réexaminer.$academy_deck$);
end
$deck_assurance_vie$;
