// ═══════════════════════════════════════════════════════════════════════════
// MAILS TYPES DE PROPOSITION (Multi-équipement, bouton « Proposer »)
//
// Un mail type par famille de produit, plus un mail de demande de
// recommandation. Le conseiller choisit le produit, le mail se génère,
// il le relit, l ajuste et l envoie depuis sa messagerie.
//
// Placeholders (remplacés à la génération) :
//   {prenom}     prénom du client destinataire
//   {conseiller} nom du conseiller (profile.full_name)
//   {cabinet}    nom du cabinet
//
// Ton : family office, naturel et discret, jamais commercial (demande Louis :
// clients prestigieux, attentifs au ton). Ouverture systématique
// « Bonjour {prenom}, / J'espère que vous allez bien. ».
//
// Conformité (ne jamais enfreindre) :
//   - aucune mention de rémunération, commission, honoraires ou frais du cabinet
//   - aucune promesse de rendement ni garantie de performance
//   - toute suite s appuie sur un échange ou une étude au regard de la situation
// À faire valider par la conformité avant un usage massif.
// ═══════════════════════════════════════════════════════════════════════════

export const CABINET = 'Entasis Conseil'

// Objet + corps par clé de famille (voir product_families).
export const MAILS_PRODUITS = {
  av: {
    objet: 'Une réflexion autour de votre épargne disponible',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Vous détenez déjà un PER et il remplit bien son rôle pour votre retraite.
En marge de celui-ci, une assurance vie offre une épargne qui reste disponible pour vos projets à moyen terme.
Son régime fiscal devient plus favorable une fois passé le cap des huit ans.
C'est un sujet que la maison suit de près et je me tiens prêt à vous en dire un mot s'il retient votre attention.
Rien ne presse et tout se dessinerait au regard de votre situation.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  scpi: {
    objet: 'À propos de vos liquidités peu employées',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Je pensais à vous en revoyant la part de liquidités qui dort un peu sur vos comptes.
Les SCPI permettent d'orienter cette trésorerie vers de l'immobilier professionnel, avec des revenus potentiels versés périodiquement.
La gestion locative est entièrement déléguée, vous n'avez rien à en assumer.
Un pôle dédié suit ces sujets chez nous et sélectionne les supports avec soin.
Si vous souhaitez que nous regardions cela ensemble au regard de vos avoirs, je reste à votre disposition.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  structures: {
    objet: 'Un mot sur les produits structurés',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Entre la tranquillité du fonds euro et une exposition pleine aux actions, il existe un espace intermédiaire.
Les produits structurés reposent sur un cadre défini à l'avance, avec une protection partielle du capital selon les conditions retenues.
C'est une mécanique que nous étudions régulièrement pour les familles que nous accompagnons.
Je serais heureux de vous en exposer le fonctionnement si le sujet vous intéresse.
Toute mise en place s'appuierait sur une lecture attentive de votre situation.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  private_equity: {
    objet: 'Le non coté parmi vos actifs',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Je souhaitais partager avec vous une réflexion autour du private equity.
Il s'agit d'investir dans des entreprises non cotées, ce qui offre une diversification sur un horizon long.
Longtemps réservée aux grands institutionnels, cette classe d'actifs devient accessible dans un cadre choisi.
C'est un terrain que la maison connaît et sur lequel elle avance avec prudence.
Nous pourrons en parler tranquillement quand cela vous conviendra, au regard de vos autres placements.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  prevoyance: {
    objet: 'Votre protection en cas d\'arrêt de travail',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

En tant qu'indépendant, votre activité repose beaucoup sur votre présence au quotidien.
La prévoyance vient protéger vos revenus et vos proches si un arrêt de travail venait à survenir.
Le cadre Madelin permet en outre de déduire cet effort de votre bénéfice imposable.
C'est le type de sujet que nous aimons regarder posément avec ceux que nous suivons.
Si vous le souhaitez, nous ferons le point ensemble sur votre couverture actuelle.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  mutuelle: {
    objet: 'Un regard sur votre mutuelle santé',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Il m'arrive de constater que les contrats de mutuelle comportent des garanties dont on ne se sert jamais.
L'idée serait d'ajuster votre couverture à votre statut réel et d'écarter celles devenues superflues.
Selon votre situation, le cadre Madelin peut par ailleurs ouvrir droit à une déductibilité.
Nous prenons le temps de regarder ces contrats dans le détail pour les familles que nous accompagnons.
Je reste disponible pour en faire une lecture ensemble si vous le jugez utile.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  emprunteur: {
    objet: 'Votre assurance de prêt rarement revue',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

L'assurance adossée à votre prêt immobilier est souvent celle proposée par la banque, et on la réexamine rarement.
La déléguer vers un autre contrat permet souvent de conserver une protection équivalente pour un budget plus mesuré.
La démarche est simple et bien encadrée.
C'est une vérification que nous menons volontiers pour les personnes que nous suivons.
Dites-moi si vous souhaitez que je regarde votre contrat actuel de plus près.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  immobilier: {
    objet: 'La location meublée et sa fiscalité',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

Je pensais à vous à propos de l'immobilier locatif meublé.
Ce cadre a la particularité de maintenir l'imposition des loyers à un niveau contenu, grâce à l'amortissement du bien.
C'est une pièce qui trouve souvent sa place dans un patrimoine déjà construit.
La maison étudie ces montages avec soin, du choix du bien à sa structuration.
Nous pourrons en discuter au regard de vos revenus et de vos objectifs quand vous le voudrez.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  per: {
    objet: 'Une réflexion fiscale de fin d\'année',
    corps: `Bonjour {prenom},
J'espère que vous allez bien.

À l'approche de la clôture de l'année, je repensais à votre situation fiscale.
Un versement sur un PER permet de diminuer votre revenu imposable dès cette année, tout en constituant un capital pour votre retraite.
L'effort se calibre précisément selon votre tranche et vos objectifs.
C'est un exercice que nous menons chaque année avec les familles que nous accompagnons.
Si vous le souhaitez, nous déterminerons ensemble le montant le plus juste pour vous.

Bien à vous,
{conseiller}
{cabinet}`,
  },
}

// Mail de demande de recommandation (parrainage), adressé à un client satisfait.
export const MAIL_RECOMMANDATION = {
  objet: 'Un mot de gratitude',
  corps: `Bonjour {prenom},
J'espère que vous allez bien.

Je voulais avant tout vous remercier pour la confiance que vous nous accordez, elle compte beaucoup.
Notre maison a la particularité de se développer presque uniquement par la recommandation de ceux qu'elle accompagne.
Peut-être avez-vous autour de vous un proche qui gagnerait à être accompagné comme vous l'êtes.
Si un nom vous vient, je serai heureux d'en échanger, sans le moindre engagement de votre part.
Et si ce n'est pas le cas, votre confiance nous honore déjà pleinement.

Bien à vous,
{conseiller}
{cabinet}`,
}

function remplir(tpl, ctx) {
  const prenom = (ctx.prenom || '').trim()
  return String(tpl || '')
    .replace(/\{prenom\}/g, prenom)
    .replace(/\{conseiller\}/g, ctx.conseiller || 'Votre conseiller Entasis')
    .replace(/\{cabinet\}/g, ctx.cabinet || CABINET)
    .replace(/Bonjour ,/g, 'Bonjour,') // prénom manquant : greeting propre
}

// Renvoie { objet, corps } prêts à l emploi pour une famille, ou null.
export function genererMail(famille, ctx = {}) {
  const t = MAILS_PRODUITS[famille]
  if (!t) return null
  return { objet: remplir(t.objet, ctx), corps: remplir(t.corps, ctx) }
}

// Renvoie { objet, corps } du mail de demande de recommandation.
export function genererRecommandation(ctx = {}) {
  return { objet: remplir(MAIL_RECOMMANDATION.objet, ctx), corps: remplir(MAIL_RECOMMANDATION.corps, ctx) }
}
