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

-- ── Deck : Réussir la découverte client (reussir-la-decouverte) ──
do $deck_reussir_la_decouverte$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$reussir-la-decouverte$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$reussir-la-decouverte$academy_deck$, $academy_deck$Réussir la découverte client$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Réussir la découverte client$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Recueillir objectifs, horizon, situation, liquidité et tolérance au risque$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$La découverte commence par les projets, pas par la solution.

## Objectifs et horizon
- « Un PER » est une intention, pas un objectif ; l'objectif est le projet de vie derrière la demande.
- Chaque objectif reçoit une date, même approximative : l'horizon, période sans besoin de la somme.
- Objectifs implicites à demander : protection de la famille, transmission, baisse de revenus à la retraite.

## Situation financière et liquidité
- Situation : revenus réguliers, patrimoine, emprunts, capacité d'épargne, justificatifs à l'appui.
- Trois poches, dans l'ordre : précaution disponible et sûre (AMF : 2 à 6 mois de revenus), projets datés, long terme.
- PER individuel : bloqué en principe jusqu'à la retraite, déblocages anticipés limitativement prévus.
- Assurance vie : rachetable, versement sous deux mois au plus, fiscalité selon l'ancienneté.
- SCPI : acheteur non garanti, délai variable. Disponible ne veut pas dire immédiat.

## Tolérance et capacité de perte
- Tolérance : ce que le client accepte. Capacité : ce que sa situation autorise. La plus prudente commande.
- Le risque se dit en euros et en durée, pas en pourcentage seul ; le vécu prime sur le déclaré.
- Seul le fonds en euros garantit le capital ; les unités de compte peuvent perdre.

## Obligations avant tout conseil
- L541-8-1 du code monétaire et financier : connaissances, expérience, situation, objectifs, capacité de perte, tolérance ; à défaut, le conseiller s'abstient.
- L522-5 du code des assurances : exigences et besoins par écrit pour l'assurance vie.
- Premier entretien : aucune recommandation. L'avantage fiscal est une conséquence de la stratégie, jamais son point de départ.
$academy_deck$, competence = coalesce(nullif($academy_deck$Recueillir objectifs, horizon, situation, liquidité et tolérance au risque$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 1, $academy_deck${"enonce":"Un client ouvre le premier rendez-vous par : « Je veux ouvrir un PER. » Quelle réponse est conforme à la méthode de découverte ?","choix":["Préparer une simulation de PER pour le prochain rendez-vous","Lui demander à quoi cette épargne doit servir et à quelle date","Lui présenter aussi l'assurance vie pour qu'il puisse comparer","Vérifier d'abord sa tranche marginale d'imposition"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La demande d'entrée n'est pas un objectif : le conseiller cherche d'abord les projets de vie et la date de chacun.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Madame Roux, 45 ans, veut investir 40 000 euros. Elle évoque les études de son fils dans trois ans et sa retraite dans vingt ans. Comment le conseiller traite-t-il la somme ?","choix":["Un seul horizon, le plus long, parce qu'il laisse le plus de temps à l'épargne","Deux poches distinctes, l'une à trois ans, l'autre à vingt ans","Un horizon moyen d'une dizaine d'années, pour concilier les deux projets","Attendre que les études soient financées avant d'investir quoi que ce soit"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Deux objectifs, deux horizons, donc deux poches ; un horizon unique ou moyen ne correspond à aucun des deux projets.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Obligations avant conseil$academy_deck$, 2, $academy_deck${"enonce":"Un client refuse de préciser ses objectifs et demande simplement « ce qui rapporte le mieux ». Que fait le conseiller en investissements financiers selon le code monétaire et financier ?","choix":["Il recommande une solution prudente par défaut","Il s'abstient de recommander l'opération et le consigne","Il recommande en précisant que c'est sous réserve des objectifs","Il applique le profil le plus courant de sa clientèle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'article L541-8-1 prévoit que, sans les informations requises, le conseiller s'abstient de recommander.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 1, $academy_deck${"enonce":"Un client dispose d'une somme à investir et n'a aucune réserve disponible. Selon l'ordre recommandé par l'AMF, quelle poche constitue-t-il en premier ?","choix":["L'épargne de long terme, car elle a le plus de temps devant elle","L'épargne de projet, pour financer les dépenses prévues","L'épargne de précaution, disponible et sûre","L'épargne fiscalement déductible, pour réduire l'impôt de l'année"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'AMF recommande d'abord une épargne de précaution disponible et sûre, puis une épargne de projet.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Monsieur Ibarra dispose de 60 000 euros. Sous douze mois, il prévoit un dépôt de garantie et des travaux estimés à 25 000 euros. Il n'a aucune autre réserve. Quelle organisation est cohérente ?","choix":["Les 60 000 euros sur un PER, pour profiter de la déduction fiscale","Les 60 000 euros en assurance vie sur des unités de compte, rachetables si besoin","Une réserve disponible couvrant les 25 000 euros et une épargne de précaution, le reste seulement engagé dans la durée","Ne rien engager avant la fin des travaux"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Le besoin à douze mois est connu : le PER est bloqué en principe et des unités de compte peuvent être en perte avant l'échéance.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un dirigeant déclare accepter volontiers les fluctuations, mais il n'a aucune réserve disponible et deux échéances lourdes dans l'année. Qu'est-ce qui commande la recommandation ?","choix":["Sa tolérance au risque, élevée, puisqu'il l'assume","Sa capacité à subir des pertes, plus faible que sa tolérance","Une moyenne entre les deux, pour ne pas le frustrer","Le rendement attendu de la solution envisagée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Tolérance et capacité sont distinctes et la plus prudente des deux commande ; ici la situation ne laisse pas de marge.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 2, $academy_deck${"enonce":"Quelle est la façon la plus fiable d'apprécier la tolérance au risque d'un client en rendez-vous ?","choix":["Lui expliquer la définition de la volatilité et vérifier qu'il l'a comprise","Lui demander ce qu'il ferait si sa poche valait 20 % de moins dans un an, et ce qu'il a fait lors d'une baisse passée","Lui faire cocher un profil dans le questionnaire et s'y tenir","Déduire son profil de sa profession et de son niveau de revenus"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le risque s'explique en euros et en durée, et l'expérience vécue pèse plus que le profil déclaré.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Madame Nadal se déclare « dynamique ». Elle a vendu ses fonds actions il y a quelques années après une baisse de 25 %. Ses revenus sont élevés et stables, sans échéance particulière. Que consignez-vous ?","choix":["Profil dynamique confirmé par sa situation financière ; l'étude peut porter sur des unités de compte","Un écart entre tolérance déclarée et tolérance observée, à approfondir sur un scénario de baisse avant l'étude","Profil prudent ; l'étude ne portera que sur le fonds en euros","Profil dynamique, avec une part d'unités de compte réduite pour compenser"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La vente après une baisse contredit le profil déclaré : on consigne l'écart et on le travaille avant toute étude.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Madame Lenoir a reçu 70 000 euros. Son associé pourrait lui proposer de racheter ses parts dans dix-huit mois. Elle demande : « On ouvre le PER avec les 70 000 ? » Que répondez-vous ?","choix":["Oui, pour obtenir l'avantage fiscal avant la fin de l'année","Non, définitivement, puisqu'elle n'a jamais détenu d'unités de compte","Ni oui ni non : le PER est bloqué en principe et le rachat de parts n'est pas un cas de déblocage","Oui pour la moitié, l'autre moitié en assurance vie rachetable si besoin"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Une partie de la somme peut être appelée dans dix-huit mois ; seule la poche long terme sera examinée lors de l'étude, PER compris.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 1, $academy_deck${"enonce":"Selon le guide AMF « Investir votre épargne : étape par étape », à quoi doit correspondre la durée retenue pour un placement ?","choix":["À la durée de vie du produit le plus rentable","À une période pendant laquelle le client n'aura pas besoin de la somme","Au nombre d'années restant avant la retraite du client","À la durée du crédit en cours le plus long"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'objectif oriente le choix de l'investissement et l'horizon est une période sans besoin de la somme.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 1, $academy_deck${"enonce":"Noter « long terme » comme horizon, sans date, suffit pour choisir une enveloppe adaptée."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Un horizon sans date ne permet ni de choisir une enveloppe ni de vérifier plus tard que la stratégie tient.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 3, $academy_deck${"enonce":"Un contrat d'assurance vie étant rachetable, la somme investie est disponible immédiatement et sans conséquence."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$L'assureur dispose d'un délai pouvant aller jusqu'à deux mois et la fiscalité du rachat dépend de l'ancienneté du contrat.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 1, $academy_deck${"enonce":"Dans la méthode Entasis, le conseiller ne formule aucune recommandation lors du premier entretien d'écoute."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le premier échange sert à comprendre la situation, les projets et le rapport au risque ; l'étude vient ensuite.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 2, $academy_deck${"enonce":"Quand la tolérance au risque et la capacité à subir des pertes divergent, la plus prudente des deux commande la recommandation."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Un client audacieux sans réserve n'a pas de marge, un client aisé mais anxieux ne tiendra pas une baisse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 3, $academy_deck${"enonce":"Le repère AMF de 2 à 6 mois de revenus pour l'épargne de précaution est une règle légale que le conseiller doit appliquer."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Ce repère est une recommandation pédagogique, pas une règle légale ; il se discute avec le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 2, $academy_deck${"enonce":"Dans un contrat d'assurance vie, seul le fonds en euros comporte une garantie du capital, dans les conditions prévues par le contrat."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Les unités de compte présentent un risque de perte en capital ; l'assurance vie n'est pas un support sans risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Obligations avant conseil$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce que le conseiller en investissements financiers doit se procurer avant de formuler un conseil (code monétaire et financier, article L541-8-1).","choix":["La situation financière du client","Ses objectifs d'investissement","Sa tolérance au risque","Le rendement attendu de la solution envisagée","Le plafond de déduction du PER"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$L'article vise les connaissances et l'expérience, la situation financière, les objectifs, la capacité de perte et la tolérance au risque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des objectifs implicites, ceux que le client n'évoque pas spontanément et qu'il faut lui demander.","choix":["La protection de la famille","La transmission","La baisse de revenus à la retraite","Le remplacement d'un véhicule","Les études d'un enfant"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Protection de la famille, transmission et baisse de revenus à la retraite ne sont pas exprimées spontanément ; il faut les demander.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie de la situation financière que le guide AMF demande de recueillir avant de proposer un produit.","choix":["Les revenus réguliers","Les emprunts en cours","La capacité d'épargne","Le type de risque refusé","La date de chaque projet","L'expérience passée en unités de compte"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$La situation financière regroupe revenus réguliers, patrimoine, emprunts en cours et capacité d'épargne.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui figure parmi les cas de déblocage anticipé d'un PER individuel prévus par la loi.","choix":["L'acquisition de la résidence principale","L'expiration des droits au chômage","L'invalidité","Le rachat de parts d'un cabinet","Le changement de véhicule","Le financement des études d'un enfant"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Les cas sont limitativement énumérés ; le rachat de parts, un véhicule ou des études n'en font pas partie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Madame Lenoir a hérité de 70 000 euros, son compte est juste en fin de mois, elle se dit « pas stressée » mais n'a jamais détenu d'unités de compte, et veut un PER. Cochez tout ce qu'il fallait éviter.","choix":["Ouvrir le PER avec la totalité de la somme","Conclure « profil dynamique » sur une phrase","Citer un plafond de déduction de mémoire","Lui demander une fourchette du rachat auprès de son associé","Constituer d'abord une épargne de précaution"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Le plafond se vérifie sur la source officielle, la tolérance s'observe, et une partie de la somme peut être appelée sous dix-huit mois.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre les étapes de la méthode Entasis, du premier entretien à la restitution.","elements":["Annoncer au client la suite du parcours","Consigner dans le CRM les objectifs, l'horizon et la priorité","Mener l'étude avec une simulation chiffrée","Écouter la situation, les projets et le rapport au risque","Remettre une feuille de route argumentée"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[3,1,0,2,4]}$academy_deck$::jsonb, $academy_deck$L'écoute vient d'abord, puis l'étude chiffrée, puis la feuille de route ; rien n'est recommandé au premier échange.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les trois questions à poser en rendez-vous pour cerner la situation et le besoin de liquidité, puis ce que l'on fait des réponses.","elements":["Noter les réponses avec les montants","« Quelles dépenses importantes voyez-vous venir dans les deux ans ? »","« Que vous reste-t-il en fin de mois ? »","« Si vous deviez sortir la moitié de cette somme dans six mois, pour quelle raison serait-ce ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[2,1,3,0]}$academy_deck$::jsonb, $academy_deck$Reste en fin de mois, dépenses à deux ans, scénario de sortie à six mois, puis les montants notés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la conduite du recueil des objectifs au premier entretien.","elements":["Reformuler chaque projet avec une date","Classer les projets par priorité avec le client, pas à sa place","Demander ce qui se passerait si un projet devait être avancé","Ouvrir par une question large : « Qu'est-ce que cet argent doit vous permettre de faire, et quand ? »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[3,0,1,2]}$academy_deck$::jsonb, $academy_deck$Question large, reformulation datée, priorisation par le client, puis test d'un projet avancé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la construction des poches avec un client qui vient de recevoir une somme.","elements":["Réserver seulement le reliquat au long terme","Examiner, lors de l'étude, les enveloppes possibles sur ce reliquat","Dimensionner une poche pour les projets datés","Constituer une épargne de précaution disponible et sûre"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[3,2,0,1]}$academy_deck$::jsonb, $academy_deck$Précaution d'abord, projets datés ensuite, long terme avec le reliquat ; l'étude vient après.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque notion à sa définition.","gauche":["Tolérance au risque","Capacité à subir des pertes","Horizon","Objectif"],"droite":["Le projet de vie derrière la demande d'entrée","Ce que sa situation autorise sans remettre en cause un projet","Ce que le client accepte : voir son épargne baisser sans vendre","La date, même approximative, attachée à un projet"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,2],[1,1],[2,3],[3,0]]}$academy_deck$::jsonb, $academy_deck$Tolérance et capacité sont deux informations distinctes ; l'objectif et son horizon les précèdent.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque poche ou enveloppe à sa règle de disponibilité.","gauche":["PER individuel","Contrat d'assurance vie","Parts de SCPI","Épargne de précaution"],"droite":["Bloqué en principe jusqu'à la retraite, hors cas limitativement prévus","Revente sur un marché où l'acheteur n'est pas garanti, délai pouvant s'allonger","Disponible et sûre, repère AMF de 2 à 6 mois de revenus","Rachat possible, versement sous deux mois au plus, fiscalité selon l'ancienneté"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,3],[2,1],[3,2]]}$academy_deck$::jsonb, $academy_deck$Disponible ne veut pas dire immédiat : chaque enveloppe a son délai, ses conditions et sa fiscalité.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Obligations avant conseil$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque texte ou guide à ce qu'il établit.","gauche":["Code monétaire et financier, article L541-8-1","Code des assurances, article L522-5","Guide AMF « Épargner à son rythme » (2023)","Guide AMF « Investir votre épargne : étape par étape »"],"droite":["Les exigences et besoins du souscripteur sont précisés par écrit avant une assurance vie ou un contrat de capitalisation","Le conseiller en investissements financiers recueille les informations avant tout conseil, sinon s'abstient","Constituer d'abord une épargne de précaution disponible et sûre, de 2 à 6 mois de revenus","L'objectif oriente le choix du placement et l'horizon est une période sans besoin de la somme"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,1],[1,0],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Deux articles fixent les obligations, deux guides AMF donnent les repères de méthode.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 3, $academy_deck${"enonce":"Associez chaque erreur fréquente à la bonne pratique qui la corrige.","gauche":["Annoncer « une volatilité de 15 % »","Se contenter d'une case « dynamique » cochée","Noter un horizon « long terme »","Retenir les montants que le client cite de mémoire"],"droite":["Reformuler le projet avec une date, même approximative","Demander relevés, tableaux d'amortissement et avis d'imposition","Dire « 120 000 euros qui peuvent valoir 96 000 euros pendant plusieurs mois »","Demander ce qu'il a fait lors d'une baisse passée, montants à l'appui"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,2],[1,3],[2,0],[3,1]]}$academy_deck$::jsonb, $academy_deck$Le risque se dit en euros et en durée, l'expérience vécue prime, l'horizon est daté et la situation est justifiée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Objectifs et horizon$academy_deck$, 1, $academy_deck${"phrase":"Une personne qui arrive en disant « je veux ouvrir un PER » exprime une ___, pas un objectif.","choix":["intention","priorité","stratégie","contrainte"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'objectif, c'est ce que l'argent doit rendre possible ; la demande d'entrée n'en est que l'intention.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 2, $academy_deck${"phrase":"Le questionnaire de tolérance au risque est un ___, pas une preuve de compréhension.","choix":["support","contrat","justificatif","engagement"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une case « dynamique » cochée ne suffit pas : le questionnaire est un support, la compréhension se vérifie en entretien.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Liquidité des enveloppes$academy_deck$, 2, $academy_deck${"phrase":"Après une demande de rachat sur un contrat d'assurance vie, l'assureur dispose d'un délai légal pouvant aller jusqu'à ___ pour verser les fonds.","choix":["deux mois","six mois","dix-huit mois","deux ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le rachat est possible, mais le versement peut prendre jusqu'à deux mois et la fiscalité dépend de l'ancienneté du contrat.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Conduite de l'entretien$academy_deck$, 2, $academy_deck${"phrase":"Dans la méthode Entasis, l'avantage fiscal est une ___ de la stratégie, jamais son point de départ.","choix":["conséquence","condition","priorité","garantie"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$L'étude chiffre ce que l'avantage fiscal vaut réellement dans la situation du client ; il ne commande pas la stratégie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 1, $academy_deck${"phrase":"L'AMF propose comme repère une épargne de précaution représentant de 2 à ___ mois de revenus.","aide":"Un chiffre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["6","six"]}$academy_deck$::jsonb, $academy_deck$Le guide « Épargner à son rythme » (2023) retient de 2 à 6 mois de revenus, à ajuster avec le client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Obligations avant conseil$academy_deck$, 1, $academy_deck${"phrase":"L'obligation de recueillir les informations sur le client avant tout conseil figure à l'article L541-8-1 du code ___ et financier.","aide":"Un adjectif"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["monétaire","monetaire"]}$academy_deck$::jsonb, $academy_deck$C'est le code monétaire et financier qui impose au conseiller en investissements financiers de se procurer ces informations.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 2, $academy_deck${"phrase":"En rendez-vous, on pose la question du risque en euros et en temps : « Si cette somme valait ___ % de moins dans un an, que feriez-vous ? »","aide":"Un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["20","vingt"]}$academy_deck$::jsonb, $academy_deck$Une baisse de 20 % dans un an rend le risque concret ; on écoute la réaction autant que la réponse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 3, $academy_deck${"phrase":"Cas fictif. Monsieur Delcourt se dit « joueur », mais il a vendu ses actions il y a trois ans après une baisse de 30 %. Sa tolérance déclarée est haute, sa tolérance ___ est faible.","aide":"Un participe passé"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["observée","observee","vécue","vecue"]}$academy_deck$::jsonb, $academy_deck$L'expérience vécue pèse plus que le profil déclaré ; le conseiller consigne l'écart entre les deux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Situation financière du client$academy_deck$, 1, $academy_deck${"recto":"Les trois poches de l'épargne, dans l'ordre","verso":"Précaution disponible et sûre, puis projets datés, puis long terme avec le reliquat."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L'AMF fixe les deux premières ; le long terme est un découpage pédagogique du module.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Tolérance et capacité de perte$academy_deck$, 1, $academy_deck${"recto":"Tolérance au risque et capacité à subir des pertes : quelle différence ?","verso":"Tolérance : ce que le client accepte. Capacité : ce que sa situation autorise. La plus prudente commande."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Deux informations distinctes, toutes deux obligatoires, et la plus prudente des deux commande la recommandation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Obligations avant conseil$academy_deck$, 2, $academy_deck${"recto":"Le client refuse de communiquer une information obligatoire. Que fait le conseiller ?","verso":"Il s'abstient de recommander sur ce point et le note au dossier (article L541-8-1)."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le code monétaire et financier prévoit l'abstention du conseiller en investissements financiers à défaut d'information.$academy_deck$);
end
$deck_reussir_la_decouverte$;
