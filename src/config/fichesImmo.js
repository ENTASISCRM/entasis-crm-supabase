// src/config/fichesImmo.js
// ═══════════════════════════════════════════════════════════════════════════
// FICHES DISPOSITIF — aide a la qualification, usage interne
//
// Le conseiller n’a pas de lot a vendre : il a un besoin a faire emerger et un
// dossier a transmettre au bon referent. Ces fiches servent a ca, en amont du
// rendez vous : reconnaitre le profil, expliquer le mecanisme simplement,
// connaitre les points qui font capoter un dossier, et savoir quoi demander.
//
// DOCUMENT INTERNE. Il ne remplace pas la documentation reglementaire du
// partenaire et n’a pas vocation a etre remis au client en l’etat.
//
// Les chiffres fiscaux bougent a chaque loi de finances. Ils sont dates, et
// chaque fiche rappelle de les faire confirmer par le referent avant tout
// engagement. Aucune remuneration, ni celle du conseiller ni celle du
// cabinet, ne figure dans ces fiches.
// ═══════════════════════════════════════════════════════════════════════════

export const FICHES_MAJ = '25 août 2026'

export const FICHES_IMMO = [
  // ─── Althera Patrimoine, immobilier neuf ────────────────────────────────
  {
    cle: 'vefa',
    dispositif: 'VEFA',
    titre: 'Vente en l’état futur d’achèvement',
    partenaire: 'althera',
    accroche: 'Acheter sur plan : le cadre juridique de presque toutes les opérations dans le neuf.',
    pourQui: [
      'Primo accédant qui veut du neuf sans travaux ni surprise de copropriété.',
      'Investisseur qui cherche un bien aux normes récentes, avec peu d’entretien les premières années.',
      'Client qui a du temps devant lui : entre la réservation et la livraison, il faut compter 18 à 30 mois.',
    ],
    principe: [
      'Le client achète un logement qui n’existe pas encore, sur plan, et le paie au fur et à mesure de la construction (les appels de fonds).',
      'Il devient propriétaire du sol dès la signature chez le notaire, puis de la construction au fil de son avancement.',
      'Le promoteur est tenu par un calendrier et par des garanties légales : c’est-ce qui distingue la VEFA d’un achat classique.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Frais de notaire réduits : de l’ordre de 2 à 3 % du prix, contre 7 à 8 % dans l’ancien.',
        'Garantie financière d’achèvement : si le promoteur défaille, un garant finance la fin du chantier.',
        'Garanties de parfait achèvement (1 an), biennale (2 ans) et décennale (10 ans).',
        'Logement aux dernières normes énergétiques, donc charges maîtrisées et pas de risque de passoire thermique.',
        'Aucun travaux à prévoir avant longtemps.',
      ],
    },
    chiffres: [
      { label: 'Frais de notaire', valeur: 'environ 2 à 3 %' },
      { label: 'Délai de livraison', valeur: '18 à 30 mois' },
      { label: 'Garantie décennale', valeur: '10 ans' },
      { label: 'TVA', valeur: '20 %, réduite à 5,5 % en secteur ANRU sous conditions' },
    ],
    vigilance: [
      'Le calendrier glisse souvent. Annoncer une livraison ferme est le meilleur moyen de décevoir : parler en fourchette.',
      'Pas de loyer pendant la construction, alors que le crédit court : vérifier la capacité à porter les intérêts intercalaires.',
      'La qualité de l’emplacement compte plus que le dispositif fiscal. Un mauvais emplacement neuf reste un mauvais emplacement.',
      'Le client signe un contrat de réservation avec un dépôt de garantie : lui expliquer son délai de rétractation de 10 jours.',
    ],
    questions: [
      'Est-ce pour habiter ou pour louer ? La réponse change tout le montage.',
      'Dans combien de temps avez-vous besoin du logement ?',
      'Avez-vous déjà un accord de principe de votre banque, et jusqu’à quel montant ?',
      'Quel apport pouvez-vous mobiliser sans toucher à votre épargne de précaution ?',
      'Avez-vous déjà acheté dans le neuf, ou est-ce une première ?',
    ],
  },
  {
    cle: 'lmnp',
    dispositif: 'LMNP',
    titre: 'Loueur en meublé non professionnel',
    partenaire: 'althera',
    accroche: 'Des revenus locatifs peu ou pas imposés pendant des années, grâce à l’amortissement.',
    pourQui: [
      'Client déjà imposé qui cherche un complément de revenu sans alourdir sa feuille d’impôt.',
      'Actif en milieu ou fin de carrière qui prépare un revenu pour la retraite.',
      'Client qui accepte de louer meublé, avec la gestion que cela suppose (ou une résidence gérée).',
    ],
    principe: [
      'La location meublée relève des BIC, pas des revenus fonciers : c’est de là que vient tout l’intérêt.',
      'Au régime réel, le client déduit les charges, les intérêts d’emprunt, et surtout amortit le bien (hors terrain) et le mobilier.',
      'Résultat courant : un revenu locatif effacé fiscalement pendant dix à quinze ans, sans que le loyer cesse de tomber.',
      'Le statut reste non professionnel tant que les recettes restent sous 23 000 € par an ou sous les autres revenus du foyer.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Le loyer encaissé n’est pas ou peu imposé pendant la durée de l’amortissement.',
        'Le déficit BIC reste reportable sur les bénéfices de la même activité les années suivantes.',
        'En résidence gérée (étudiante, senior, affaires), un bail commercial confie la gestion à l’exploitant.',
        'Un régime micro BIC existe pour les petits dossiers, avec abattement forfaitaire, sans comptabilité.',
      ],
    },
    chiffres: [
      { label: 'Plafond du statut non professionnel', valeur: '23 000 € de recettes par an' },
      { label: 'Durée d’amortissement du bâti', valeur: '25 à 40 ans selon les composants' },
      { label: 'Régime réel', valeur: 'obligatoire au delà des seuils du micro BIC' },
    ],
    vigilance: [
      'Depuis la loi de finances 2025, les amortissements déduits sont réintégrés dans le calcul de la plus value à la revente : le gain fiscal des années de détention se paie en partie à la sortie. À expliquer d’entrée, jamais à la fin.',
      'Le régime réel suppose un expert comptable : compter ce coût annuel dans le rendement présenté.',
      'En résidence gérée, tout dépend de la solidité de l’exploitant. Un exploitant qui renégocie le bail à la baisse, cela arrive.',
      'Les règles du meublé de tourisme ont été durcies : ne pas transposer un raisonnement de location saisonnière.',
    ],
    questions: [
      'Quelle est votre tranche marginale d’imposition aujourd’hui ?',
      'Cherchez-vous un revenu tout de suite, ou dans dix ans à la retraite ?',
      'Préférez-vous gérer vous même ou confier la gestion à un exploitant ?',
      'Avez-vous déjà des revenus fonciers, et sont-ils imposés ?',
      'À quel horizon envisagez-vous de revendre ?',
    ],
  },
  {
    cle: 'lli',
    dispositif: 'LLI',
    titre: 'Logement locatif intermédiaire',
    partenaire: 'althera',
    accroche: 'Un loyer sous le marché, compensé par une TVA réduite et un crédit d’impôt de taxe foncière.',
    pourQui: [
      'Investisseur qui vise les zones tendues et accepte un engagement long.',
      'Client qui cherche du rendement net plutôt qu’une réduction d’impôt immédiate.',
      'Client à l’aise avec une détention via une société, condition d’accès pour un particulier.',
    ],
    principe: [
      'Le logement est loué à un niveau intermédiaire, environ 10 à 15 % sous le marché local, à des locataires sous plafond de ressources.',
      'En contrepartie, l’État abaisse la TVA sur l’acquisition et accorde un crédit d’impôt qui compense la taxe foncière.',
      'L’engagement porte sur quinze ans minimum, dans les zones tendues (A bis, A, B1 et communes assimilées).',
      'Pour un particulier, l’accès se fait par une structure dédiée : c’est le référent qui monte le véhicule adapté.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'TVA à 10 % au lieu de 20 % : l’économie est immédiate et porte sur le prix d’achat.',
        'Crédit d’impôt adossé à la taxe foncière pendant la durée de l’engagement.',
        'Pas de plafonnement des niches fiscales, puisque ce n’est pas une réduction d’impôt.',
        'Locataires sous plafond de ressources : dans les zones tendues, la demande ne manque pas.',
      ],
    },
    chiffres: [
      { label: 'TVA', valeur: '10 % au lieu de 20 %' },
      { label: 'Engagement de location', valeur: '15 ans minimum' },
      { label: 'Décote de loyer', valeur: 'environ 10 à 15 % sous le marché' },
      { label: 'Zones', valeur: 'A bis, A, B1 et communes assimilées' },
    ],
    vigilance: [
      'Quinze ans, c’est long. Un client qui peut avoir besoin de vendre dans cinq ans n’est pas le bon client.',
      'Le loyer est plafonné : ne jamais présenter un rendement calculé au prix du marché libre.',
      'La détention passe par une société : frais de constitution, comptabilité, et une sortie moins simple qu’en direct.',
      'Le dispositif a été remanié plusieurs fois depuis 2024 : faire confirmer les conditions en vigueur par le référent.',
    ],
    questions: [
      'Sur quel horizon pouvez-vous immobiliser cet investissement ?',
      'Cherchez-vous à réduire votre impôt cette année, ou à construire un rendement durable ?',
      'Êtes-vous déjà détenteur de parts de société civile ou d’une SCI ?',
      'Le bien est-il destiné à rester locatif, ou à loger un proche un jour ?',
    ],
  },
  {
    cle: 'ptz',
    dispositif: 'PTZ',
    titre: 'Prêt à taux zéro',
    partenaire: 'althera',
    accroche: 'Un prêt sans intérêts qui décide souvent de la faisabilité du projet du primo-accédant.',
    pourQui: [
      'Client qui achète sa résidence principale et n’a pas été propriétaire de sa résidence principale depuis deux ans.',
      'Ménage sous plafond de ressources, en particulier les jeunes actifs et les familles.',
      'Client dont le plan de financement ne passe pas sans un coup de pouce.',
    ],
    principe: [
      'L’État prend en charge les intérêts d’une partie du financement : le client ne rembourse que le capital.',
      'Le PTZ complète un prêt principal, il ne le remplace pas.',
      'Le montant dépend de la zone, de la composition du foyer et des revenus, dans la limite d’une quotité du coût de l’opération.',
      'Un différé de remboursement est prévu pour les revenus les plus modestes.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Aucun intérêt à payer sur cette part du financement.',
        'Il améliore mécaniquement le taux d’endettement global du dossier.',
        'Un différé de remboursement allège les premières années, celles où le budget est le plus tendu.',
        'Cumulable avec les autres aides à l’accession.',
      ],
    },
    chiffres: [
      { label: 'Nature', valeur: 'résidence principale uniquement' },
      { label: 'Condition', valeur: 'ne pas avoir été propriétaire de sa résidence principale depuis 2 ans' },
      { label: 'Durée', valeur: 'jusqu’à 25 ans, différé inclus' },
    ],
    vigilance: [
      'Ce n’est pas un produit d’investissement : ni location, ni défiscalisation. Ne pas le proposer à un investisseur.',
      'Les plafonds et les quotités changent régulièrement : les faire confirmer, jamais les annoncer de mémoire.',
      'Le logement doit rester la résidence principale du client pendant plusieurs années, sous peine de remboursement anticipé.',
      'C’est la banque qui accorde le PTZ, pas le promoteur : le dossier reste soumis à son accord.',
    ],
    questions: [
      'Êtes-vous, ou avez-vous été, propriétaire de votre résidence principale ces deux dernières années ?',
      'Quels sont vos revenus fiscaux de référence, et combien de personnes dans le foyer ?',
      'Votre banque vous a-t-elle déjà parlé du PTZ sur ce projet ?',
      'Le logement sera-t-il votre résidence principale dès la livraison ?',
    ],
  },
  {
    cle: 'nue-propriete',
    dispositif: 'Nue-propriété',
    titre: 'Démembrement temporaire de propriété',
    partenaire: 'althera',
    accroche: 'Acheter avec une forte décote, sans revenu donc sans impôt, et récupérer la pleine propriété plus tard.',
    pourQui: [
      'Client fortement imposé qui ne veut surtout pas de revenu supplémentaire aujourd’hui.',
      'Client soumis à l’IFI et cherchant à ne pas alourdir son assiette.',
      'Client qui prépare un revenu ou un logement pour dans quinze ans : retraite, enfant qui étudiera.',
    ],
    principe: [
      'Le client achète la nue propriété ; l’usufruit est cédé pour une durée fixée, souvent quinze à vingt ans, à un bailleur institutionnel.',
      'Pendant cette période, l’usufruitier encaisse les loyers, assume l’entretien et la taxe foncière.',
      'Le client ne perçoit rien, donc ne déclare rien : ni impôt sur le revenu, ni prélèvements sociaux sur ce bien.',
      'Au terme, la pleine propriété se reconstitue automatiquement, sans acte ni fiscalité supplémentaire.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Décote à l’achat, couramment de l’ordre de 30 à 40 % de la valeur en pleine propriété.',
        'Aucun revenu imposable pendant toute la durée du démembrement.',
        'La nue propriété n’entre pas dans l’assiette IFI : c’est l’usufruitier qui est redevable.',
        'Ni gestion locative, ni impayé, ni entretien à supporter.',
        'Les intérêts d’emprunt restent imputables sur des revenus fonciers existants.',
      ],
    },
    chiffres: [
      { label: 'Décote courante', valeur: 'de l’ordre de 30 à 40 %' },
      { label: 'Durée du démembrement', valeur: '15 à 20 ans en général' },
      { label: 'Revenu perçu pendant la période', valeur: 'aucun' },
    ],
    vigilance: [
      'Aucun revenu pendant quinze ans : si le client compte sur un complément immédiat, ce n’est pas le bon produit.',
      'La revente d’une nue propriété en cours de démembrement trouve peu d’acheteurs : prévoir de tenir jusqu’au terme.',
      'L’intérêt dépend de la qualité de l’usufruitier et de l’état du bien restitué : ce point se vérifie dans le contrat.',
      'La décote n’est pas un rendement : elle rémunère l’absence de revenu, pas une bonne affaire en soi.',
    ],
    questions: [
      'Avez-vous besoin d’un revenu de ce placement aujourd’hui, ou plus tard ?',
      'Êtes-vous redevable de l’IFI ?',
      'Avez-vous des revenus fonciers déjà imposés sur lesquels imputer des intérêts ?',
      'À quel horizon ce capital doit-il redevenir disponible ?',
      'Un de vos enfants aura besoin d’un logement besoin d’un logement dans quinze ans ?',
    ],
  },

  // ─── François 1er, immobilier de défiscalisation ────────────────────────
  {
    cle: 'malraux',
    dispositif: 'Malraux',
    titre: 'Restauration en site patrimonial remarquable',
    partenaire: 'francois1er',
    accroche: 'Une réduction d’impôt assise sur les travaux, hors plafonnement des niches fiscales.',
    pourQui: [
      'Client fortement imposé qui a déjà saturé les dispositifs plafonnés.',
      'Client attaché au patrimoine bâti, sensible à la qualité de l’emplacement et de la restauration.',
      'Client capable d’immobiliser un budget significatif sur plusieurs années.',
    ],
    principe: [
      'Le client acquiert un logement dans un immeuble ancien situé en site patrimonial remarquable, et finance sa restauration complète.',
      'Les travaux, suivis par l’architecte des bâtiments de France, ouvrent droit à une réduction d’impôt.',
      'Le taux dépend du secteur : le plus élevé s’applique aux sites couverts par un plan de sauvegarde et de mise en valeur approuvé.',
      'Le logement doit ensuite être loué nu, en résidence principale, pendant neuf ans.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Réduction d’impôt de 22 % ou 30 % du montant des travaux selon le secteur.',
        'Assiette de travaux retenue jusqu’à 400 000 € sur quatre ans, soit jusqu’à 120 000 € de réduction.',
        'Hors plafonnement global des niches fiscales : le dispositif ne consomme pas l’enveloppe des 10 000 €.',
        'Pas de plafond de loyer ni de ressources du locataire.',
        'Un bien rare, en centre ancien, dont la valeur tient à l’emplacement plus qu’au dispositif.',
      ],
    },
    chiffres: [
      { label: 'Taux de réduction', valeur: '22 % ou 30 % des travaux selon le secteur' },
      { label: 'Assiette maximale', valeur: '400 000 € de travaux sur 4 ans' },
      { label: 'Réduction maximale', valeur: 'jusqu’à 120 000 €' },
      { label: 'Engagement de location', valeur: '9 ans, nu, résidence principale' },
    ],
    vigilance: [
      'La réduction s’impute sur l’impôt dû : sans impôt suffisant, elle est perdue. Vérifier l’impôt réel du client avant tout.',
      'Le chantier dure : deux à trois ans entre la signature et la mise en location, sans loyer pendant ce temps.',
      'La revente se fait sur un marché de niche, souvent après la période d’engagement.',
      'Les travaux doivent être conformes aux prescriptions de l’architecte des bâtiments de France : le calendrier ne dépend pas du client.',
    ],
    questions: [
      'Quel est le montant d’impôt sur le revenu que vous avez payé l’an dernier ?',
      'Avez-vous déjà utilisé des dispositifs plafonnés cette année ?',
      'Pouvez-vous vous passer de revenu locatif pendant deux à trois ans ?',
      'Sur quel horizon envisagez-vous de conserver le bien ?',
      'Une ville, une région à laquelle vous êtes attaché ?',
    ],
  },
  {
    cle: 'monuments-historiques',
    dispositif: 'Monuments Historiques',
    titre: 'Immeuble classé ou inscrit',
    partenaire: 'francois1er',
    accroche: 'La déduction du revenu global, sans plafond : le levier des tranches marginales les plus hautes.',
    pourQui: [
      'Client dans les tranches à 41 % ou 45 %, avec un revenu élevé et régulier.',
      'Client dont l’enjeu est l’impôt sur le revenu global, pas seulement les revenus fonciers.',
      'Client prêt à un engagement patrimonial long, sur un bien d’exception.',
    ],
    principe: [
      'Le bien est classé ou inscrit au titre des monuments historiques : c’est-ce statut, et lui seul, qui ouvre le régime.',
      'Les travaux de restauration et les charges se déduisent du revenu global, sans plafond de montant.',
      'Ce n’est donc pas une réduction d’impôt mais une déduction : l’économie croît avec la tranche marginale.',
      'Le propriétaire s’engage à conserver le bien pendant quinze ans.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Déduction du revenu global sans plafond de montant.',
        'Hors plafonnement global des niches fiscales.',
        'L’économie est proportionnelle à la tranche marginale : elle est maximale à 45 %.',
        'Un actif rare, dont la valeur patrimoniale ne dépend pas du dispositif fiscal.',
      ],
    },
    chiffres: [
      { label: 'Mécanisme', valeur: 'déduction du revenu global, pas de réduction d’impôt' },
      { label: 'Plafond de déduction', valeur: 'aucun' },
      { label: 'Engagement de conservation', valeur: '15 ans' },
      { label: 'Profil visé', valeur: 'tranche marginale 41 % ou 45 %' },
    ],
    vigilance: [
      'Sans tranche marginale élevée, le dispositif perd l’essentiel de son intérêt : c’est le premier filtre à appliquer.',
      'Quinze ans de conservation, avec des contraintes d’entretien propres au bâti protégé.',
      'La mise en copropriété ou la division sont encadrées et supposent un agrément.',
      'Le marché de la revente est étroit : la sortie se prépare dès l’entrée.',
    ],
    questions: [
      'Quelle est votre tranche marginale d’imposition ?',
      'Vos revenus sont-ils stables sur les prochaines années, ou une baisse est-elle prévisible ?',
      'Avez-vous déjà investi dans le patrimoine ancien ?',
      'Un engagement de quinze ans est-il compatible avec vos projets ?',
    ],
  },
  {
    cle: 'deficit-foncier',
    dispositif: 'Déficit foncier',
    titre: 'Travaux imputés sur les revenus fonciers et le revenu global',
    partenaire: 'francois1er',
    accroche: 'Le dispositif le plus simple à expliquer, et le plus efficace quand le client a déjà des revenus fonciers.',
    pourQui: [
      'Client qui perçoit déjà des revenus fonciers imposés, et s’en plaint.',
      'Propriétaire d’un bien ancien à rénover, ou candidat à en acquérir un.',
      'Client qui veut un effet fiscal immédiat sans monter de structure.',
    ],
    principe: [
      'Les travaux de rénovation déductibles s’imputent d’abord sur les revenus fonciers existants, qu’ils effacent.',
      'L’excédent s’impute ensuite sur le revenu global, dans une limite annuelle.',
      'Ce qui dépasse encore reste reportable sur les revenus fonciers des dix années suivantes.',
      'Le bien doit rester loué nu pendant trois ans après l’imputation.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Effet immédiat dès l’année des travaux, sans attendre une mise en location longue.',
        'Efface les revenus fonciers imposés, y compris les prélèvements sociaux associés.',
        'Une part s’impute sur le revenu global, dans la limite annuelle en vigueur.',
        'Aucune structure à créer : le client détient en direct.',
        'Le report sur dix ans évite de perdre l’avantage si les travaux dépassent le revenu.',
      ],
    },
    chiffres: [
      { label: 'Imputation sur le revenu global', valeur: 'plafonnée, montant à confirmer pour l’année en cours' },
      { label: 'Report de l’excédent', valeur: '10 ans sur les revenus fonciers' },
      { label: 'Engagement de location', valeur: '3 ans après imputation, en nu' },
    ],
    vigilance: [
      'Sans revenu foncier existant, l’effet se limite à la part imputable sur le revenu global : le dispositif perd beaucoup de sa force.',
      'Seuls les travaux d’entretien, de réparation et d’amélioration sont déductibles. La construction et l’agrandissement ne le sont pas.',
      'Le plafond majoré prévu pour les rénovations énergétiques est un régime temporaire : faire confirmer sa disponibilité pour l’année en cours.',
      'Une revente avant les trois ans remet en cause l’imputation.',
    ],
    questions: [
      'Percevez-vous déjà des revenus fonciers, et de quel montant ?',
      'Ces revenus sont-ils imposés, et à quelle tranche ?',
      'Possédez-vous déjà un bien qui aurait besoin de travaux ?',
      'Cherchez-vous un effet fiscal dès cette année ou pouvez-vous attendre ?',
    ],
  },
  {
    cle: 'denormandie',
    dispositif: 'Denormandie',
    titre: 'Ancien avec travaux en centre ville',
    partenaire: 'francois1er',
    accroche: 'Une réduction d’impôt étalée, dans des villes moyennes où le prix d’entrée reste raisonnable.',
    pourQui: [
      'Client à budget modéré qui veut de la défiscalisation sans ticket d’entrée élevé.',
      'Client qui cherche du rendement locatif plutôt qu’un bien de prestige.',
      'Investisseur qui accepte un engagement de six à douze ans.',
    ],
    principe: [
      'Le client achète un logement ancien dans une commune éligible, en général engagée dans une opération de revitalisation du centre ville.',
      'Il réalise des travaux représentant au moins un quart du coût total de l’opération.',
      'Il loue ensuite le logement nu, en résidence principale, avec des plafonds de loyer et de ressources du locataire.',
      'La réduction d’impôt est étalée sur la durée de l’engagement choisie.',
    ],
    avantage: {
      titre: 'Ce qui plaît au client',
      points: [
        'Réduction d’impôt de 12, 18 ou 21 % selon un engagement de 6, 9 ou 12 ans.',
        'Base de calcul plafonnée à 300 000 € et à 5 500 € le mètre carré.',
        'Prix d’entrée plus accessible que dans les métropoles.',
        'Le bien est rénové : moins de charges imprévues que dans un ancien non refait.',
      ],
    },
    chiffres: [
      { label: 'Taux de réduction', valeur: '12 %, 18 % ou 21 % selon la durée' },
      { label: 'Durée d’engagement', valeur: '6, 9 ou 12 ans' },
      { label: 'Part de travaux', valeur: 'au moins 25 % du coût total' },
      { label: 'Base plafonnée', valeur: '300 000 € et 5 500 € par m²' },
    ],
    vigilance: [
      'Le dispositif est borné dans le temps et la liste des communes évolue : vérifier l’éligibilité de la commune avec le référent, jamais de mémoire.',
      'La réduction entre dans le plafonnement global des niches fiscales, contrairement à Malraux et aux Monuments Historiques.',
      'Loyers et ressources plafonnés : le rendement se calcule sur le loyer plafond, pas sur le loyer de marché.',
      'Le marché locatif d’une ville moyenne peut être étroit : la vacance se prévoit dans le plan de financement.',
    ],
    questions: [
      'Quel budget total pouvez-vous consacrer à cette opération, travaux compris ?',
      'Combien payez-vous d’impôt sur le revenu par an ?',
      'Avez-vous déjà utilisé d’autres niches fiscales cette année ?',
      'Sur quelle durée acceptez-vous de vous engager à louer ?',
      'Connaissez-vous des villes où vous seriez à l’aise d’investir ?',
    ],
  },
]

export const fichesDuPartenaire = (cle) => FICHES_IMMO.filter((f) => f.partenaire === cle)
export const ficheDe = (cle) => FICHES_IMMO.find((f) => f.cle === cle) || null
