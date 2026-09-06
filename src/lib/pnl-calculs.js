// src/lib/pnl-calculs.js
// Mise en forme des chiffres deja calcules par le serveur. AUCUN taux, AUCUN
// parametre de cout ici : ce module ne sait pas calculer une commission, il
// sait seulement additionner et presenter ce que api/pnl.js lui donne.
// Isole du composant pour etre testable : ces totaux sont ceux que Louis
// lira, une erreur de somme lui ferait prendre une mauvaise decision.

export const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// Un mandataire n a pas de contrat salarie : le serveur lui pose le type
// MANDATAIRE et un cout nul. C est ce qui separe les deux vues.
export const estMandataire = (l) => (l.type_contrat || '').toUpperCase() === 'MANDATAIRE'

export const salaries = (lignes) => (lignes || []).filter((l) => !estMandataire(l))
export const mandataires = (lignes) => (lignes || []).filter(estMandataire)

const somme = (l, cle) => (l || []).reduce((s, x) => s + Number(x[cle] || 0), 0)

export function totaux(lignes) {
  const l = lignes || []
  const commission = somme(l, 'commission_encaissee')
  const cout = somme(l, 'cout_total')
  return {
    commission,
    cout,
    marge: commission - cout,
    // Ratio de couverture : combien d euros encaisses pour un euro depense.
    // Au dela de 1, le cabinet gagne de l argent sur la personne.
    ratio: cout > 0 ? commission / cout : null,
    contrats: somme(l, 'contrats_signes'),
    clients: somme(l, 'clients_uniques'),
    personnes: l.length,
    enPerte: l.filter((x) => Number(x.marge || 0) < 0).length,
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

export const fmtRatio = (r) => (r == null ? '—' : `${r.toFixed(2)} pour 1`)
