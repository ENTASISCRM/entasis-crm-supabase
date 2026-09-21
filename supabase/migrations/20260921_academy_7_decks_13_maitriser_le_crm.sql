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

-- ── Deck : Maîtriser le CRM Entasis (maitriser-le-crm) ──
do $deck_maitriser_le_crm$
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = $academy_deck$maitriser-le-crm$academy_deck$;
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values ($academy_deck$maitriser-le-crm$academy_deck$, $academy_deck$Maîtriser le CRM Entasis$academy_deck$, $academy_deck$methode$academy_deck$, $academy_deck$fondamentaux$academy_deck$, 0)
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', $academy_deck$Maîtriser le CRM Entasis$academy_deck$, $academy_deck$$academy_deck$, $academy_deck$Tenir une fiche, tracer un échange, programmer le suivi et utiliser les étapes réellement présentes dans le CRM$academy_deck$, 10, '[]'::jsonb, 0.80, $academy_deck$[]$academy_deck$::jsonb, '')
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
  update public.academy_module_versions set memo_md = $academy_deck$Une fiche complète, un échange consigné, une suite datée : voilà ce que le CRM attend après chaque contact.

## Créer un dossier
- Trois chemins : bouton « Nouveau dossier », touche N’hors saisie, palette ⌘K.
- Client connu : « Rechercher un client existant », sinon doublon.
- Express : nom, email, téléphone, mois, un produit, date prévue.
- Quatre statuts : En cours, RDV calé (valeur « Prévu »), Signé, Annulé.
- Date prévue obligatoire pour En cours et RDV calé ; date effective pour Signé.

## Compléter la fiche
- Six champs pour signer : email, téléphone, statut, profession, revenus annuels, patrimoine estimé (« Signature n/6 »).
- Jauge de complétude : huit champs pondérés, quatre niveaux, de « Complète » à « À démarrer ».
- Un montant à 0 passe le verrou mais fausse la fiche.

## Suivre et relancer
- Une relance vit dans « Prochaine action » et « Pour le » ; l'Agenda ne crée qu'un événement Google.
- Gabarits : devis standard J+2, J+7, J+15 ; suite de rendez vous J+1, J+5, J+12 ; pièces manquantes J+3, J+10, J+20. Aucun email envoyé.
- « Ma journée » : RDV du jour, relances en retard, relances du jour. Trois gestes : Fait, → demain, → +7 j, annulables sept secondes.
- Fait arme l'étape suivante depuis aujourd'hui.
- « Dossiers sans mouvement » : En cours, sans « Pour le », plus de 21 jours sans modification. Gestes : Déjà signé, Toujours en cours, Relancer, Abandonner.

## Tracer et signer
- Fiche client, onglet Historique, « + Consigner un échange ».
- Trois verrous : fiche complète, produit choisi, « Date de signature effective ».
- Lendemain d'un RDV calé : « RDV tenu » ou « No-show ».
- La direction lit « Complétude des fiches » dans Équipe, sans montant.
$academy_deck$, competence = coalesce(nullif($academy_deck$Tenir une fiche, tracer un échange, programmer le suivi et utiliser les étapes réellement présentes dans le CRM$academy_deck$, ''), competence), updated_at = now() where id = v_ver;
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 1, $academy_deck$choix$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 1, $academy_deck${"enonce":"Vous êtes sur l'écran Pipeline, aucun champ n'a le focus, aucune modale n'est ouverte. Quelle touche ouvre « Nouveau dossier » ?","choix":["N","Entrée","/","?"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$La touche N’ouvre « Nouveau dossier » hors saisie et hors onglet Leads ; « ? » affiche l'aide des raccourcis.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 2, $academy_deck$choix$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Vous enregistrez le dossier de Monsieur Piel en statut En cours ; le CRM refuse. Produit et compagnie sont renseignés, la fiche est à « Signature 6/6 ». Quel champ manque le plus probablement ?","choix":["« Date de signature effective »","« Date de signature prévue »","« Co-conseiller »","« Source »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$La « Date de signature prévue » est obligatoire pour En cours et RDV calé ; la date effective ne l'est que pour Signé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 3, $academy_deck$choix$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 1, $academy_deck${"enonce":"Cas fictif. Monsieur Garnier, déjà client du cabinet, vous appelle pour une nouvelle assurance vie. Vous ouvrez « Nouveau dossier ». Quel est le bon premier geste dans la modale ?","choix":["Taper son nom dans « Nom du client * » et créer le dossier","Utiliser le champ « Client » pour « Rechercher un client existant » et rattacher sa fiche","Aller dans l'Annuaire et cliquer « + Nouveau client »","Cliquer « Tout renseigner (relances, notes…) » puis saisir son email"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Un client existant se rattache par la recherche du champ « Client » ; retaper le nom crée un doublon.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 4, $academy_deck$choix$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. En mode express, vous avez saisi nom, email, téléphone et mois de Madame Abitbol. Elle vous donne sa profession, ses revenus et son patrimoine ; vous voulez les saisir sans quitter la modale. Que faites-vous ?","choix":["Cliquer « Créer le dossier », puis rouvrir la fiche client depuis l'Annuaire","Cliquer « Tout renseigner (relances, notes…) », puis remplir « Données client pour la signature »","Écrire ces informations dans le champ « Notes »","Aller dans l'Annuaire, « + Nouveau client », et ressaisir la personne"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$« Tout renseigner (relances, notes…) » déplie la section « Données client pour la signature » ; le champ Notes n'alimente pas la chronologie de la fiche.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 5, $academy_deck$choix$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Le dossier de Monsieur Lançon suit « Relance devis standard ». L'étape 1 était due lundi ; vous ne cliquez « Fait » que jeudi. Pour quel jour l'étape 2 (J+7) est-elle armée ?","choix":["Lundi prochain, sept jours après l'échéance dépassée","Jeudi prochain, sept jours après aujourd'hui","Aujourd'hui, pour rattraper le retard","Nulle part : la séquence s'arrête quand une étape est en retard"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$« Fait » arme l'étape suivante datée depuis aujourd'hui, le jour du clic ; le retard ne stoppe pas la séquence.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 6, $academy_deck$choix$academy_deck$, $academy_deck$Trier sans mouvement$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Le dossier de Madame Ferrand est En cours, sans relance datée, non modifié depuis 25 jours : il est dans « Dossiers sans mouvement ». Elle vous confirme que le dossier avance, mais aucune date n'est possible. Quel geste sur la ligne ?","choix":["« → +7 j »","« Toujours en cours »","« Abandonner »","« Déjà signé »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$« Toujours en cours » fait taire le dossier 21 jours de plus ; « → +7 j » appartient à « Ma journée ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 7, $academy_deck$choix$academy_deck$, $academy_deck$Tracer un échange$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Monsieur Delorme vous appelle pour signaler qu'il vend son appartement dans trois mois. Aucun statut ne change, rien n'est à dater pour l'instant. Où tracez-vous cette information ?","choix":["Dans le champ « Notes » du dossier, en écrasant le texte existant","Dans l'Agenda, avec « Nouvelle relance »","Sur la fiche client, onglet « Historique », « + Consigner un échange », Type « Appel », Sens « Entrant »","Dans « Prochaine action », sans date"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Un échange se consigne dans l'onglet « Historique » de la fiche client ; une prochaine action sans date n'apparaît nulle part.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 8, $academy_deck$choix$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Vous enregistrez le dossier de Madame Roussel en Signé, produit et « Date de signature effective » renseignés. Le toast affiche « Pour signer, complétez la fiche client : revenus annuels. » Que faites-vous ?","choix":["Repasser le dossier En cours et le signer plus tard, sans rien changer","Saisir 0 dans « Revenus annuels (€) » pour passer le verrou","Renseigner « Revenus annuels (€) » dans « Données client pour la signature », puis « Enregistrer » à nouveau","Demander à la direction de forcer la signature depuis « Vue cabinet »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$On saisit le champ manquant puis on réenregistre ; un 0 passe le verrou mais fausse la fiche.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 9, $academy_deck$choix$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 3, $academy_deck${"enonce":"La direction veut voir, conseiller par conseiller, le nombre de fiches, le score moyen de complétude et les champs les plus souvent manquants. Dans quel écran trouve-t-elle ce tableau ?","choix":["Onglet « Équipe », tableau « Complétude des fiches »","Écran Pipeline, filtre « Tous les conseillers »","Accueil « Vue cabinet »","Écran « Multi-équipement », chip « À proposer »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":0}$academy_deck$::jsonb, $academy_deck$Le tableau « Complétude des fiches » (Conseiller, Fiches, Score moyen, Complètes, champs manquants) est dans l'onglet « Équipe », sans montant.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 10, $academy_deck$choix$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Le dossier de Madame Vial est En cours, sa relance « Pour le » date d'il y a dix jours et personne n'a touché le dossier depuis 30 jours. Où le CRM le fait-il remonter ce matin ?","choix":["Dans « Dossiers sans mouvement », avec « 30 jours sans mouvement »","Dans « Ma journée », parmi les relances en retard","Dans « Signés, fiche à finir »","Nulle part : il faut le chercher dans le pipeline"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$Une relance en retard est dans « Ma journée » ; « Dossiers sans mouvement » ne retient que les dossiers sans relance datée.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 11, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 1, $academy_deck${"enonce":"Sur le brouillon créé par la Lead Room (produit Autre, montants à 0), le statut s'affiche « RDV calé » et le champ de date s'appelle « Date du rendez-vous »."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$« RDV calé » est le libellé écran de « Prévu » ; sur ce seul brouillon, la date s'intitule « Date du rendez-vous ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 12, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 1, $academy_deck${"enonce":"Dans le pipeline, glisser une carte vers la colonne « Signé ✓ » suffit à enregistrer la signature du dossier."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$Le glisser ouvre la modale en Signé ; l'enregistrement passe seulement avec fiche complète, produit choisi et « Date de signature effective ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 13, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 1, $academy_deck${"enonce":"Sélectionner un « Co-conseiller » dans « Équipe & suivi » n'a aucune conséquence affichée dans la modale."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$La modale affiche « Commission divisée par 2 entre les 2 conseillers », et les deux conseillers voient ensuite le dossier et la fiche.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 14, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 2, $academy_deck${"enonce":"Une séquence de relance démarrée dans le CRM n'envoie aucun email : c'est le conseiller qui appelle ou écrit à chaque étape."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$L'aide du bloc « Séquence de relance » le dit : aucun email n'est envoyé, la séquence ne fait que dater les étapes.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 15, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 2, $academy_deck${"enonce":"Le bouton « Nouvelle relance » de l'Agenda crée une relance qui apparaîtra dans « Ma journée » à la date choisie."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":false}$academy_deck$::jsonb, $academy_deck$« Nouvelle relance » se termine par « Ouvrir dans Google Agenda » : un événement Google est créé, rien dans le dossier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 16, $academy_deck$vrai_faux$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 3, $academy_deck${"enonce":"Un patrimoine estimé saisi à 0 passe le verrou de signature, car le CRM tient un montant à 0 pour une donnée saisie."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"vrai":true}$academy_deck$::jsonb, $academy_deck$Le CRM accepte le 0 comme saisi et ne détecte pas la tricherie ; la fiche fausse remonte dans « Complétude des fiches ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 17, $academy_deck$multi$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui fait partie des six champs de la fiche exigés pour signer.","choix":["Email","Téléphone","Profession","Date de naissance","Situation familiale","Source"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Six champs : email, téléphone, statut, profession, revenus annuels, patrimoine estimé ; date de naissance et situation familiale comptent pour la jauge.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 18, $academy_deck$multi$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce qui ouvre la modale « Nouveau dossier ».","choix":["Le bouton doré « Nouveau dossier » en haut à droite des écrans commerciaux","La touche N’hors saisie","La palette ⌘K et son action « Nouveau dossier »","Le bouton « + Nouveau client » de l'Annuaire","Le bouton « Nouvelle relance » de l'Agenda"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Trois chemins ouvrent la même modale ; « + Nouveau client » crée une fiche et « Nouvelle relance » un événement Google.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 19, $academy_deck$multi$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 1, $academy_deck${"enonce":"Cochez tout ce qui est un geste proposé sur une relance dans « Ma journée ».","choix":["« Fait »","« → demain »","« → +7 j »","« Relancer »","« Toujours en cours »","« Abandonner »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$« Ma journée » propose exactement trois gestes ; les trois autres appartiennent à « Dossiers sans mouvement ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 20, $academy_deck$multi$academy_deck$, $academy_deck$Trier sans mouvement$academy_deck$, 3, $academy_deck${"enonce":"Cochez tout ce qu'un dossier doit réunir pour figurer dans « Dossiers sans mouvement ».","choix":["Statut En cours","Aucune relance datée (« Pour le » vide)","Aucune modification du dossier depuis plus de 21 jours","Une relance en retard","Une fiche client à moins de « Signature 6/6 »","Statut RDV calé"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$En cours, « Pour le » vide, plus de 21 jours sans modification ; une relance en retard est déjà dans « Ma journée ».$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 21, $academy_deck$multi$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 2, $academy_deck${"enonce":"Cochez tout ce que le CRM vérifie à l'enregistrement d'un dossier en Signé (les trois verrous).","choix":["La fiche client complète sur les six champs","Un produit choisi","La « Date de signature effective »","La jauge de complétude au niveau « Complète »","Un co-conseiller renseigné","La « Date de signature prévue »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"indices":[0,1,2]}$academy_deck$::jsonb, $academy_deck$Trois verrous : fiche complète, produit, date effective ; la jauge à huit champs ne bloque pas la signature.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 22, $academy_deck$ordre$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Vous raccrochez avec une prospecte intéressée par un PER. Remettez dans l'ordre la création express du dossier.","elements":["Touche N : la modale s'ouvre en mode express","Rechercher un client existant, sinon saisir nom, email, téléphone et mois","Choisir « Produit * » (PER Individuel)","Poser la « Date de signature prévue »","Cliquer « Créer le dossier »","Le soir, rouvrir le dossier pour la compagnie et la PP mensuelle"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4,5]}$academy_deck$::jsonb, $academy_deck$L'express suffit pour commencer : identité, au moins un produit et une date prévue, puis on complète plus tard.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 23, $academy_deck$ordre$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 1, $academy_deck${"enonce":"Remettez dans l'ordre d'affichage les blocs de l'accueil « Mon mois », du haut vers le bas.","elements":["« Ma journée » : les RDV du jour","« Ma journée » : les relances en retard","« Ma journée » : les relances du jour","Plus bas, le bloc « Dossiers sans mouvement »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3]}$academy_deck$::jsonb, $academy_deck$« Ma journée » affiche RDV du jour, relances en retard puis relances du jour ; « Dossiers sans mouvement » vient plus bas.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 24, $academy_deck$ordre$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 2, $academy_deck${"enonce":"Cas fictif. Lundi, vous envoyez un devis d'assurance vie. Remettez dans l'ordre le déroulé d'une séquence « Relance devis standard ».","elements":["Ouvrir le dossier en formulaire complet, bloc « Séquence de relance »","Choisir le gabarit « Relance devis standard » et cliquer « Démarrer »","Cliquer « Enregistrer » pour persister l'étape 1","Le jour venu, appeler le client depuis « Ma journée »","Consigner l'appel dans « Historique » puis cliquer « Fait »","L'étape 2 s'arme sept jours après le clic"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4,5]}$academy_deck$::jsonb, $academy_deck$« Démarrer » pose l'étape 1, « Enregistrer » la persiste, « Fait » arme l'étape suivante datée depuis aujourd'hui.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 25, $academy_deck$ordre$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 3, $academy_deck${"enonce":"Cas fictif. Monsieur Ravel a signé vendredi. Remettez dans l'ordre les gestes d'une signature propre.","elements":["Vérifier « Signature n/6 » sur la fiche client","Glisser la carte vers « Signé ✓ » : la modale s'ouvre en Signé","Poser la « Date de signature effective »","Cliquer « Enregistrer »","Si le toast liste des champs manquants, les remplir puis enregistrer de nouveau"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"ordre":[0,1,2,3,4]}$academy_deck$::jsonb, $academy_deck$La signature passe par la modale ; le toast « Pour signer, complétez la fiche client : … » nomme ce qui manque.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 26, $academy_deck$association$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 1, $academy_deck${"enonce":"Associez chaque gabarit de séquence de relance à ses étapes.","gauche":["« Relance devis standard »","« Suite de rendez vous »","« Pièces manquantes »"],"droite":["J+2, J+7, J+15","J+1, J+5, J+12","J+3, J+10, J+20"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2]]}$academy_deck$::jsonb, $academy_deck$Devis standard J+2, J+7, J+15 ; suite de rendez vous J+1, J+5, J+12 ; pièces manquantes J+3, J+10, J+20.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 27, $academy_deck$association$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque statut de dossier à ce qui le caractérise.","gauche":["En cours","RDV calé","Signé","Annulé"],"droite":["Dossier ouvert, « Date de signature prévue » obligatoire","Valeur « Prévu », brouillon posé par la Lead Room","Colonne « Signé ✓ », « Date de signature effective » obligatoire","Issue de « Abandonner » ou de « No-show »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Quatre statuts : En cours et RDV calé exigent la date prévue, Signé la date effective, Annulé vient d'un abandon ou d'un no-show.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 28, $academy_deck$association$academy_deck$, $academy_deck$Trier sans mouvement$academy_deck$, 2, $academy_deck${"enonce":"Associez chaque geste de « Dossiers sans mouvement » à son effet.","gauche":["« Déjà signé »","« Toujours en cours »","« Relancer »","« Abandonner »"],"droite":["Ouvre la modale en Signé","Le dossier se tait 21 jours de plus","Ouvre le dossier pour y poser une date","Passe le dossier en Annulé après confirmation"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Quatre gestes : signer, faire taire 21 jours, dater une relance, ou annuler après confirmation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 29, $academy_deck$association$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 3, $academy_deck${"enonce":"Associez chaque indicateur du CRM à ce qu'il mesure.","gauche":["Verrou de signature","Jauge de complétude","Puce « À compléter »","« Signés, fiche à finir »"],"droite":["Six champs, affichés « Signature n/6 »","Huit champs pondérés, quatre niveaux","Produit Autre et PP mensuelle à 0","Dossier Signé, jauge sous 100 %, plus de 21 jours sans mouvement"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"paires":[[0,0],[1,1],[2,2],[3,3]]}$academy_deck$::jsonb, $academy_deck$Le verrou dit le droit de signer, la jauge la qualité de la donnée ; la puce signale un brouillon.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 30, $academy_deck$trou_choix$academy_deck$, $academy_deck$Trier sans mouvement$academy_deck$, 1, $academy_deck${"phrase":"« Dossiers sans mouvement » retient les dossiers En cours sans relance datée et non modifiés depuis plus de ___ jours.","choix":["7","15","21","30"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Le seuil de stagnation est 21 jours, comptés sur la date de dernière modification du dossier.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 31, $academy_deck$trou_choix$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 1, $academy_deck${"phrase":"Chaque geste de « Ma journée » est annulable pendant ___ secondes par le bouton « Annuler » du toast.","choix":["trois","cinq","sept","dix"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$« Fait », « → demain » et « → +7 j » sont annulables sept secondes via le toast.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 32, $academy_deck$trou_choix$academy_deck$, $academy_deck$Tracer un échange$academy_deck$, 3, $academy_deck${"phrase":"Cas fictif. Vous reprenez le dossier d'un collègue absent et reportez ses notes dans « Historique » : Type « Note », Sens ___.","choix":["« Sortant »","« Entrant »","« Interne »","« Rendez-vous »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":2}$academy_deck$::jsonb, $academy_deck$Une information venue du cabinet se consigne en Type « Note », Sens « Interne » ; « Rendez-vous » est un type.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 33, $academy_deck$trou_choix$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 2, $academy_deck${"phrase":"Le lendemain d'un RDV calé, la carte du pipeline propose « RDV tenu » et ___.","choix":["« Déjà signé »","« No-show »","« Abandonner »","« Relancer »"]}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"index":1}$academy_deck$::jsonb, $academy_deck$« RDV tenu » passe le dossier En cours ; « No-show » passe le brouillon en Annulé après confirmation.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 34, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 1, $academy_deck${"phrase":"La fiche client compte les champs exigés pour signer sous l'indicateur « Signature n/___ ».","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["6","six","Six"]}$academy_deck$::jsonb, $academy_deck$Six champs conditionnent la signature : email, téléphone, statut, profession, revenus annuels, patrimoine estimé.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 35, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Programmer le suivi$academy_deck$, 1, $academy_deck${"phrase":"Dans le gabarit « Relance devis standard », l'étape 2 tombe à J+___.","aide":"un nombre de jours"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["7","sept","Sept"]}$academy_deck$::jsonb, $academy_deck$« Relance devis standard » enchaîne J+2, J+7 et J+15.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 36, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Créer un dossier$academy_deck$, 1, $academy_deck${"phrase":"À l'écran, le statut de valeur « Prévu » s'affiche « RDV ___ ».","aide":"un mot"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["calé","cale","Calé","Cale"]}$academy_deck$::jsonb, $academy_deck$« RDV calé » est le libellé écran de la valeur « Prévu », statut du brouillon posé par la Lead Room.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 37, $academy_deck$trou_saisie$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 2, $academy_deck${"phrase":"La jauge de complétude compte ___ champs pondérés, contre six pour le verrou de signature.","aide":"un nombre"}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${"reponses":["8","huit","Huit"]}$academy_deck$::jsonb, $academy_deck$La jauge compte huit champs pondérés, dont date de naissance et situation familiale, en quatre niveaux.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 38, $academy_deck$carte$academy_deck$, $academy_deck$Tracer un échange$academy_deck$, 1, $academy_deck${"recto":"Quels types et quels sens propose « + Consigner un échange » ?","verso":"Types : Appel, E-mail, Rendez-vous, Courrier, Note. Sens : Sortant, Entrant, Interne."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Le formulaire de l'onglet Historique demande Type, Sens, Date, Objet, Compte rendu et un dossier concerné facultatif.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 39, $academy_deck$carte$academy_deck$, $academy_deck$Compléter la fiche client$academy_deck$, 1, $academy_deck${"recto":"Quels sont les quatre niveaux de la jauge de complétude ?","verso":"Complète, Presque complète, Partielle, À démarrer."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$La jauge classe les fiches en quatre niveaux, distincts du verrou de signature à six champs.$academy_deck$);
  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, 40, $academy_deck$carte$academy_deck$, $academy_deck$Signer proprement$academy_deck$, 2, $academy_deck${"recto":"Que devient une mission Multi-équipement quand le dossier correspondant est signé ?","verso":"Elle passe d'elle-même dans « Gagnées ✓ », sans geste du conseiller."}$academy_deck$::jsonb)
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, $academy_deck${}$academy_deck$::jsonb, $academy_deck$Gestes : « Proposer », « Relancer », « Plus tard » ; la signature du dossier bascule seule la mission en Gagnées.$academy_deck$);
end
$deck_maitriser_le_crm$;
