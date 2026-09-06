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
    autres: somme(l, 'cout_ecole') + somme(l, 'cout_outils'),
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
export function compteDeResultat(lignes, structureAnnuelle = 0) {
  const tous = lignes || []
  const eq = equipe(tous)
  const asso = associes(tous)
  const structure = Number(structureAnnuelle || 0)
  const structureAllouee = somme(eq, 'cout_frais_fixes')

  const encaisse = somme(tous, 'commission_encaissee')
  const retrocessions = somme(tous, 'cout_retrocession')
  const salairesCharges = somme(eq, 'cout_fixe')
  const autresEquipe = somme(eq, 'cout_ecole') + somme(eq, 'cout_outils')
  const remunerationAssocies = somme(asso, 'cout_ecole') + somme(asso, 'cout_fixe')

  return {
    encaisse,
    attendu: somme(tous, 'commission_attendue'),
    retrocessions,
    salairesCharges,
    autresEquipe,
    structure,
    structureAllouee,
    // Ce que personne ne porte : des mois de bureau, d outils et de loyer non
    // absorbes parce que les postes n ont pas ete occupes toute l annee.
    structureNonAbsorbee: structure - structureAllouee,
    remunerationAssocies,
    resultat: encaisse - retrocessions - salairesCharges - autresEquipe
      - structure - remunerationAssocies,
  }
}

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
