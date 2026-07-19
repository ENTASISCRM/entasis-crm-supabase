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
// Règles de conformité (ne jamais enfreindre) :
//   - aucune mention de rémunération, commission, honoraires ou frais du cabinet
//   - aucune promesse de rendement ni garantie de performance
//   - une recommandation précise suit toujours une étude personnalisée
//
// Rédaction : registre banque privée, sobre, vouvoiement (rédigés en équipe
// puis harmonisés). À faire relire par la conformité avant usage massif.
// ═══════════════════════════════════════════════════════════════════════════

export const CABINET = 'Entasis Conseil'

// Objet + corps par clé de famille (voir product_families).
export const MAILS_PRODUITS = {
  av: {
    objet: 'Votre PER prépare demain, et vos projets proches ?',
    corps: `Bonjour {prenom},

Votre PER prépare sereinement votre retraite, un horizon de long terme. Restent vos projets à moyen terme, plus proches et parfois imprévus. L'assurance vie vient les accompagner avec souplesse : une épargne disponible à tout moment, et une fiscalité qui s'allège après huit ans de détention. Les deux enveloppes se complètent sans se concurrencer, et leur juste articulation mérite une étude personnalisée de votre situation.

Je vous propose volontiers un court échange, quinze minutes par téléphone ou en rendez-vous.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  scpi: {
    objet: 'Faire travailler vos liquidités sans gestion locative',
    corps: `Bonjour {prenom},

Une réflexion me vient au sujet de votre situation. Vos liquidités disponibles restent aujourd'hui peu employées, tout en alourdissant votre fiscalité. La SCPI apporte une réponse mesurée à ce constat : vous percevez des revenus locatifs, sans aucune contrainte de gestion, la sélection et l'exploitation des immeubles étant entièrement déléguées. La pertinence d'une telle allocation, comme sa juste proportion, relève d'une étude personnalisée de votre patrimoine.

Je vous propose que nous en parlions quinze minutes, par téléphone ou de vive voix.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  structures: {
    objet: 'Entre fonds euro et actions, une voie médiane',
    corps: `Bonjour {prenom},

Votre patrimoine appelle parfois une nuance, entre la prudence du fonds euro et l'exposition des marchés actions. Les produits structurés occupent précisément cet espace intermédiaire : un cadre de fonctionnement défini à l'avance, assorti d'une protection partielle du capital selon des conditions établies. Ils ne remplacent rien, ils complètent, avec mesure. Toute recommandation s'apprécie au regard de votre situation, après une étude personnalisée.

Je vous propose d'en échanger, autour d'un rendez-vous ou d'un appel de quinze minutes.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  private_equity: {
    objet: 'Le Private Equity, une diversification à considérer',
    corps: `Bonjour {prenom},

Notre collaboration se poursuit, et une réflexion me vient pour vous. Le Private Equity permet d'investir dans des entreprises non cotées. Longtemps réservée aux investisseurs institutionnels, cette classe d'actifs s'ouvre aujourd'hui à une clientèle privée. Elle offre une diversification réelle, sur un horizon de long terme. Sa pertinence dépend de votre situation, et une recommandation précise suivra une étude personnalisée.

Prenons quinze minutes ensemble, par téléphone ou de vive voix, pour en parler.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  prevoyance: {
    objet: 'Vos revenus, protégés en cas d\'arrêt de travail',
    corps: `Bonjour {prenom},

Pour un indépendant, un arrêt de travail signifie souvent une perte de revenus immédiate. Une prévoyance Madelin apporte une réponse concrète : elle protège votre train de vie et vient, dans le cadre prévu par la loi, en déduction de votre bénéfice imposable. La formule adaptée dépend de votre situation, qu'une étude personnalisée permettra de préciser.

Pourrions-nous en échanger lors d'un rendez-vous ou d'un appel de quinze minutes ?

Bien à vous,
{conseiller}
{cabinet}`,
  },
  mutuelle: {
    objet: 'Votre couverture santé est-elle à votre mesure ?',
    corps: `Bonjour {prenom},

Votre mutuelle actuelle épouse-t-elle vraiment votre statut ? Souvent, on cotise pour des garanties superflues, et l'on passe à côté d'un levier précieux : la déductibilité Madelin, selon votre situation. Chaque profil mérite une protection ajustée, qu'une étude personnalisée permettrait d'apprécier sereinement, sans aucun engagement.

Seriez-vous disponible pour un échange de quinze minutes, par téléphone ou de vive voix ?

Bien à vous,
{conseiller}
{cabinet}`,
  },
  emprunteur: {
    objet: 'Votre assurance emprunteur mérite un second regard',
    corps: `Bonjour {prenom},

Un crédit immobilier s'accompagne presque toujours d'une assurance souscrite auprès de la banque. Ce contrat, rarement réexaminé, pèse souvent plus lourd qu'il ne le devrait. La déléguer à un autre assureur permet, dans bien des cas, de conserver une protection équivalente pour un budget nettement plus mesuré. L'intérêt réel dépend de votre situation, qu'une étude personnalisée viendra préciser.

Je vous propose d'en échanger quinze minutes, au téléphone ou de vive voix, au moment qui vous conviendra.

Bien à vous,
{conseiller}
{cabinet}`,
  },
  immobilier: {
    objet: 'Votre immobilier, une fiscalité mieux maîtrisée',
    corps: `Bonjour {prenom},

Votre patrimoine gagne à s'appuyer sur des leviers discrets et durables, et la location meublée en fait partie. Bien construite, elle procure des loyers dont l'imposition demeure très contenue, l'amortissement du bien absorbant une large part des revenus taxables. La mécanique est éprouvée, reste à la calibrer selon votre situation, ce qu'une étude personnalisée permettra de préciser.

Puis-je vous proposer un échange de quinze minutes, en rendez-vous ou par téléphone ?

Bien à vous,
{conseiller}
{cabinet}`,
  },
  per: {
    objet: 'Préparer votre retraite tout en allégeant votre impôt',
    corps: `Bonjour {prenom},

Votre niveau d'imposition rend aujourd'hui le Plan d'Épargne Retraite particulièrement opportun. Chaque versement vient diminuer votre revenu imposable dès cette année, tout en constituant un capital pour votre retraite. Ce double effet, fiscal et patrimonial, mérite d'être calibré à votre situation. La recommandation précise découlera d'une étude personnalisée, au plus près de vos objectifs.

Seriez-vous disponible pour un échange de quinze minutes, par téléphone ou de vive voix ?

Bien à vous,
{conseiller}
{cabinet}`,
  },
}

// Mail de demande de recommandation (parrainage), adressé à un client satisfait.
export const MAIL_RECOMMANDATION = {
  objet: 'Votre confiance, notre plus belle recommandation',
  corps: `Bonjour {prenom},

Je tiens d'abord à vous remercier pour votre confiance, elle compte beaucoup. Notre cabinet se développe avant tout par le bouche à oreille, ce sont nos clients qui nous recommandent. Peut-être connaissez-vous un proche, dirigeant, cadre ou profession libérale, pour qui un regard sur son patrimoine serait utile. Chaque situation appelle une étude personnalisée, sans engagement.

Si un nom vous vient à l'esprit, un mot de votre part suffit, et je lui proposerai volontiers un échange de quinze minutes.

Avec toute ma reconnaissance,
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
