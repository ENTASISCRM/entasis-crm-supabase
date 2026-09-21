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

-- ── Deck : SCPI et immobilier patrimonial (scpi-et-immobilier) ──
do $deck_scpi_et_immobilier$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$scpi-et-immobilier$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$scpi-et-immobilier$academy_deck$, $academy_deck$SCPI et immobilier patrimonial$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$SCPI et immobilier patrimonial$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Expliquer revenus, frais, liquidité et risques immobiliers$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$Le revenu d'une SCPI est un loyer partagé, après charges et après frais, jamais un taux promis.

## Le revenu

- Une SCPI collecte l'épargne d'associés pour acheter des immeubles loués.
- La société de gestion, agréée par l'AMF, encaisse les loyers, paie les travaux, se rémunère et reverse le solde chaque trimestre.
- Taux de distribution : observation passée, brute d'impôt, sur un prix de part qui peut baisser.

## Les trois frais, selon l'AMF

- Souscription : 5 % à 12 % du montant, intégrée au prix de la part.
- Gestion : 8 % à 10 % des revenus, prélevée sur les loyers.
- Cession : à la revente, forfaitaire ou proportionnelle. Taux exacts : dans le DIC.

## La sortie

- Capital fixe : marché secondaire, prix par confrontation, périodicité d'un jour à trois mois.
- Capital variable : prix de retrait fixé par la société de gestion, exécution soumise aux souscriptions.
- Délai : plusieurs semaines, voire plusieurs mois ; médiateur de l'AMF : au moins six mois.
- Épargne de précaution d'abord ; en SCPI, seulement l'argent sans besoin avant des années.

## Les quatre risques

Capital, revenu (premier indicateur : taux d'occupation), liquidité, crédit.

## La fiscalité

- Loyers : revenus fonciers au barème, plus 17,2 % de prélèvements sociaux.
- Parts seules : micro-foncier exclu, régime réel.
- Plus-value de cession : impôt à 19 % ; exonération d'impôt après 22 ans, de prélèvements sociaux après 30 ans.
- Toujours rouvrir la source officielle avant le rendez-vous.$academy_deck$, competence = coalesce(nullif($academy_deck$Expliquer revenus, frais, liquidité et risques immobiliers$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"D'où vient le revenu versé à l'associé d'une SCPI ?","choix":["D'un intérêt fixé chaque année par la société de gestion","Des loyers des immeubles détenus, après charges et après frais","D'une plus-value acquise à la revente des parts","Des dividendes de sociétés foncières cotées en bourse"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'associé détient une fraction d'un parc loué ; la société de gestion reverse le solde des loyers après charges et frais, en général chaque trimestre.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"Quelle fourchette l'AMF indique-t-elle pour la commission de souscription d'une SCPI ?","choix":["2 % à 4 % du montant souscrit","5 % à 12 % du montant souscrit","8 % à 10 % du montant souscrit","15 % à 20 % du montant souscrit"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'AMF indique 5 % à 12 % pour la souscription ; 8 % à 10 % est la fourchette de la commission de gestion.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Une cliente souscrit 40 000 € de parts d'une SCPI dont le DIC indique une commission de souscription de 9 %. Quelle est, le lendemain et avant toute variation de marché, la valeur de retrait de ses parts ?","choix":["40 000 €, la commission étant prélevée sur les loyers futurs","Environ 36 400 €, la commission étant intégrée au prix de la part","Environ 43 600 €, grâce au délai de jouissance","Impossible à estimer avant la publication du rapport annuel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La commission de souscription, ici 3 600 €, est intégrée au prix de la part : la valeur de retrait en est diminuée d'autant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 1, $academy_deck${"enonce":"Dans une SCPI à capital variable, qui fixe le prix de retrait d'une part ?","choix":["La société de gestion","Le marché secondaire, par confrontation de l'offre et de la demande","L'AMF, lors du visa de la note d'information","L'associé vendeur, par un prix minimum inscrit sur un carnet"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$En capital variable, le prix de retrait est fixé par la société de gestion ; le carnet d'ordres et la confrontation concernent le capital fixe.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client détient des parts d'une SCPI à capital variable et veut récupérer 30 000 € dans deux mois. Quelle affirmation est exacte ?","choix":["La société de gestion doit racheter les parts dans un délai réglementaire d'un mois","Le retrait dépend des souscriptions reçues en face : il n'a pas de date garantie et peut attendre des mois","Une demande de retrait complète est exécutée sous trois semaines","Le retrait est immédiat si les parts ont été financées à crédit"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$L'exécution d'un retrait dépend des demandes de souscription reçues ; le médiateur de l'AMF a vu une demande attendre au moins six mois.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Un client ne détient aucun immeuble loué en direct, seulement des parts de SCPI qui lui procurent 6 000 € de revenus fonciers par an. Quel régime déclaratif lui indiquez-vous ?","choix":["Le micro-foncier avec abattement de 30 %, puisqu'il reste sous 15 000 €","Le régime réel : le détenteur de parts seules est expressément exclu du micro-foncier","Le prélèvement forfaitaire unique, comme pour un dividende","Aucune déclaration, les revenus étant imposés au niveau de la SCPI"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Sans immeuble loué nu en direct, le détenteur de parts est exclu du micro-foncier et déclare sa quote-part au régime réel.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 1, $academy_deck${"enonce":"Quel taux global de prélèvements sociaux s'applique aux revenus fonciers distribués par une SCPI ?","choix":["17,2 %","12,8 %","19 %","30 %"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le taux global est de 17,2 % (CSG 9,2 %, CRDS 0,5 %, prélèvement de solidarité 7,5 %), appliqué au revenu net.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Risques immobiliers$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un dirigeant souhaite financer 150 000 € de parts de SCPI par un emprunt sur quinze ans, « puisque les loyers rembourseront les mensualités ». Quel risque nommez-vous en priorité ?","choix":["Aucun risque particulier : les loyers couvrent les mensualités par construction","Les mensualités sont certaines, les loyers et la valeur de revente ne le sont pas ; en cas de baisse, il complète de sa poche sans pouvoir sortir vite","Le seul risque est fiscal, les intérêts n'étant pas déductibles","Le risque de liquidité disparaît puisque la banque prend les parts en garantie"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Le crédit ne supprime aucun des trois autres risques, il les cumule : mensualités certaines, loyers incertains, sortie soumise au délai de retrait.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client demande : « Pourquoi payer 10 % à l'entrée alors qu'un livret ne coûte rien ? » Quelle réponse correspond à la posture attendue ?","choix":["Minimiser : « 10 %, c'est la norme du marché, on ne le voit plus au bout d'un an. »","Expliquer que la commission revient à la société de gestion, qu'elle rend le placement long, montrer la ligne dans le DIC et vérifier que son horizon justifie ce placement","Lui promettre une SCPI sans frais d'entrée sans avoir ouvert son DIC","Répondre que la commission est déductible de son impôt sur le revenu"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$On nomme les frais, on les montre dans le DIC et on relie le placement à l'horizon du client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Monsieur Vasseur, 58 ans, veut placer 120 000 € en SCPI « en attendant » le rachat d'une officine prévu dans dix-huit mois. Quelle part de cette somme peut être envisagée en SCPI dès le premier rendez-vous ?","choix":["La totalité, une SCPI à capital variable permettant le retrait","La moitié, pour diversifier en attendant le projet","Aucune à ce stade : la somme est fléchée vers un projet à dix-huit mois, seul un excédent réellement long révélé par le bilan pourrait être étudié","40 000 €, soit le montant qu'il veut pouvoir retirer en quelques jours"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Le critère est l'horizon : la commission de souscription rend absurde une détention de dix-huit mois, et le montant attend le bilan.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Risques immobiliers$academy_deck$, 1, $academy_deck${"enonce":"Le capital investi en parts de SCPI n'est pas garanti."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'AMF qualifie la SCPI de placement risqué : la valeur de la part suit le marché immobilier, à la hausse comme à la baisse.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"La formule « rendement sans la gestion » signifie que l'associé d'une SCPI ne supporte aucun frais de gestion."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Elle signifie que l'associé ne gère pas lui-même les immeubles ; la commission de gestion reste prélevée sur les loyers.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 1, $academy_deck${"enonce":"Une demande de retrait de parts de SCPI complète et enregistrée par la société de gestion garantit son exécution en quelques semaines."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Une demande en bonne et due forme est nécessaire, pas suffisante : sans souscriptions en face, elle peut attendre au moins six mois.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"enonce":"Dans une SCPI à capital fixe, le prix obtenu à la revente d'une part peut s'écarter de la valeur du patrimoine de la SCPI."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le prix se forme par confrontation de l'offre et de la demande sur le marché secondaire, pas sur la valeur des immeubles.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"enonce":"Financer des parts de SCPI à crédit permet d'en sortir plus vite en cas de besoin de trésorerie."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Le crédit ne change rien au délai de sortie : les mensualités courent, la sortie attend.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 3, $academy_deck${"enonce":"La fraction financière du revenu d'une SCPI, issue de la trésorerie placée, relève du régime des revenus de capitaux mobiliers."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le bulletin de la SCPI distingue cette ligne, soumise au prélèvement forfaitaire unique, des loyers imposés en revenus fonciers.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Risques immobiliers$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui peut faire diminuer les loyers perçus par une SCPI.","choix":["Le départ de locataires","Une relocation à un niveau de loyer inférieur","Une hausse des prélèvements sociaux","Une baisse du prix de la part","La cession de parts par d'autres associés"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1]}$academy_deck$::jsonb, $academy_deck$Le risque de revenu tient aux locataires : départs et relocations moins chères ; la baisse du prix de part relève du risque de capital.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des trois familles de frais d'une SCPI.","choix":["La commission de souscription","La commission de gestion","La commission de cession","Les droits de garde","Les frais d'arbitrage"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Souscription (intégrée au prix), gestion (sur les loyers) et cession (à la revente) : le taux exact de chacune figure dans le DIC.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui doit être vérifié avec le client avant toute présentation d'une SCPI.","choix":["L'existence d'une épargne disponible pour un imprévu","Les sommes dont il pourrait avoir besoin dans les trois prochaines années","Le taux de distribution de l'an dernier de la SCPI visée","Le nombre de SCPI qu'il détient déjà","Un accord de financement bancaire"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1]}$academy_deck$::jsonb, $academy_deck$L'AMF place l'épargne de précaution en tête de la bonne attitude avant d'investir ; le besoin à trois ans fixe l'horizon.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui est exact sur les loyers distribués par une SCPI à un client qui ne détient que des parts.","choix":["Ils sont imposés au barème de l'impôt sur le revenu","Ils supportent 17,2 % de prélèvements sociaux","Ils bénéficient de l'abattement de 30 % du micro-foncier","Ils relèvent du prélèvement forfaitaire unique de 12,8 %","Ils se déclarent au régime réel"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,4]}$academy_deck$::jsonb, $academy_deck$Revenus fonciers au barème plus 17,2 % de prélèvements sociaux ; le détenteur de parts seules est exclu du micro-foncier et déclare au réel.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qui caractérise une SCPI à capital fixe.","choix":["Le nombre de parts est en principe figé","Le vendeur inscrit un ordre sur un carnet avec un prix minimum","Le prix de retrait est fixé par la société de gestion","L'exécution dépend des demandes de souscription reçues","Le prix se forme selon une périodicité d'un jour à trois mois"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,4]}$academy_deck$::jsonb, $academy_deck$En capital fixe : carnet d'ordres et confrontation périodique ; prix de retrait et attente des souscriptions relèvent du capital variable.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre le circuit du loyer, de l'immeuble jusqu'à l'associé.","elements":["La société de gestion trouve les locataires","Elle encaisse les loyers","Elle paie les travaux","Elle se rémunère","Elle reverse le solde aux associés, en général chaque trimestre"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Le client achète une part de loyers futurs, après charges et après frais : il touche le solde, pas le loyer brut.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre le déroulé attendu quand la liquidité d'une SCPI est abordée en rendez-vous.","elements":["Poser les deux questions : besoins de trésorerie à trois ans, épargne disponible pour un imprévu","Prononcer la phrase sur la sortie sans date choisie, qui peut prendre des mois","Faire lire au client la page du DIC sur la durée de détention recommandée","Ne proposer la SCPI que pour l'excédent dont le client n'aura pas besoin avant des années"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$Les deux questions viennent avant toute présentation ; la phrase et la lecture du DIC suivent, et seul l'excédent réellement long va en SCPI.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Plus-value de cession$academy_deck$, 2, $academy_deck${"enonce":"Remettez dans l'ordre chronologique la vie fiscale d'un placement en parts de SCPI, selon la durée de détention.","elements":["Souscription : commission de souscription intégrée au prix de la part","Pendant la détention : loyers imposés chaque année comme revenus fonciers","Cession avant 22 ans : impôt sur la plus-value à 19 %, réduit par les abattements pour durée de détention","Cession au-delà de 22 ans : exonération d'impôt sur la plus-value, prélèvements sociaux encore dus","Cession au-delà de 30 ans : exonération d'impôt et de prélèvements sociaux sur la plus-value"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$Frais à l'entrée, revenus fonciers pendant la détention, puis plus-value à 19 % dont les abattements mènent à l'exonération à 22 ans, puis 30 ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Un client pressé demande un bulletin de souscription de SCPI au premier rendez-vous, avec un projet d'officine à dix-huit mois. Remettez dans l'ordre les étapes attendues.","elements":["Recueillir le projet d'officine : date, montant, financement","Réaliser un bilan patrimonial complet","Remettre une feuille de route argumentée avec simulation chiffrée","Étudier une éventuelle SCPI pour le seul excédent réellement long"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$On commence par le projet parce qu'il fixe l'horizon ; tant qu'il n'est pas connu, aucun bulletin de souscription ne peut être proposé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque commission d'une SCPI à son assiette et à sa fourchette selon l'AMF.","gauche":["Commission de souscription","Commission de gestion","Commission de cession"],"droite":["Intégrée au prix de la part, 5 % à 12 % du montant souscrit","Prélevée sur les loyers encaissés, 8 % à 10 % des revenus","Due à la revente, forfaitaire ou proportionnelle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Trois assiettes différentes : le montant souscrit, les revenus, puis la revente ; le chiffre exact de chaque SCPI est dans le DIC.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque support à son mécanisme de sortie.","gauche":["SCPI à capital fixe","SCPI à capital variable","Livret réglementé"],"droite":["Prix formé par confrontation de l'offre et de la demande sur un marché secondaire","Prix de retrait fixé par la société de gestion, exécution soumise aux souscriptions","Retrait en un clic, au montant exact, sans frais"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Une part de SCPI se cède ou se retire, elle ne se rembourse pas au guichet ; seul le livret se vide au montant exact.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Risques immobiliers$academy_deck$, 2, $academy_deck${"enonce":"Associez chacun des quatre risques d'une SCPI à sa description.","gauche":["Risque de capital","Risque de revenu","Risque de liquidité","Risque de crédit"],"droite":["La valeur de la part suit le marché immobilier ; la revente peut se faire sous le prix d'acquisition","Les loyers baissent si des locataires partent ou relouent à un niveau inférieur","La sortie dépend d'acheteurs ou de souscripteurs et peut attendre des mois","Les mensualités sont certaines alors que les loyers ne le sont pas"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Quatre risques à nommer à voix haute, dans cet ordre, sans les minimiser : aucun n'est théorique.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque flux lié à une SCPI à son traitement fiscal.","gauche":["Loyers distribués","Trésorerie placée par la SCPI","Plus-value de cession des parts","Prélèvements sociaux sur les revenus fonciers"],"droite":["Revenus fonciers imposés au barème de l'impôt sur le revenu","Revenus de capitaux mobiliers, prélèvement forfaitaire unique","Impôt sur le revenu au taux de 19 %","Taux global de 17,2 % sur le revenu net"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Le bulletin de la SCPI distingue loyers et revenus financiers ; la plus-value de cession de parts suit le régime des plus-values immobilières.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"phrase":"Le taux exact de chaque frais d'une SCPI figure dans la note d'information visée par l'AMF et dans le ___.","choix":["document d'informations clés (DIC)","bulletin trimestriel","dernier rapport annuel","bulletin de souscription"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$On ne cite jamais un chiffre de frais de mémoire : on ouvre le DIC et on montre la ligne au client.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"phrase":"La société de gestion reverse le solde des loyers aux associés, en général chaque ___.","choix":["trimestre","mois","semestre","année"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le revenu d'une SCPI est versé en général chaque trimestre et imposé comme un revenu foncier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 2, $academy_deck${"phrase":"Le seuil de 15 000 € et l'abattement de 30 % relèvent du régime ___, dont le détenteur de parts seules est expressément exclu.","choix":["micro-foncier","réel","des revenus de capitaux mobiliers","des plus-values immobilières"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le micro-foncier suppose un immeuble loué nu en direct ; avec des parts seules, le client déclare sa quote-part au régime réel.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Risques immobiliers$academy_deck$, 2, $academy_deck${"phrase":"Pour apprécier le risque de revenu d'une SCPI, le premier indicateur à regarder est le ___.","choix":["taux d'occupation","taux de distribution","prix de souscription","délai de retrait"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Les loyers baissent quand des locataires partent : le taux d'occupation, lu dans le bulletin trimestriel, le montre en premier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Fiscalité des revenus$academy_deck$, 1, $academy_deck${"phrase":"Les revenus fonciers distribués par une SCPI supportent des prélèvements sociaux au taux global de ___ %.","aide":"Un nombre avec une décimale"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["17,2","17.2","17,20","17.20"]}$academy_deck$::jsonb, $academy_deck$Taux global de 17,2 % : CSG 9,2 %, CRDS 0,5 %, prélèvement de solidarité 7,5 %, appliqué au revenu net.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Plus-value de cession$academy_deck$, 1, $academy_deck${"phrase":"La plus-value de cession de parts de SCPI est soumise à l'impôt sur le revenu au taux de ___ %.","aide":"Un nombre entier"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["19","dix-neuf","dix neuf"]}$academy_deck$::jsonb, $academy_deck$Les parts de SCPI relèvent du régime des plus-values immobilières des particuliers : impôt sur le revenu à 19 %, plus prélèvements sociaux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Plus-value de cession$academy_deck$, 2, $academy_deck${"phrase":"Sur la plus-value de cession de parts de SCPI, l'exonération d'impôt sur le revenu est acquise au-delà de ___ ans de détention.","aide":"Un nombre d'années"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["22","vingt-deux","vingt deux"]}$academy_deck$::jsonb, $academy_deck$Exonération d'impôt sur le revenu au-delà de 22 ans de détention, et de prélèvements sociaux au-delà de 30 ans.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Liquidité et sortie$academy_deck$, 2, $academy_deck${"phrase":"Le médiateur de l'AMF a publié en 2024 le cas d'une demande de retrait complète et enregistrée, non exécutée pendant au moins ___ mois.","aide":"Un nombre de mois"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["6","six"]}$academy_deck$::jsonb, $academy_deck$Une demande en bonne et due forme est nécessaire, pas suffisante : sans souscriptions en face, elle a attendu au moins six mois.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Revenu et frais d'une SCPI$academy_deck$, 1, $academy_deck${"recto":"Que signifie la formule « rendement sans la gestion » ?","verso":"Le client ne gère pas lui-même les immeubles ; il paie quand même la commission de gestion."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$La commission de gestion, 8 % à 10 % des revenus selon l'AMF, est prélevée sur les loyers avant reversement.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 2, $academy_deck${"recto":"Le client demande un chiffre fiscal que vous ne pouvez pas sourcer sur place. Que répondez-vous ?","verso":"« Seuil à vérifier sur la source officielle, je vous l'envoie avec le compte rendu. »"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$On montre la page impots.gouv.fr à l'écran plutôt que de réciter ; les règles évoluent, on rouvre la source avant chaque rendez-vous.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Posture en rendez-vous$academy_deck$, 3, $academy_deck${"recto":"Phrase à prononcer avant toute souscription de SCPI, sur la disponibilité de l'argent","verso":"Pas de date choisie pour récupérer l'argent : la sortie dépend d'acheteurs ou de souscripteurs et peut prendre des mois."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$L'AMF indique un délai de plusieurs semaines, voire de plusieurs mois ; le risque de liquidité se dit avant la souscription, pas après.$academy_deck$);
end
$deck_scpi_et_immobilier$;
