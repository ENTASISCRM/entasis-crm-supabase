// src/lib/pnl-calculs.js
// Mise en forme des chiffres deja calcules par le serveur. AUCUN taux, AUCUN
// parametre de cout ici : ce module ne sait pas calculer une commission, il
// sait seulement additionner et presenter ce que api/pnl.js lui donne.
// Isole du composant pour etre testable : ces totaux sont ceux que Louis
// lira, une erreur de somme lui ferait prendre une mauvaise decision.

export const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// Les gerants sont sur leur propre ligne : leur remuneration n est pas un
// cout d equipe, c est ce que les associes prennent sur le resultat.
export const estGerant = (l) => l?.est_gerant === true
  || (l?.type_contrat || '').toUpperCase() === 'GERANT'

// Un mandataire n a pas de contrat salarie : son seul cout est la
// retrocession qu on lui verse, plus sa part de structure.
export const estMandataire = (l) => (l?.type_contrat || '').toUpperCase() === 'MANDATAIRE'

export const equipe = (lignes) => (lignes || []).filter((l) => !estGerant(l))
export const associes = (lignes) => (lignes || []).filter(estGerant)
export const salaries = (lignes) => equipe(lignes).filter((l) => !estMandataire(l))
export const mandataires = (lignes) => equipe(lignes).filter(estMandataire)

const somme = (l, cle) => (l || []).reduce((s, x) => s + Number(x[cle] || 0), 0)

export function totaux(lignes) {
  const l = lignes || []
  const encaisse = somme(l, 'commission_encaissee')
  const cout = somme(l, 'cout_total')
  return {
    encaisse,
    attendu: somme(l, 'commission_attendue'),
    cout,
    salaires: somme(l, 'cout_fixe'),
    retrocessions: somme(l, 'cout_retrocession'),
    structure: somme(l, 'cout_frais_fixes'),
    autres: somme(l, 'cout_annexe') + somme(l, 'cout_outils'),
    aides: somme(l, 'aide_percue'),
    marge: encaisse - cout,
    // Ratio de couverture : combien d euros encaisses pour un euro depense.
    // Au dela de 1, le cabinet gagne de l argent sur la personne.
    ratio: cout > 0 ? encaisse / cout : null,
    contrats: somme(l, 'contrats_signes'),
    clients: somme(l, 'clients_uniques'),
    personnes: l.length,
    enPerte: l.filter((x) => Number(x.marge || 0) < 0).length,
  }
}

// Le compte de resultat du cabinet, en lignes que Louis peut retrouver une par
// une dans le grand livre. La structure est prise POUR SON MONTANT ANNUEL
// COMPLET, jamais pour la somme des parts imputees : un bureau vide se paye
// quand meme. C est ce qui garantit que l interrupteur de repartition change
// la vue par personne sans jamais changer le resultat du cabinet.
export function compteDeResultat(lignes, structureAnnuelle = 0, encaisseCabinet = null) {
  const tous = lignes || []
  const eq = equipe(tous)
  const asso = associes(tous)
  const structure = Number(structureAnnuelle || 0)
  const structureAllouee = somme(eq, 'cout_frais_fixes')

  // La recette du cabinet vient des releves bancaires quand on les a : la
  // somme des lignes par personne ne porte que ce qui a pu etre attribue a
  // quelqu un, et laisserait de cote tout ce qui ne l est pas.
  const encaisseAttribue = somme(tous, 'commission_encaissee')
  const encaisse = encaisseCabinet != null ? Number(encaisseCabinet) : encaisseAttribue
  const retrocessions = somme(tous, 'cout_retrocession')
  const salairesCharges = somme(eq, 'cout_fixe')
  const autresEquipe = somme(eq, 'cout_annexe') + somme(eq, 'cout_outils')
  const remunerationAssocies = somme(asso, 'cout_annexe') + somme(asso, 'cout_fixe')
  // Les aides percues viennent en DEDUCTION du cout, jamais en recette.
  const aides = somme(tous, 'aide_percue')

  return {
    encaisse,
    encaisseAttribue,
    // Ce que le cabinet a encaisse sans pouvoir le rattacher a une personne.
    encaisseNonAttribue: Math.max(0, encaisse - encaisseAttribue),
    attendu: somme(tous, 'commission_attendue'),
    retrocessions,
    salairesCharges,
    autresEquipe,
    aides,
    structure,
    structureAllouee,
    // Ce que personne ne porte : des mois de bureau, d outils et de loyer non
    // absorbes parce que les postes n ont pas ete occupes toute l annee.
    structureNonAbsorbee: structure - structureAllouee,
    remunerationAssocies,
    resultat: encaisse - retrocessions - salairesCharges - autresEquipe
      - structure - remunerationAssocies + aides,
  }
}

// La recette mensuelle reellement constatee. On ne divise QUE par les mois qui
// portent quelque chose : diviser par douze au mois de mars ferait croire que
// le cabinet encaisse trois fois moins qu il n encaisse.
export function recetteMensuelleMoyenne(parMois) {
  const avecRecette = (parMois || []).filter((m) => Number(m.commission || 0) > 0)
  if (!avecRecette.length) return null
  const total = avecRecette.reduce((s, m) => s + Number(m.commission || 0), 0)
  return { moyenne: total / avecRecette.length, moisComptes: avecRecette.length, total }
}

// La question utile n est pas « combien ca coute » mais « combien il manque
// chaque mois ». Un nombre negatif veut dire que le cabinet couvre ses couts.
export function ceQuiManque(coutMensuelComplet, recetteMensuelle) {
  const cout = Number(coutMensuelComplet || 0)
  if (!(cout > 0)) return null
  const recette = Number(recetteMensuelle || 0)
  return {
    cout,
    recette,
    manque: cout - recette,
    couvert: recette >= cout,
    ratio: cout > 0 ? recette / cout : null,
  }
}

// Les charges fixes regroupees par categorie, la plus lourde en premier, avec
// ce qui attend un arbitrage. Un total agrege que personne ne peut ouvrir
// redevient une hypothese au bout de trois mois.
export function chargesParCategorie(charges) {
  const actives = (charges || []).filter((c) => c.actif !== false)
  const parCat = new Map()
  for (const c of actives) {
    const cat = c.categorie || 'AUTRE'
    const e = parCat.get(cat) || { categorie: cat, montant: 0, postes: 0, aArbitrer: 0 }
    e.montant += Number(c.montant_mensuel || 0)
    e.postes += 1
    if (c.a_arbitrer) e.aArbitrer += Number(c.montant_mensuel || 0)
    parCat.set(cat, e)
  }
  return [...parCat.values()].sort((a, b) => b.montant - a.montant)
}

export const aArbitrer = (charges) => (charges || [])
  .filter((c) => c.actif !== false && c.a_arbitrer)
  .sort((a, b) => Number(b.montant_mensuel || 0) - Number(a.montant_mensuel || 0))

export const nonEngage = (charges) => (charges || [])
  .filter((c) => c.actif === false)
  .sort((a, b) => Number(b.montant_mensuel || 0) - Number(a.montant_mensuel || 0))

// Le mois ou le cumul des commissions passe devant le cumul des couts. Le
// cout annuel est reparti sur les mois de l annee, faute d un cout mensuel
// reel : c est une approximation, l ecran doit le dire.
export function pointDeBascule(parMois, coutAnnuel) {
  if (!parMois?.length || !(coutAnnuel > 0)) return null
  const coutMensuel = coutAnnuel / 12
  let cumulCom = 0
  for (const m of parMois) {
    cumulCom += Number(m.commission || 0)
    if (cumulCom >= coutMensuel * m.mois) return m.mois
  }
  return null
}

export function cumulerParMois(parMois, coutAnnuel) {
  const coutMensuel = (coutAnnuel || 0) / 12
  let cumulCom = 0
  return (parMois || []).map((m) => {
    cumulCom += Number(m.commission || 0)
    return {
      ...m,
      coutMois: coutMensuel,
      margeMois: Number(m.commission || 0) - coutMensuel,
      cumulCommission: cumulCom,
      cumulCout: coutMensuel * m.mois,
      cumulMarge: cumulCom - coutMensuel * m.mois,
    }
  })
}

export const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

export const fmtRatio = (r) => (r == null ? 'sans objet' : `${r.toFixed(2)} pour 1`)

export const fmtMois = (v) => {
  const n = Number(v || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

// ─── Pilotage ─────────────────────────────────────────────────────────────
// Une seule question : ou j en suis de mon objectif de resultat, et ce qu il
// faut encaisser chaque mois pour l atteindre.
//
// Les mois passes sont du realise, les mois a venir sont du cout deja engage
// face a une recette encore a faire. On ne melange jamais les deux.
export function pilotage(moisAnnee, objectif = 0) {
  const mois = moisAnnee || []
  const passes = mois.filter((m) => m.est_passe)
  const aVenir = mois.filter((m) => !m.est_passe)

  const realise = passes.length ? Number(passes[passes.length - 1].cumul_resultat || 0) : 0
  const recettePassee = passes.reduce((s, m) => s + Number(m.recette || 0), 0)
  const coutPasse = passes.reduce((s, m) => s + Number(m.cout_total || 0), 0)
  // On ne divise que par les mois qui portent une recette : un mois sans
  // donnee tirerait la moyenne vers le bas et ferait croire a un decrochage.
  const moisAvecRecette = passes.filter((m) => Number(m.recette || 0) > 0).length
  const moyenneRecette = moisAvecRecette ? recettePassee / moisAvecRecette : 0

  const coutAVenir = aVenir.reduce((s, m) => s + Number(m.cout_total || 0), 0)
  const resteAFaire = Number(objectif || 0) - realise
  const recetteNecessaire = coutAVenir + resteAFaire
  const parMoisNecessaire = aVenir.length ? recetteNecessaire / aVenir.length : null
  const projection = realise + moyenneRecette * aVenir.length - coutAVenir

  return {
    objectif: Number(objectif || 0),
    realise,
    recettePassee,
    coutPasse,
    moisPasses: passes.length,
    moisRestants: aVenir.length,
    moyenneRecette,
    coutAVenir,
    resteAFaire,
    recetteNecessaire,
    parMoisNecessaire,
    projection,
    // Au rythme actuel, l objectif est il tenu ?
    enAvance: parMoisNecessaire != null && moyenneRecette >= parMoisNecessaire,
    atteint: objectif > 0 && realise >= Number(objectif),
    avancement: objectif > 0 ? realise / Number(objectif) : null,
  }
}
