// Attestation interne de l’Academy. jsPDF ne se teste pas ici (import
// dynamique au clic) ; on verrouille la formulation du corps, qui est la
// seule source du texte imprime, la date lue a Paris, le nom du fichier, et
// l’absence de toute mention de remuneration.

import { describe, it, expect } from 'vitest'
import {
  texteAttestation, libelleScore, jourParis, dateFichier, nomFichierAttestation,
  slugModule, ascii, MENTION_INTERNE,
} from './attestation-pdf'

const DONNEES = {
  numero: 'ACA-2026-0042',
  delivreeLe: '2026-09-21T14:05:00+02:00',
  nomCollaborateur: 'Camille Exemple',
  titreModule: 'Le PER individuel, du recueil à la souscription',
  competence: 'Expliquer la fiscalité à l\'entrée et à la sortie d\'un PER',
  score: 4,
  total: 5,
  reluPar: 'Paul Relecteur',
}

describe('texteAttestation', () => {
  it('ecrit le corps complet dans l’ordre : atteste, competence, score, date, numero, relecteur', () => {
    expect(texteAttestation(DONNEES)).toEqual([
      'Entasis Conseil atteste que Camille Exemple a suivi et validé le module de formation interne « Le PER individuel, du recueil à la souscription ».',
      'Compétence travaillée : Expliquer la fiscalité à l\'entrée et à la sortie d\'un PER.',
      'Quiz de validation : 4 bonnes réponses sur 5.',
      'Validé le 21 septembre 2026.',
      'Attestation n° ACA-2026-0042.',
      'Contenu relu par Paul Relecteur.',
    ])
  })

  it('retire les lignes des donnees absentes et accorde le score au singulier', () => {
    const lignes = texteAttestation({ nomCollaborateur: 'Camille Exemple', titreModule: 'Assurance vie', score: 1, total: 5, delivreeLe: '2026-01-05' })
    expect(lignes).toEqual([
      'Entasis Conseil atteste que Camille Exemple a suivi et validé le module de formation interne « Assurance vie ».',
      'Quiz de validation : 1 bonne réponse sur 5.',
      'Validé le 5 janvier 2026.',
    ])
    expect(lignes.join(' ')).not.toContain('undefined')
    // Sans aucune donnee : une seule ligne, lisible, jamais de trou.
    expect(texteAttestation({})).toEqual([
      'Entasis Conseil atteste que Collaborateur non renseigné a suivi et validé le module de formation interne « Module non renseigné ».',
    ])
  })

  it('ne parle jamais de remuneration, et la mention interne dit ce que le document n’est pas', () => {
    const tout = [...texteAttestation(DONNEES), MENTION_INTERNE].join(' ')
    expect(tout).not.toMatch(/r[ée]mun[ée]ration|commission|marge|honoraires/i)
    expect(MENTION_INTERNE).toMatch(/^Document interne à Entasis Conseil\./)
    expect(MENTION_INTERNE).toMatch(/ni une certification réglementaire ni un justificatif d.heures de formation DDA\.$/)
  })
})

describe('dates, score, fichier', () => {
  it('lit la date a Paris, jamais par decoupage de la chaine', () => {
    // 23h30 UTC le 21, c’est deja le 22 a Paris.
    expect(jourParis('2026-09-21T23:30:00Z')).toBe('22 septembre 2026')
    expect(dateFichier('2026-09-21T23:30:00Z')).toBe('2026-09-22')
    expect(jourParis('2026-12-24')).toBe('24 décembre 2026')
    expect(jourParis('pas une date')).toBe('')
    expect(dateFichier(null)).toBe('sans-date')
  })

  it('accorde le score et se tait sans total', () => {
    expect(libelleScore(4, 5)).toBe('4 bonnes réponses sur 5')
    expect(libelleScore(1, 5)).toBe('1 bonne réponse sur 5')
    expect(libelleScore(0, 5)).toBe('0 bonne réponse sur 5')
    expect(libelleScore(3, 0)).toBe('')
    expect(libelleScore(undefined, 5)).toBe('')
  })

  it('nomme le fichier avec le slug du module et la date de delivrance', () => {
    expect(nomFichierAttestation(DONNEES)).toBe('Entasis-attestation-le-per-individuel-du-recueil-a-la-souscription-2026-09-21.pdf')
    expect(nomFichierAttestation({ slug: 'per-individuel', titreModule: 'Ignoré', delivreeLe: '2026-09-21' })).toBe('Entasis-attestation-per-individuel-2026-09-21.pdf')
    expect(slugModule('')).toBe('module')
  })

  it('ramene les signes typographiques dans WinAnsi sans toucher aux accents', () => {
    expect(ascii('L’attestation · « validée » — enfin…')).toBe('L\'attestation - « validée » - enfin...')
    expect(ascii('4 bonnes réponses sur 5')).toBe('4 bonnes réponses sur 5')
    expect(ascii(null)).toBe('')
  })
})
