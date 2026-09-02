// src/lib/doublons.js
// Regles de decision de l'ecran Doublons clients, isolees du composant pour
// etre testables : c'est ce code qui choisit quelle fiche survit a une fusion,
// et qui annonce au conseiller ce qu'il deplace. Une erreur ici ferait perdre
// des contrats.

export const nomComplet = (f) => `${f.prenom || ''} ${f.nom || ''}`.trim() || 'Sans nom'

export const dateFr = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

// Ce que porte une fiche, tous rattachements confondus. Sert à proposer la
// fiche à garder et à dire au conseiller ce qu'il déplace.
export const poids = (f) =>
  Number(f.nb_dossiers || 0) + Number(f.nb_contrats || 0)
  + Number(f.nb_documents || 0) + Number(f.nb_echanges || 0)

export const RATTACHEMENTS = [
  { cle: 'nb_dossiers', un: 'dossier', plusieurs: 'dossiers' },
  { cle: 'nb_contrats', un: 'contrat', plusieurs: 'contrats' },
  { cle: 'nb_documents', un: 'document', plusieurs: 'documents' },
  { cle: 'nb_echanges', un: 'échange', plusieurs: 'échanges' },
]

export const resume = (f) => {
  const parts = RATTACHEMENTS
    .map(({ cle, un, plusieurs }) => {
      const n = Number(f[cle] || 0)
      return n > 0 ? `${n} ${n > 1 ? plusieurs : un}` : null
    })
    .filter(Boolean)
  return parts.length ? parts.join(', ') : 'fiche vide'
}

// La fiche gardée par défaut : celle qui porte le plus, et à égalité la plus
// ancienne (c'est en général l'originale, celle que les collègues connaissent).
export const meilleureFiche = (fiches) =>
  [...fiches].sort((a, b) => poids(b) - poids(a)
    || new Date(a.created_at) - new Date(b.created_at))[0]
