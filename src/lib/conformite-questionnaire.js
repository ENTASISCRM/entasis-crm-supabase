// src/lib/conformite-questionnaire.js
// Données réglementaires du parcours conformité DDA (PER IN).
// Contenu transcrit verbatim depuis les documents modèles du cabinet :
//   1. Recueil des exigences et besoins (8 pages), référence principale
//   2. Devoir de conseil (4 pages)
//   3. Document d'entrée en relation (contenu statique cabinet)
// Fidélité impérative : ces chaînes sont du texte réglementaire, ne pas
// reformuler, ne pas corriger l'orthographe ni la ponctuation d'origine.

// Coordonnées et mention légale du cabinet (pied de page des documents)
export const CABINET = {
  nom: 'ENTASIS',
  adresse: '47 BOULEVARD DE COURCELLES 75008 Paris',
  tel: '0187667124',
  email: 'contact@entasis-conseil.fr',
  footerLegal:
    'ENTASIS - 47 BOULEVARD DE COURCELLES 75008 Paris SAS au capital de 1000 € – Inscrite au RCS de PARIS sous le n°950 782 805 R.C.S. Paris – Code APE Activités des agents et courtiers d’assurances (66.22Z) – Immatriculée à l’ORIAS en qualité de courtier sous le numéro 23003153 (www.orias.fr) – Responsabilité Civile Professionnelle et Garantie Financière conformes aux articles L 512-6 et L 512-7 du code des assurances – Intermédiaire d’assurance sous le contrôle de l’Autorité de Contrôle Prudentiel et de Résolution (ACPR) – DCPC-SIR – 4 place de Budapest – CS 92459 - 75436 PARIS CEDEX 09 – En cas de réclamation : contact@entasis-conseil.fr ou 47 BOULEVARD DE COURCELLES 75008 Paris – Le Cabinet ENTASIS exerce son activité, en fonction de la nature du risque, en application des dispositions de l’article L 520-1 II b du Code des Assurances (la liste des compagnies partenaires est disponible sur simple demande).',
};

// Encadré d'introduction du Recueil des exigences et besoins (page 1)
export const INTRO_RECUEIL =
  'Le présent document retrace le dialogue et les échanges préalables à la décision d’adhérer ou non à un contrat d’assurance, permettant ainsi de répondre aux obligations d’informations et de conseil qui incombent aux intermédiaires d’assurance, conformément aux obligations légales prévues au titre II du Livre V du Code des Assurances.\n\nCette démarche nous a permis :\n\n• De préciser la situation personnelle et professionnelle du client\n• D’identifier les exigences du client et de définir ses besoins\n• De mettre en évidence l’adéquation de l’offre proposée à sa situation et à ses besoins.';

// Encadré réglementaire du Devoir de conseil (page 1)
export const REGLEMENTAIRE_INTRO_DEVOIR =
  'En application des articles L. 521-2 (ancien L. 520-1), nouvel L. 521-4 et R. 521-2 (ancien R. 520-2) du code des assurances, cette étude personnalisée a pour objectif de définir de façon indépendante, claire et exacte vos besoins afin de vous proposer le contrat le mieux adapté à votre situation.';

// Listes de choix de la section Situation personnelle et professionnelle
export const SITUATIONS_MATRIMONIALES = [
  'Célibataire',
  'Marié(e)',
  'Pacsé(e)',
  'En concubinage',
  'Divorcé(e)',
  'Veuf(ve)',
];

export const STATUTS_PRO = [
  'Salarié(e)',
  'Profession libérale',
  'Chef d’entreprise',
  'Fonctionnaire',
  'Retraité(e)',
  'Sans activité',
  'Autre',
];

// Tranches de patrimoine financier (client et foyer)
export const PATRIMOINE_TRANCHES = [
  'Moins de 50 K€',
  '50 - 250 K€',
  '250 - 500 K€',
  '500 K€ - 1 M€',
  'Plus de 1 M€',
];

// Tranche marginale d'imposition du foyer
export const TMI_OPTIONS = ['0 %', '11 %', '30 %', '41 %', '45 %'];

// Définition PPE (texte italique du Recueil, page 1)
export const PPE_DEFINITION =
  'Pour être qualifiée de personne politiquement exposée (PPE) il faut que vous exerciez ou que vous ayez exercé depuis moins d’un (1) an l’une des fonctions politique, juridictionnelle ou administrative suivante : Chef d’Etat, chef de gouvernement, membre d’un gouvernement national ou de la Commission Européenne ; membre d’une assemblée parlementaire nationale ou du Parlement européen ; membre d’une cour suprême, d’une cour constitutionnelle ou d’une autre haute juridiction dont les décisions ne sont pas, sauf circonstances exceptionnelles, susceptibles de recours ; membre d’une cour des comptes ; dirigeant ou membre de l’organe de direction d’une banque centrale ; ambassadeur, chargé d’affaires, consul général et consul de carrière ; officier général ou officier supérieur assurant le commandement d’une armée ; membre d’un organe d’administration, de direction ou de surveillance d’une entreprise publique ; dirigeant d’une institution internationale publique, créée par un traité.';

// Définition entourage PPE (texte italique du Recueil, page 2)
export const PPE_ENTOURAGE_DEFINITION =
  'Pour être qualifié de membre de l’entourage d’une personne politiquement exposée (PPE), il faut que vous soyez :\n- Une personne de la famille : le conjoint ou le concubin notoire ; le partenaire lié par un pacte civil de solidarité ou par un contrat de partenariat enregistré en vertu d’une loi étrangère ; en ligne directe, les ascendants, descendants et alliés, au premier degré, ainsi que leur conjoint, leur partenaire lié par un pacte civil de solidarité ou par un contrat de partenariat enregistré en vertu d’une loi étrangère.\n- Une personne de l’entourage, étroitement associée : une personne physique identifiée comme étant le bénéficiaire effectif d’une personne morale conjointement avec vous ; une personne entretenant des liens d’affaires étroits avec vous.';

// Questionnaire Profil de risque (Recueil, pages 3 et 4).
// 14 questions, points entre parenthèses dans le PDF.
// Barème maximum par question : q1 2, q2 4, q3 1, q4 0, q5 4, q6 6, q7 3,
// q8 0, q9 1, q10 1, q11 1, q12 0, q13 4, q14 3. Total maximum 30.
export const RISK_QUESTIONS = [
  {
    id: 'q1',
    label: 'Quel est votre niveau de connaissances des marchés financiers ?',
    multi: false,
    options: [
      { label: 'Vous n’avez aucune connaissance des marchés et des placements financiers.', points: 0 },
      { label: 'Vous avez quelques connaissances des marchés et des placements financiers.', points: 1 },
      { label: 'Vous avez une bonne compréhension du fonctionnement des marchés et des placements financiers.', points: 2 },
    ],
  },
  {
    id: 'q2',
    label: 'Quel est votre niveau d’expérience sur les placements financiers (actions, obligations, OPCVM...) ?',
    multi: false,
    options: [
      { label: 'Je ne réalise pas d’opération sur des placements ou supports financiers.', points: 0 },
      { label: 'J’ai déjà réalisé des opérations sur des placements ou supports financiers et j’en connais les risques de fluctuation à la hausse comme à la baisse ainsi que les risques en perte en capital.', points: 2 },
      { label: 'J’ai des compétences en matière de placements ou supports financiers de par mon expérience professionnelle.', points: 4 },
    ],
  },
  {
    id: 'q3',
    label: 'A quels modes de gestion avez-vous eu recours ?',
    multi: false,
    options: [
      { label: 'Gestion directe, vous vous occupez-vous même de votre gestion.', points: 1 },
      { label: 'Gestion conseillée, vous êtes conseillé(e) par votre conseiller financier pour effectuer vos choix de gestion.', points: 0 },
      { label: 'Gestion sous-mandat, votre gestion est déléguée à un organisme de gestion.', points: 0 },
      { label: 'Vous ne préférez pas répondre.', points: 0 },
    ],
  },
  {
    id: 'q4',
    label: 'Sur quel(s) support(s) financier(s) avez-vous déjà réalisé des opérations en direct ou via de(s) support(s) en Unités de compte sur un contrat d’assurance vie ou de capitalisation ?',
    multi: true,
    options: [
      { label: 'Actions', points: 0 },
      { label: 'OPCVM obligations', points: 0 },
      { label: 'OPCVM monétaires', points: 0 },
      { label: 'OPCVM immobiliers/SCI/SCPI/OPCI', points: 0 },
      { label: 'Obligations', points: 0 },
      { label: 'Fonds Euros', points: 0 },
      { label: 'OPCVM actions', points: 0 },
      { label: 'OPCVM formule', points: 0 },
      { label: 'FCPI/FIP/FCPR', points: 0 },
      { label: 'Aucun', points: 0 },
    ],
  },
  {
    id: 'q5',
    label: 'En matière de placements financiers, pensez-vous plutôt que :',
    multi: false,
    options: [
      { label: 'Il ne faut pas prendre de risque, on doit placer toutes ses économies dans des placements sûrs.', points: 0 },
      { label: 'On peut placer une petite partie de ses économies sur des placements risqués.', points: 1 },
      { label: 'On peut placer une part importante de ses économies sur des actifs risqués si le gain en vaut la peine.', points: 2 },
      { label: 'On doit placer l’essentiel de ses économies dans des actifs risqués dès qu’il y a des chances de gains très importants.', points: 4 },
    ],
  },
  {
    id: 'q6',
    label: 'La valeur de votre investissement baisse de 20%, comment réagissez-vous ?',
    multi: false,
    options: [
      { label: 'Je préfère désinvestir au risque de subir une perte immédiate.', points: 0 },
      { label: 'Je préfère patienter, parce que ce qui m’intéresse est la croissance à moyen terme, je suis conscient qu’il peut y avoir des fluctuations.', points: 3 },
      { label: 'J’en profite pour réinvestir, car c’est une occasion d’acquérir d’avantage d’actions à un meilleur prix.', points: 6 },
    ],
  },
  {
    id: 'q7',
    label: 'En matière de placements financiers, les supports les plus susceptibles de générer de la performance peuvent également connaître des baisses, entraînant des risques de perte en capital. Parmi les orientations suivantes, laquelle vous correspond le mieux ?',
    multi: false,
    options: [
      { label: 'Un risque faible et un objectif de performance faible (hypothèse indicative de rendement : de -5% à +5% par an).', points: 0 },
      { label: 'Un risque modéré, dans un objectif de performance modérée (hypothèse indicative de rendement : de -10% à +10% par an).', points: 2 },
      { label: 'Un risque élevé, dans un objectif de performance élevée (hypothèse indicative de rendement : de -20% à +20% par an).', points: 3 },
    ],
  },
  {
    id: 'q8',
    label: 'Quelle importance accordez-vous au critère ESG / ISR ?',
    multi: false,
    options: [
      { label: 'Je souhaite investir exclusivement sur des fonds ESG / ISR.', points: 0 },
      { label: 'Je suis plutôt favorable à des investissements ESG / ISR.', points: 0 },
      { label: 'Je n’ai pas de préférence quant au critère ESG / ISR.', points: 0 },
    ],
  },
  {
    id: 'q9',
    label: 'Un investissement en placements collectifs/Unités de compte (FCP / SICAV / ETF / SCPI…) présente un risque de perte en capital ?',
    multi: false,
    options: [
      { label: 'Oui', points: 1 },
      { label: 'Non', points: 0 },
      { label: 'Je ne sais pas', points: 0 },
    ],
  },
  {
    id: 'q10',
    label: 'En assurance vie, mon capital est bloqué pendant 8 ans',
    multi: false,
    options: [
      { label: 'Oui', points: 0 },
      { label: 'Non', points: 1 },
      { label: 'Je ne sais pas', points: 0 },
    ],
  },
  {
    id: 'q11',
    label: 'Une perspective de gain élevé implique un risque de perte important',
    multi: false,
    options: [
      { label: 'Oui', points: 1 },
      { label: 'Non', points: 0 },
      { label: 'Je ne sais pas', points: 0 },
    ],
  },
  {
    id: 'q12',
    label: 'Quel est votre objectif principal ?',
    multi: false,
    options: [
      { label: 'Compléter vos revenus', points: 0 },
      { label: 'Valoriser votre capital', points: 0 },
      { label: 'Transmettre un capital', points: 0 },
      { label: 'Epargner en vue d’un projet', points: 0 },
      { label: 'Préparer votre retraite', points: 0 },
      { label: 'Prévoyance', points: 0 },
      { label: 'Autres', points: 0 },
    ],
  },
  {
    id: 'q13',
    label: 'Quel est l’horizon de placement de votre objectif principal ?',
    multi: false,
    options: [
      { label: '0 - 4 ans', points: 0 },
      { label: '4 - 8 ans', points: 1 },
      { label: '8 - 15 ans', points: 3 },
      { label: '> 15 ans', points: 4 },
    ],
  },
  {
    id: 'q14',
    label: 'Dans quelle tranche d’age vous situez vous ?',
    multi: false,
    options: [
      { label: 'Entre 18 et 55 ans', points: 3 },
      { label: 'Entre 56 et 74 ans', points: 2 },
      { label: 'Entre 75 et 85 ans', points: 1 },
      { label: 'Plus de 86 ans', points: 0 },
    ],
  },
];

// Score maximum atteignable (le PDF affiche par exemple, 21 points sur 30)
export const SCORE_MAX = 30;

// Profils investisseur. La description du profil dynamique est reprise
// verbatim du Recueil (page 5), les deux autres sont rédigées dans le même ton.
export const PROFILS = [
  {
    key: 'prudent',
    label: 'Profil prudent',
    min: 0,
    max: 12,
    desc: 'Vous privilégiez la sécurité de votre capital, quitte à accepter une performance potentielle plus faible. Vous acceptez un risque limité et privilégiez des placements sûrs.',
  },
  {
    key: 'equilibre',
    label: 'Profil équilibré',
    min: 13,
    max: 20,
    desc: 'Vous recherchez un équilibre entre la sécurité de votre capital et sa valorisation. Vous acceptez un risque modéré pour une croissance potentielle de votre capital à moyen terme.',
  },
  {
    key: 'dynamique',
    label: 'Profil dynamique',
    min: 21,
    max: 30,
    desc: 'Vous êtes prêts à accepter plus de risques pour une croissance potentielle plus significative de votre capital. Vous acceptez un risque plus élevé et un horizon de placement à long terme.',
  },
];

// Correspondance entre l'orientation choisie en q7 et le profil attendu
export const ORIENTATION_PROFIL_MAP = {
  0: 'prudent',
  1: 'equilibre',
  2: 'dynamique',
};

// Calcule le score du questionnaire de risque.
// reponses.risque contient l'index de l'option choisie (ou null) pour chaque
// question, et un tableau d'indices pour q4 (choix multiples).
export function computeScore(reponses) {
  const risque = (reponses && reponses.risque) || {};
  let total = 0;
  for (const question of RISK_QUESTIONS) {
    const reponse = risque[question.id];
    if (question.multi) {
      if (Array.isArray(reponse)) {
        for (const index of reponse) {
          const option = question.options[index];
          if (option) total += option.points;
        }
      }
    } else if (reponse !== null && reponse !== undefined) {
      const option = question.options[reponse];
      if (option) total += option.points;
    }
  }
  return total;
}

// Retourne l'objet PROFILS correspondant au score obtenu
export function computeProfil(score) {
  const profil = PROFILS.find((p) => score >= p.min && score <= p.max);
  if (profil) return profil;
  return score > SCORE_MAX ? PROFILS[PROFILS.length - 1] : PROFILS[0];
}

// Vrai si le client a répondu à q7 et que l'orientation choisie ne
// correspond pas au profil de risque calculé (déclenche ALERTE_ORIENTATION)
export function orientationMismatch(reponses) {
  const risque = (reponses && reponses.risque) || {};
  const q7 = risque.q7;
  if (q7 === null || q7 === undefined) return false;
  const profilAttendu = ORIENTATION_PROFIL_MAP[q7];
  if (!profilAttendu) return false;
  return profilAttendu !== computeProfil(computeScore(reponses)).key;
}

// Section Notre Conseil du Devoir de conseil (page 2), paragraphes
// séparés par une ligne vide
export const NOTRE_CONSEIL_PER =
  'Vous souhaitez souscrire un contrat de retraite supplémentaire financé par votre entreprise afin d’augmenter votre rente perçue lors de votre retraite ou de créer un capital tout en bénéficiant d’avantages fiscaux.\n\nLa loi PACTE et les textes juridiques qui en découlent ont modifiés les régimes d’épargne retraite notamment en créant un nouveau contrat qui remplace les contrats PERP, Madelin etc.\n\nCe contrat, intitulé PERIN (Plan d’Epargne Retraite Individuel) a des caractéristiques techniques qui diffèrent du contrat Madelin.\n\nEn effet, contrairement aux contrats Madelin, le contrat PERIN offre une possibilité de sortie en rente ou en capital lors du départ en retraite.\n\nLes cotisations au contrat PERIN bénéficient d’exonérations fiscales dans la limite de deux plafonds ( Article 154 bis ou 163 quatervicies du code général des impôts) selon si elles sont payées par l’entreprise dans le cadre de l’impôt sur les sociétés ou par le bénéficiaire dans le cadre de l’impôt sur le revenu.';

// Puces des obligations qui suivent la section Notre Conseil
export const OBLIGATIONS_PER = [
  'Bulletin d’adhésion, accompagné des pièces demandées, dûment complété ;',
  'Signature du contrat.',
];

// Phrase qui suit les obligations dans le Devoir de conseil (page 2)
export const NOTE_PLAFOND_FISCAL_PER =
  'Les cotisations à un contrat PERIN bénéficient d’avantages sur le plan fiscal dans la limite du plafond retenu (154 bis ou 163 quatervicies du code général des impôts).';

// Titre introduisant les avertissements du Devoir de conseil (page 2)
export const AVERTISSEMENTS_PER_INTRO = 'Nous vous alertons sur le fait que :';

// Les 3 puces d'avertissement du Devoir de conseil (page 2). La phrase sur les
// performances passees fait partie de la 2e puce dans le document modele.
export const AVERTISSEMENTS_PER = [
  'Si vous optez pour une sortie en capital, vous perdrez les caractéristiques techniques du contrat applicables à la rente.',
  'L’affectation des versements sur les différents supports doit se faire en fonction de votre profil et appétence au risque. Les fonds en unité de compte sont sujets à des fluctuations à la hausse et à la baisse pouvant entrainer une perte de capital. Les performances passées ne préjugent pas des performances futures.',
  'En dehors des cas de déblocage exceptionnels, les sommes investies seront bloquées jusqu’à votre départ à la retraite.',
];

// Alerte affichée quand l'orientation choisie ne correspond pas au profil
export const ALERTE_ORIENTATION =
  'Par ailleurs, nous soulignons que vous avez choisi une orientation qui ne correspond pas à votre profil de risque.';

// Section Déclarations du Recueil (page 7), 3 paragraphes verbatim
export const DECLARATIONS_TEXTS = [
  'Le présent document retrace notre dialogue et nos échanges préalables à votre décision de conclure un contrat d’assurance. Notre démarche et vos réponses à nos questions nous ont permis de (i) préciser votre situation, (ii) identifier vos exigences et vos besoins et (iii) mettre en évidence l’adéquation de l’offre proposée à votre situation et à vos besoins. Vous reconnaissez avoir pris connaissance du contenu du présent document préalablement à la souscription du contrat d’assurance proposé, avoir reçu une information détaillée sur l’étendue, la définition des risques, des garanties proposées, des franchises et que vous ne rentrez pas dans les cas d’exclusion mentionnés dans les CG.',
  'Nous insistons sur l’importance de la précision et de la sincérité des réponses que vous avez apportées dans nos échanges préalables et lors de la demande d’adhésion. Toute réticence, fausse déclaration, omission et/ou déclaration inexacte pourrait entrainer les sanctions prévues, selon les cas aux articles L113.8 ou L113.9 du Code des Assurances (c’est-à-dire la nullité du contrat ou la déchéance de vos garanties). Aussi précis que soient les informations et les conseils qui vous ont été donnés, il est très important que vous lisiez attentivement les conditions générales (CG) et particulières de votre contrat d’assurance qui vous sont remises.',
  'J’atteste de l’exactitude des informations ci-dessus et je reconnais avoir été informé que celles-ci sont obligatoires. Je certifie sur l’honneur que les éléments figurant sur la présente fiche d’information et de conseil sont exacts et conformes à la réalité. Je m’engage à informer sans délai mon courtier de tout changement de circonstances pouvant modifier les éléments indiqués dans la présente fiche et, le cas échéant, à fournir les nouvelles informations accompagnées des justificatifs appropriés dans un délai de 30 jours à compter de ce changement.',
];

// Section Traitement de l'information du Recueil (page 8), 2 paragraphes
export const RGPD_TEXT = [
  'Les informations recueillies par le Cabinet ENTASIS, en qualité de responsable de traitement, à partir de ce formulaire font l’objet d’un traitement informatique destiné à utiliser vos données pour la passation, pour la gestion (y compris commerciale) et l’exécution du contrat d’assurance. Tout ou partie des données collectées sont également susceptibles d’être utilisées (i) dans le cadre de contentieux éventuel (judiciaire ou arbitral), (ii) pour la lutte contre le blanchiment et le financement du terrorisme (LCBFT), (iii) pour le traitement des réclamations clients, (iv) plus largement afin de permettre au Cabinet ENTASIS de se conformer à une réglementation applicable ou encore (v) pour l’analyse de tout ou partie de vos données vous concernant afin d’améliorer, le cas échéant, le(s) produit(s) d’assurance, d’évaluer votre situation au regard de vos besoins d’assurance. Ces données sont hébergées en France et conservées durant une période maximale correspondant au temps nécessaire aux différentes opérations ci-dessus listées ou pour la durée spécifiquement prévue par la CNIL (normes pour le secteur de l’assurance) ou encore par la loi (prescriptions légales). Tout ou partie des données collectées seront communiquées aux assureurs (quel que soit leur statut juridique), aux courtiers grossistes ou gestionnaires, aux réassureurs, partenaires ou organismes professionnels habilités qui ont besoin d’y avoir accès pour la réalisation de tout ou partie des opérations listées ci-dessus.',
  'Conformément à la loi sur la protection des données personnelles, vous disposez d’un droit d’accès, de modification, de rectification, d’opposition et de suppression et de portabilité des données vous concernant en vous adressant à l’adresse email suivante : contact@entasis-conseil.fr ou à l’adresse postale ci-dessous. Pour toute demande, merci de préciser vos nom, prénom et email et de joindre une copie recto-verso d’un justificatif d’identité en cours de validité. En cas de difficulté en lien avec la gestion de vos données personnelles, vous pouvez adresser une réclamation auprès de la Commission Nationale de l’Informatique et des Libertés (CNIL) par courrier (3 Place de Fontenoy - TSA 80715 - 75334 PARIS CEDEX 07), par téléphone (01 53 73 22 22) ou via le site web : https://www.cnil.fr/fr/cnil-direct',
];

// Structure de réponses vide, utilisée pour initialiser le formulaire
export function emptyReponses() {
  return {
    situation: {
      nom: '',
      prenom: '',
      adresse: '',
      code_postal: '',
      ville: '',
      pays: 'France',
      nationalite: 'France',
      telephone: '',
      email: '',
      situation_matrimoniale: '',
      nb_enfants: '',
      personnes_charge: '',
      date_naissance: '',
      cp_naissance: '',
      ville_naissance: '',
      pays_naissance: 'France',
    },
    professionnel: {
      categorie_insee: '',
      metier: '',
      statut: '',
    },
    reglementaire: {
      pays_fiscalite: 'France',
      numero_fiscal: '',
      us_nationalite: false,
      us_resident: false,
      ppe: false,
      ppe_entourage: false,
      protection_juridique: 'Aucune',
    },
    patrimoine: {
      fin_client: '',
      fin_foyer: '',
      immo_nb: '',
      immo_valeur: '',
      immo_revenus: '',
      immo_foyer: '',
      revenu_client: '',
      revenu_foyer: '',
      tmi: '',
      charges_part: '',
      capacite_epargne: '',
      capacite_endettement: '',
    },
    risque: {
      q1: null,
      q2: null,
      q3: null,
      q4: [],
      q5: null,
      q6: null,
      q7: null,
      q8: null,
      q9: null,
      q10: null,
      q11: null,
      q12: null,
      q13: null,
      q14: null,
    },
    contrat: {
      date_effet: '',
      age_retraite: '',
      fait_a: 'Paris',
    },
    conseil: {
      texte: '',
    },
  };
}
