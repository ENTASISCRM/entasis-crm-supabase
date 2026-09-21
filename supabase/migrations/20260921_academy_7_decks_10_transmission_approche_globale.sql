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

-- ── Deck : Transmission et approche globale (transmission-approche-globale) ──
do $deck_transmission_approche_globale$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$transmission-approche-globale$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$transmission-approche-globale$academy_deck$, $academy_deck$Transmission et approche globale$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Transmission et approche globale$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Identifier les objectifs familiaux et les relais professionnels$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$La transmission commence par une question, pas par un dispositif : que voulez-vous qu'il advienne de votre patrimoine, pour qui, et à quel moment ?

## Objectifs familiaux
- Quatre familles : conjoint, équité entre enfants (pas forcément égalité), bien précis, ressources pour vivre.
- L'objectif fiscal annoncé cache l'objectif familial : le faire dire.
- Quatre questions : qui protéger, quel bien, quel équilibre, quels besoins. Reformuler, écrire, puis situation civile.
- Aucun seuil cité de mémoire.

## Réserve héréditaire
- Un enfant : moitié. Deux : deux tiers. Trois et plus : trois quarts. Le reste : quotité disponible.
- Partenaire de PACS et concubin : aucun droit sans testament.

## Bilan préalable
- Six volets : civil, donations passées, assurance vie, biens et dettes, entreprise, volontés écrites.
- Abattement parent-enfant : 100 000 euros, reconstitué tous les 15 ans.
- Don familial de sommes d'argent : 31 865 euros, argent seulement.
- Assurance vie au décès : primes avant 70 ans, 152 500 euros par bénéficiaire ; après, 30 500 euros en tout. Conjoint et PACS exonérés.
- Pas de bilan, pas de chiffre : second rendez-vous avec les pièces.

## Relais professionnels
- Notaire obligatoire : donation immobilière, donation-partage, donation entre époux.
- Avocat fiscaliste : montages complexes, contrôle, contentieux.
- Expert-comptable : valorisation de l'entreprise. Pacte Dutreil : 75 % exonérés, durées à vérifier.
- Conseiller : note d'une page, réunion commune, calendrier. Ni acte, ni valorisation.
- Accord écrit avant tout envoi à un tiers. Aucune validation orale d'un schéma non lu.$academy_deck$, competence = coalesce(nullif($academy_deck$Identifier les objectifs familiaux et les relais professionnels$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 1, $academy_deck${"enonce":"Par quoi commence une démarche de transmission, selon la méthode du cabinet ?","choix":["Par le choix du dispositif le plus économe en droits","Par une question : que voulez-vous qu'il advienne de votre patrimoine, pour qui, et à quel moment ?","Par l'estimation du bien que la famille veut transmettre","Par un premier contact avec le notaire de famille"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La transmission commence par une question sur les objectifs de vie de la famille, pas par un dispositif.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$multi$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des quatre familles d'objectifs de transmission.","choix":["Protéger le conjoint","Réduire les droits de succession au minimum","Orienter un bien précis vers la bonne personne","Choisir la donation la plus rapide à mettre en place","Garder assez de ressources pour vivre jusqu'au bout sans dépendre de personne"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,2,4]}$academy_deck$::jsonb, $academy_deck$Les quatre familles : conjoint, équité entre enfants, bien précis, ressources pour vivre ; la fiscalité n'en fait pas partie.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 1, $academy_deck${"enonce":"Dans les objectifs familiaux, traiter les enfants avec équité veut nécessairement dire leur donner des parts égales."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$L'équité ne veut pas toujours dire égalité : un enfant peut préférer autre chose que le tiers d'une maison.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$ordre$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre les questions à poser en rendez-vous avant de nommer un outil.","elements":["« Qui souhaitez-vous protéger en priorité ? »","« Y a-t-il un bien que vous voulez voir aller à une personne précise ? »","« Comment voyez-vous l'équilibre entre vos enfants ? »","« De quoi avez-vous besoin pour vivre sereinement jusqu'à la fin ? »","Terminer par la situation civile complète : mariage ou PACS, régime matrimonial, enfants d'une première union"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Quatre questions dans cet ordre, chacune reformulée et écrite, puis la situation civile ; aucun outil avant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : M. et Mme Aubry, deux enfants, demandent « que nos enfants n'aient pas de droits à payer ». L'aîné gère déjà l'appartement loué, la cadette vit à l'étranger et ne reviendra pas. Quel est l'objectif familial réel ?","choix":["Réduire les droits de succession, comme ils l'ont dit","L'équité entre les deux enfants et la protection de l'époux survivant","Vendre l'appartement loué avant le décès","Confier tout le patrimoine à l'aîné, qui gère déjà"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'objectif fiscal n'était que la porte d'entrée : la vraie question est l'équité et la protection du survivant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$trou_choix$academy_deck$, $academy_deck$Objectifs familiaux$academy_deck$, 1, $academy_deck${"phrase":"L'erreur fréquente de début de rendez-vous : prendre l'objectif ___ annoncé pour l'objectif familial.","choix":["fiscal","immobilier","successoral","professionnel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Un couple qui dit « réduire les droits » veut souvent d'abord éviter un conflit ou protéger son conjoint.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$carte$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 1, $academy_deck${"recto":"Un client demande le montant de l'abattement en rendez-vous. Que dire ?","verso":"Aucun seuil de mémoire : les chiffres seront vérifiés sur la source officielle au moment de l'étude."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le conseiller ne cite aucun montant d'abattement de mémoire ; les seuils se vérifient au moment de l'étude.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 1, $academy_deck${"enonce":"Avec deux enfants, quelle part de la succession leur revient obligatoirement au titre de la réserve héréditaire ?","choix":["La moitié des biens","Les deux tiers des biens","Les trois quarts des biens","La totalité des biens"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La réserve est de la moitié pour un enfant, des deux tiers pour deux, des trois quarts pour trois et plus.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$association$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 1, $academy_deck${"enonce":"Associez le nombre d'enfants à la réserve héréditaire correspondante.","gauche":["Un enfant","Deux enfants","Trois enfants et plus"],"droite":["La moitié des biens","Les deux tiers des biens","Les trois quarts des biens"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Réserve des enfants : moitié, deux tiers, trois quarts selon leur nombre ; le reste est la quotité disponible.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 1, $academy_deck${"phrase":"La part de la succession que l'on peut attribuer librement, en dehors de la réserve héréditaire, s'appelle la ___ disponible.","aide":"un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["quotité","quotite","Quotité","la quotité"]}$academy_deck$::jsonb, $academy_deck$Réserve pour les enfants, quotité disponible pour le reste : ce cadre dit ce qui est possible et ce qui demande un acte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 3, $academy_deck${"phrase":"Cas fictif : une veuve laisse 600 000 euros et trois enfants. Par testament, elle peut attribuer librement à une amie au plus ___ euros.","aide":"quotité disponible"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["150 000","150000","150 000 euros","150000 euros","150.000"]}$academy_deck$::jsonb, $academy_deck$Trois enfants : réserve des trois quarts, soit 450 000 euros ; la quotité disponible est le quart, 150 000 euros.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 1, $academy_deck${"enonce":"Sans testament ni disposition prise à son profit, le partenaire de PACS n'a aucun droit dans la succession de son partenaire."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le partenaire de PACS et le concubin n'ont aucun droit dans la succession sans testament.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$choix$academy_deck$, $academy_deck$Réserve héréditaire$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : un couple marié, deux enfants communs, veut « tout laisser au conjoint survivant, les enfants verront après ». Quelle réponse est la plus juste ?","choix":["C'est possible sans limite, un testament suffit","En présence d'enfants, une part leur est réservée par la loi ; le souhait s'étudie dans ce cadre, avec le notaire","Il suffit de placer tout le patrimoine sur un contrat d'assurance vie au profit du conjoint","Le conjoint marié hérite automatiquement de la totalité, aucun acte n'est utile"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Deux enfants : les deux tiers des biens leur sont réservés ; le souhait s'inscrit dans ce cadre et demande un acte.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$multi$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des six volets du bilan de transmission.","choix":["Les donations déjà faites","Les contrats d'assurance vie, leurs clauses et l'âge de versement des primes","Le choix définitif de l'outil de transmission","Les volontés déjà écrites : testament, donation entre époux","Le montant des droits que le client accepte de payer"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Six volets : civil et régime matrimonial, donations passées, assurance vie, biens et dettes, entreprise, volontés écrites.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$ordre$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre la démarche du cabinet face à un projet de transmission.","elements":["Annoncer la méthode : analyse patrimoniale complète avant toute recommandation","Demander les pièces : livret de famille, contrat de mariage, actes de donations, clauses d'assurance vie, titres, statuts, avis d'imposition","Établir la photographie complète sur les six volets","Bâtir la feuille de route argumentée","Évoquer les formes juridiques avec le notaire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$L'étude, c'est l'analyse complète puis la feuille de route ; la forme juridique se choisit ensuite avec le notaire.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$choix$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : Mme Ferrand, 71 ans, veuve, veut donner un appartement à sa fille. Le bilan révèle une donation de 90 000 euros à son fils il y a neuf ans. Pourquoi compte-t-elle encore ?","choix":["L'abattement parent-enfant se reconstitue sur 15 ans, et elle pèse sur l'équité entre les enfants","Une donation de plus de cinq ans est remise en cause d'office","Elle ne compte plus, seul l'appartement est concerné","Le fils doit la rembourser avant toute nouvelle donation"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Une donation de moins de 15 ans pèse sur le calcul des droits ; toute donation antérieure pèse sur l'équité.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$trou_choix$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"phrase":"Si le client refuse le bilan, le conseiller ne propose rien de chiffré : il propose ___.","choix":["un second rendez-vous avec les pièces","une simulation indicative en ligne","un rendez-vous directement chez le notaire","une donation limitée à l'abattement"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Pas de bilan, pas de chiffre : on propose un second rendez-vous avec les pièces, pas une solution.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$carte$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"recto":"Cas fictif : la clause bénéficiaire désigne encore le mari décédé, sans second rang. Quel volet du bilan l'a révélé ?","verso":"L'assurance vie : clauses bénéficiaires et âge de versement des primes, à lire avant tout geste."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le bilan évite de proposer un geste qui contredit un geste antérieur ou qui déséquilibre la famille.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$association$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque pièce demandée au volet du bilan qu'elle renseigne.","gauche":["Contrat de mariage ou convention de PACS","Actes des donations antérieures","Relevés et clauses des contrats","Statuts de société"],"droite":["Situation civile et régime matrimonial","Donations déjà faites","Assurance vie","Entreprise"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Chaque pièce renseigne un volet ; chiffrer sans les avoir donne un chiffre faux qui engage la parole du cabinet.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Bilan préalable$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : M. et Mme Marchetti, mariés sans contrat en 1984, trois enfants, veulent donner la maison de vacances avant la fin de l'année et refusent le bilan. Cochez tout ce qui doit être clarifié avant toute recommandation.","choix":["Le régime matrimonial et le mode d'acquisition de la maison, qui disent qui peut donner quoi","Le « coup de pouce » de 60 000 euros au fils aîné : déclaré ou non, par qui, à quelle date","Le bon moment indiqué par le voisin","La clause bénéficiaire et l'âge de versement des primes du contrat d'assurance vie de M. Marchetti","Les droits à payer sur 450 000 euros, à chiffrer dès ce rendez-vous"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Régime, donation antérieure, contrat, divorce, benjamin, volontés écrites : tout se vérifie ; l'urgence du voisin n'est pas un objectif.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 1, $academy_deck${"phrase":"L'abattement sur les donations entre parent et enfant est de ___ euros, par parent et par enfant.","aide":"en chiffres"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["100 000","100000","100 000 euros","100000 euros","cent mille"]}$academy_deck$::jsonb, $academy_deck$Abattement de 100 000 euros par parent et par enfant, qui se reconstitue tous les 15 ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$choix$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 1, $academy_deck${"enonce":"Sur quelle durée l'abattement entre parent et enfant se reconstitue-t-il ?","choix":["6 ans","10 ans","15 ans","20 ans"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$L'abattement s'applique sur une période de 15 ans : une donation vieille de dix ans n'est pas effacée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 2, $academy_deck${"enonce":"Le don familial de sommes d'argent de 31 865 euros s'applique aussi à la donation d'un portefeuille de titres."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Les exonérations propres aux dons de sommes d'argent ne s'appliquent pas aux autres biens donnés.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$multi$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui passe obligatoirement par un notaire.","choix":["Une donation immobilière","Une donation-partage","La note de synthèse des objectifs et du bilan","Une donation entre époux, dite au dernier vivant","La reformulation des objectifs familiaux en rendez-vous"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Donation immobilière, donation-partage et donation entre époux exigent un acte notarié ; la note et la reformulation reviennent au conseiller.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$trou_choix$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 1, $academy_deck${"phrase":"Pour un contrat d'assurance vie, la fiscalité des capitaux au décès change selon que les primes ont été versées avant ou après ___ ans.","choix":["60","65","70","80"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Avant 70 ans : 152 500 euros par bénéficiaire ; après 70 ans : 30 500 euros en tout, puis droits de succession.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 3, $academy_deck${"enonce":"Associez chaque situation au traitement fiscal des capitaux d'assurance vie au décès.","gauche":["Primes versées avant 70 ans","Primes versées après 70 ans","Conjoint marié ou partenaire de PACS bénéficiaire"],"droite":["Abattement de 152 500 euros par bénéficiaire, puis 20 % jusqu'à 700 000 euros et 31,25 % au-delà","Abattement global de 30 500 euros, puis droits de succession","Exonération"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$L'âge de versement des primes et la clause bénéficiaire changent la fiscalité : à lire dans le bilan.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$choix$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : un client veut donner 80 000 euros en argent à sa fille pour un logement neuf et cite « l'exonération temporaire ». Que retenir ?","choix":["Elle ne concerne que les sommes d'argent, pour des dons faits jusqu'au 31 décembre 2026, à vérifier sur la source officielle","Elle s'applique à tout bien donné, y compris un appartement","Elle vaut pour tout don fait depuis le 1er janvier 2024, sans limite de date","Elle est acquise quel que soit l'emploi des fonds"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Dispositif temporaire, sommes d'argent seulement, employées sous six mois dans un logement neuf ou une rénovation énergétique.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Donations et abattements$academy_deck$, 1, $academy_deck${"enonce":"La donation-partage se fait par acte notarié, est en principe irrévocable et doit respecter la réserve des héritiers."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Acte notarié obligatoire, caractère en principe irrévocable, respect de la réserve : trois raisons de ne pas l'improviser.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque professionnel à son rôle dans une transmission.","gauche":["Notaire","Avocat fiscaliste","Expert-comptable","Conseiller Entasis"],"droite":["Rédige les actes authentiques : donations, testament authentique, règlement de la succession","Sécurise les montages complexes, intervient en cas de contrôle ou de contentieux","Connaît les comptes de l'entreprise et prépare sa valorisation","Tient la stratégie d'ensemble : note, réunion commune, suivi du calendrier"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Coordonner plutôt que distribuer : chacun fait son métier, personne ne refait celui de l'autre.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$choix$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : un dirigeant de SAS de 58 ans veut transmettre l'entreprise à celui de ses deux enfants qui y travaille. Comment répartir les rôles ?","choix":["Le conseiller estime lui-même la valeur de la société à partir du chiffre d'affaires et propose le schéma","L'expert-comptable valorise, le notaire et, si besoin, l'avocat fiscaliste sécurisent la donation et le pacte Dutreil, le conseiller coordonne","La banque de l'entreprise pilote la transmission, le cabinet se retire","L'assureur du dirigeant propose un contrat qui remplace la transmission des titres"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le conseiller ne valorise pas une entreprise à la place de l'expert-comptable : il prépare la note et coordonne.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$multi$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que contient la note d'une page que le conseiller prépare pour les professionnels.","choix":["Les objectifs recueillis","L'inventaire des actifs","Le projet d'acte de donation rédigé par le conseiller","Le calendrier souhaité et les questions ouvertes","La valorisation de l'entreprise établie par le conseiller"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,3]}$academy_deck$::jsonb, $academy_deck$Objectifs, inventaire, calendrier, questions ouvertes ; ni acte ni valorisation, qui reviennent au notaire et à l'expert-comptable.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 2, $academy_deck${"phrase":"Le pacte Dutreil exonère de droits ___ % de la valeur des titres transmis, sous conditions d'engagements de conservation.","aide":"en chiffres"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["75","75 %","75%","soixante-quinze","soixante quinze"]}$academy_deck$::jsonb, $academy_deck$Exonération de 75 % sous engagements collectif puis individuel de conservation et fonction de direction ; durées à vérifier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 3, $academy_deck${"enonce":"Les durées d'engagement de conservation du pacte Dutreil peuvent être citées de mémoire en rendez-vous, car elles n'ont pas changé."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Les durées ont été modifiées par la loi de finances 2026 et se vérifient sur la source officielle au moment du rendez-vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$choix$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif : mariés sans contrat, trois enfants, projet de donation d'une maison de vacances, aucune entreprise. Quel professionnel n'a aucun rôle dans ce dossier ?","choix":["Le notaire, relais principal","L'avocat fiscaliste, à solliciter si un montage particulier apparaît","L'expert-comptable","Le conseiller, qui prépare la note de synthèse"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Sans entreprise, l'expert-comptable n'a aucun rôle ; l'avocat fiscaliste ne devient utile qu'en cas de montage ou de difficulté.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$carte$academy_deck$, $academy_deck$Relais professionnels$academy_deck$, 2, $academy_deck${"recto":"Un client dit : « mon notaire s'en occupe ». Que proposer ?","verso":"Lui adresser une note de synthèse des objectifs et de la situation, puis un point à trois."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Renvoyer sans préparer fait perdre au cabinet son rôle de coordinateur et au client la valeur de l'écoute.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_choix$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 2, $academy_deck${"phrase":"Avant de transmettre quoi que ce soit à un tiers, le conseiller obtient ___ du client.","choix":["l'accord écrit","un accord oral donné en rendez-vous","la copie de la pièce d'identité","l'autorisation du notaire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Aucune transmission à un tiers sans l'accord écrit du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$choix$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : au téléphone, un client dit que son notaire propose « une donation-partage avec une société civile » et demande : « Vous êtes d'accord ? » Vous n'avez ni projet d'acte ni hypothèses. Que répondre ?","choix":["« Oui, c'est un schéma classique, allez-y »","« Non, méfiez-vous, les sociétés civiles sont compliquées »","« Je demande au notaire le projet d'acte et ses hypothèses, je vérifie la cohérence avec vos objectifs et je vous propose un point à trois »","« Ce n'est pas mon rôle, voyez directement avec lui »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Ni validation ni contradiction à l'oral d'un schéma que l'on n'a pas lu : demander les documents, confronter aux objectifs.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$ordre$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre le travail du conseiller coordinateur sur un dossier de transmission.","elements":["Recueillir et reformuler les objectifs de la famille","Établir le bilan sur les six volets","Rédiger la note d'une page pour les professionnels, avec l'accord écrit du client","Organiser la réunion commune et tenir le compte rendu","Suivre le calendrier"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Préparer, transmettre, suivre : objectifs, bilan, note, réunion commune, calendrier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$ordre$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif : les époux Marchetti attendent une réponse immédiate sur la donation de leur maison. Remettez dans l'ordre la formulation de la prochaine étape.","elements":["Reformuler l'objectif : transmettre la maison en gardant son usage, sans déséquilibre entre les trois enfants","Expliquer la méthode : l'écoute, l'étude, l'accompagnement","Demander les pièces avec leur raison : titres de propriété, justificatif du don au fils, relevé et clause du contrat","Poser la date du second rendez-vous, dans quinze jours","Annoncer le relais notaire préparé par le cabinet, sans promettre de chiffre ni d'économie fiscale"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Objectif reformulé, méthode expliquée, pièces demandées avec leur raison, date posée, relais annoncé, aucune économie promise.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Posture du conseiller$academy_deck$, 2, $academy_deck${"enonce":"Selon l'AMF, le conseil en gestion de patrimoine est une activité générique non réglementée ; seul le conseil en investissement, qui porte sur des instruments financiers, est un service réglementé."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Ce que le conseiller peut faire dépend des statuts réglementés qu'il détient réellement ; il ne rédige pas d'acte.$academy_deck$);
end
$deck_transmission_approche_globale$;
