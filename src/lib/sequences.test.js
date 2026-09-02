import { describe, it, expect } from 'vitest'
import {
  ajouterJours, gabaritDe, demarrerSequence, patchApresFait, etapesDe,
  arreterSequence, messageApresFait,
} from './sequences'
import { SEQUENCES, SEQUENCES_LISTE } from '../config/sequencesRelance'
import { normalizeDeal } from './ui-shared'

const TODAY = '2026-08-28'
const CLOTURE = { next_action: null, next_action_date: null, sequence_key: null, sequence_etape: null }
const deal = (o) => ({ id: 'd1', status: 'En cours', advisor_code: 'DEMO', ...o })

describe('gabarits (config/sequencesRelance)', () => {
  it('expose trois gabarits complets, chacun sous sa clé', () => {
    expect(Object.keys(SEQUENCES).sort()).toEqual(['apres_rdv', 'pieces_manquantes', 'relance_devis'])
    for (const [cle, g] of Object.entries(SEQUENCES)) {
      expect(g.cle).toBe(cle)
      expect(g.libelle).toBeTruthy()
      expect(g.description).toBeTruthy()
      expect(g.etapes.length).toBeGreaterThan(0)
      for (const e of g.etapes) {
        expect(Number.isInteger(e.delaiJours) && e.delaiJours > 0).toBe(true)
        expect(e.action).toBeTruthy()
      }
    }
  })
  it('la liste ordonnée couvre tous les gabarits, sans doublon', () => {
    expect(SEQUENCES_LISTE.map((g) => g.cle).sort()).toEqual(Object.keys(SEQUENCES).sort())
  })
  it('porte les délais convenus : J+2/7/15, J+1/5/12, J+3/10/20', () => {
    expect(SEQUENCES.relance_devis.etapes.map((e) => e.delaiJours)).toEqual([2, 7, 15])
    expect(SEQUENCES.apres_rdv.etapes.map((e) => e.delaiJours)).toEqual([1, 5, 12])
    expect(SEQUENCES.pieces_manquantes.etapes.map((e) => e.delaiJours)).toEqual([3, 10, 20])
  })
})

describe('ajouterJours', () => {
  it('franchit les fins de mois et d’année', () => {
    expect(ajouterJours('2026-08-30', 2)).toBe('2026-09-01')
    expect(ajouterJours('2026-12-25', 15)).toBe('2027-01-09')
  })
  it('connaît le 29 février', () => {
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29')
    expect(ajouterJours('2027-02-28', 1)).toBe('2027-03-01')
  })
  it('accepte un horodatage et ne garde que le jour', () => {
    expect(ajouterJours('2026-08-28T10:30:00+00:00', 1)).toBe('2026-08-29')
  })
})

describe('gabaritDe', () => {
  it('rend le gabarit d’une clé connue, null sinon', () => {
    expect(gabaritDe('relance_devis')).toBe(SEQUENCES.relance_devis)
    expect(gabaritDe('inconnu')).toBeNull()
    expect(gabaritDe('')).toBeNull()
    expect(gabaritDe(null)).toBeNull()
    expect(gabaritDe(undefined)).toBeNull()
  })
  it('ignore les propriétés héritées d’Object', () => {
    expect(gabaritDe('toString')).toBeNull()
    expect(gabaritDe('constructor')).toBeNull()
  })
})

describe('demarrerSequence', () => {
  it('pose l’étape 1 datée depuis aujourd’hui', () => {
    expect(demarrerSequence('relance_devis', TODAY)).toEqual({
      sequence_key: 'relance_devis',
      sequence_etape: 1,
      next_action: 'Appel de suivi du devis',
      next_action_date: '2026-08-30',
    })
  })
  it('chaque gabarit démarre sur sa première étape', () => {
    expect(demarrerSequence('apres_rdv', TODAY)).toMatchObject({ sequence_etape: 1, next_action_date: '2026-08-29' })
    expect(demarrerSequence('pieces_manquantes', TODAY)).toMatchObject({ sequence_etape: 1, next_action_date: '2026-08-31' })
  })
  it('franchit un changement de mois au démarrage', () => {
    expect(demarrerSequence('relance_devis', '2026-08-30').next_action_date).toBe('2026-09-01')
    expect(demarrerSequence('pieces_manquantes', '2026-12-30').next_action_date).toBe('2027-01-02')
  })
  it('rend null pour un gabarit inconnu ou une clé vide (rien à écrire)', () => {
    expect(demarrerSequence('inconnu', TODAY)).toBeNull()
    expect(demarrerSequence('', TODAY)).toBeNull()
    expect(demarrerSequence(undefined, TODAY)).toBeNull()
  })
})

describe('patchApresFait', () => {
  it('arme l’étape 2 au bon délai, sans toucher à la clé', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 1, next_action: 'Appel de suivi du devis', next_action_date: '2026-08-28' })
    expect(patchApresFait(d, TODAY)).toEqual({
      sequence_etape: 2,
      next_action: 'Email de relance du devis',
      next_action_date: '2026-09-04',
    })
  })
  it('arme l’étape 3 depuis aujourd’hui, avec passage au mois suivant', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 2, next_action_date: '2026-08-28' })
    expect(patchApresFait(d, TODAY)).toEqual({
      sequence_etape: 3,
      next_action: 'Dernier contact avant clôture',
      next_action_date: '2026-09-12',
    })
  })
  it('compte depuis aujourd’hui, jamais depuis l’échéance dépassée', () => {
    // Action faite avec huit jours de retard : l’email se cale à J+7 de ce
    // jour, pas dans le passé.
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 1, next_action_date: '2026-08-20' })
    expect(patchApresFait(d, TODAY).next_action_date).toBe('2026-09-04')
  })
  it('clôt tout à la dernière étape', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 3, next_action_date: '2026-08-28' })
    expect(patchApresFait(d, TODAY)).toEqual(CLOTURE)
  })
  it('enchaîne chaque gabarit du démarrage à la clôture', () => {
    for (const g of SEQUENCES_LISTE) {
      let d = deal({ ...demarrerSequence(g.cle, TODAY) })
      let jour = TODAY
      for (let i = 1; i < g.etapes.length; i++) {
        jour = d.next_action_date
        const p = patchApresFait(d, jour)
        expect(p.sequence_etape).toBe(i + 1)
        expect(p.next_action).toBe(g.etapes[i].action)
        expect(p.next_action_date).toBe(ajouterJours(jour, g.etapes[i].delaiJours))
        d = { ...d, ...p }
      }
      expect(patchApresFait(d, d.next_action_date)).toEqual(CLOTURE)
    }
  })
  it('un dossier sans séquence se vide comme avant', () => {
    expect(patchApresFait(deal({ next_action: 'rappeler', next_action_date: '2026-08-28' }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(deal({ sequence_key: null, sequence_etape: null }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(null, TODAY)).toEqual(CLOTURE)
  })
  it('une clé inconnue ou une étape aberrante clôturent, jamais de séquence fantôme', () => {
    expect(patchApresFait(deal({ sequence_key: 'inconnu', sequence_etape: 1 }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(deal({ sequence_key: 'relance_devis', sequence_etape: 0 }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(deal({ sequence_key: 'relance_devis', sequence_etape: 9 }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(deal({ sequence_key: 'relance_devis', sequence_etape: 'abc' }), TODAY)).toEqual(CLOTURE)
    expect(patchApresFait(deal({ sequence_key: 'relance_devis', sequence_etape: null }), TODAY)).toEqual(CLOTURE)
  })
  it('accepte un numéro d’étape arrivé en chaîne depuis un formulaire', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: '1', next_action_date: '2026-08-28' })
    expect(patchApresFait(d, TODAY).sequence_etape).toBe(2)
  })
})

describe('arreterSequence', () => {
  it('rend le patch de clôture, un objet neuf à chaque appel', () => {
    const a = arreterSequence()
    const b = arreterSequence()
    expect(a).toEqual(CLOTURE)
    expect(a).not.toBe(b)
  })
})

describe('etapesDe', () => {
  it('liste vide sans séquence ou avec une clé inconnue', () => {
    expect(etapesDe(deal({}), TODAY)).toEqual([])
    expect(etapesDe(deal({ sequence_key: 'inconnu', sequence_etape: 1 }), TODAY)).toEqual([])
    expect(etapesDe(null, TODAY)).toEqual([])
  })
  it('au démarrage : l’étape 1 en cours, les suivantes prévues de proche en proche', () => {
    const d = deal({ ...demarrerSequence('relance_devis', TODAY) })
    expect(etapesDe(d, TODAY)).toEqual([
      { numero: 1, delaiJours: 2, action: 'Appel de suivi du devis', etat: 'en_cours', date: '2026-08-30' },
      { numero: 2, delaiJours: 7, action: 'Email de relance du devis', etat: 'a_venir', date: '2026-09-06' },
      { numero: 3, delaiJours: 15, action: 'Dernier contact avant clôture', etat: 'a_venir', date: '2026-09-21' },
    ])
  })
  it('à l’étape 2 : la première faite, la deuxième posée, la troisième prévue', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 2, next_action_date: '2026-09-04' })
    const etapes = etapesDe(d, TODAY)
    expect(etapes.map((e) => e.etat)).toEqual(['faite', 'en_cours', 'a_venir'])
    expect(etapes[0].date).toBeNull()
    expect(etapes[1].date).toBe('2026-09-04')
    expect(etapes[2].date).toBe('2026-09-19')
  })
  it('une étape en retard projette les suivantes depuis aujourd’hui', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 1, next_action_date: '2026-08-20' })
    const etapes = etapesDe(d, TODAY)
    expect(etapes[0]).toMatchObject({ etat: 'en_cours', date: '2026-08-20' })
    expect(etapes[1].date).toBe('2026-09-04')
    expect(etapes[2].date).toBe('2026-09-19')
  })
  it('à la dernière étape, tout ce qui précède est fait', () => {
    const d = deal({ sequence_key: 'apres_rdv', sequence_etape: 3, next_action_date: '2026-09-10' })
    expect(etapesDe(d, TODAY).map((e) => e.etat)).toEqual(['faite', 'faite', 'en_cours'])
  })
  it('tolère une date de prochaine action effacée à la main', () => {
    const d = deal({ sequence_key: 'apres_rdv', sequence_etape: 1, next_action_date: null })
    const etapes = etapesDe(d, TODAY)
    expect(etapes[0]).toMatchObject({ etat: 'en_cours', date: null })
    expect(etapes[1].date).toBe('2026-09-02')
  })
  it('accepte un horodatage en next_action_date', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 1, next_action_date: '2026-08-30T00:00:00+00:00' })
    expect(etapesDe(d, TODAY)[0].date).toBe('2026-08-30')
  })
})

describe('messageApresFait', () => {
  it('annonce l’étape armée avec sa date courte', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 1 })
    expect(messageApresFait(d, patchApresFait(d, TODAY))).toBe('Étape 2 sur 3 armée pour le 04/09')
  })
  it('annonce la fin de séquence à la dernière étape', () => {
    const d = deal({ sequence_key: 'relance_devis', sequence_etape: 3 })
    expect(messageApresFait(d, patchApresFait(d, TODAY))).toBe('Séquence terminée')
  })
  it('rend null sans séquence : l’appelant garde son message habituel', () => {
    const d = deal({ next_action: 'rappeler' })
    expect(messageApresFait(d, patchApresFait(d, TODAY))).toBeNull()
    expect(messageApresFait(null, CLOTURE)).toBeNull()
  })
})

describe('normalizeDeal : colonnes de séquence (B2)', () => {
  it('convertit les valeurs vides en null pour la base', () => {
    const d = normalizeDeal({ sequence_key: '', sequence_etape: '' })
    expect(d.sequence_key).toBeNull()
    expect(d.sequence_etape).toBeNull()
  })
  it('rend un entier pour sequence_etape et une clé propre', () => {
    const d = normalizeDeal({ sequence_key: ' relance_devis ', sequence_etape: '2' })
    expect(d.sequence_key).toBe('relance_devis')
    expect(d.sequence_etape).toBe(2)
  })
  it('n’injecte pas les champs absents (pas d’effacement en sauvegarde partielle)', () => {
    const d = normalizeDeal({ client: 'Dupont' })
    expect('sequence_key' in d).toBe(false)
    expect('sequence_etape' in d).toBe(false)
  })
})
