import { describe, it, expect } from 'vitest'
import { origineClient, tableCampagnes, repartitionOrigines, ORIGINES_MANUELLES } from './origine-client'

const client = (o) => ({ id: 'c1', nom: 'Cadet', ...o })

describe('origineClient — dérivation', () => {
  it('reconnaît un client issu d’une campagne, campagne nommée', () => {
    const o = origineClient(client(), [{ id: 'd1', lead_id: 'L1' }], { L1: 'impotfrance_2026' })
    expect(o.cle).toBe('lead')
    expect(o.libelle).toBe('Lead · impotfrance_2026')
    expect(o.ton).toBe('campagne')
  })

  it('dit « campagne inconnue » plutôt que d’en inventer une', () => {
    // Cas réel : 190 des 216 dossiers issus d'un lead ne retrouvent pas leur
    // ligne dans le miroir leads_room, figé depuis le 4 mai.
    const o = origineClient(client(), [{ id: 'd1', lead_id: 'L-absent' }], {})
    expect(o.cle).toBe('lead')
    expect(o.libelle).toBe('Lead')
    expect(o.detail).toMatch(/miroir Lead Room/)
  })

  it('reconnaît un apport direct : des dossiers, aucun lead', () => {
    const o = origineClient(client(), [{ id: 'd1' }, { id: 'd2', lead_id: null }])
    expect(o.cle).toBe('direct')
    expect(o.ton).toBe('chaud')
  })

  it('ne devine rien sans dossier', () => {
    const o = origineClient(client(), [])
    expect(o.cle).toBe('inconnu')
    expect(o.libelle).toBe('Origine inconnue')
  })

  it('suffit d’un seul dossier avec lead parmi plusieurs', () => {
    const o = origineClient(client(), [{ id: 'd1' }, { id: 'd2', lead_id: 'L1' }], { L1: 'salon' })
    expect(o.cle).toBe('lead')
  })
})

describe('origineClient — précision saisie', () => {
  it('la saisie prime sur la dérivation', () => {
    const o = origineClient(client({ origine: 'reseau_perso' }), [{ id: 'd1' }])
    expect(o.cle).toBe('reseau_perso')
    expect(o.libelle).toBe('Réseau perso')
    expect(o.saisi).toBe(true)
  })

  it('la saisie prime même sur un lead, et le signale', () => {
    // Un conseiller qui corrige sait quelque chose que la donnée ne dit pas :
    // un lead peut être quelqu'un qu'il connaissait déjà.
    const o = origineClient(client({ origine: 'reseau_perso' }), [{ id: 'd1', lead_id: 'L1' }], { L1: 'ads' })
    expect(o.cle).toBe('reseau_perso')
    expect(o.detail).toMatch(/aussi un dossier issu/)
  })

  it('ignore une valeur saisie hors liste et retombe sur la dérivation', () => {
    const o = origineClient(client({ origine: 'n_importe_quoi' }), [{ id: 'd1' }])
    expect(o.cle).toBe('direct')
    expect(o.saisi).toBe(false)
  })

  it('réseau et recommandation sont marqués « chaud »', () => {
    for (const cle of ['reseau_perso', 'recommandation']) {
      expect(origineClient(client({ origine: cle }), []).ton).toBe('chaud')
    }
    expect(origineClient(client({ origine: 'autre' }), []).ton).toBe('neutre')
  })
})

describe('origineClient — robustesse', () => {
  it('encaisse des entrées absentes', () => {
    expect(origineClient(null, null).cle).toBe('inconnu')
    expect(origineClient(undefined, undefined).cle).toBe('inconnu')
    expect(origineClient(client(), 'pas un tableau').cle).toBe('inconnu')
  })

  it('renvoie toujours un libellé affichable', () => {
    for (const cas of [null, client(), client({ origine: 'partenaire' })]) {
      expect(origineClient(cas, []).libelle).toBeTruthy()
    }
  })
})

describe('tableCampagnes', () => {
  it('indexe les campagnes connues du miroir', () => {
    expect(tableCampagnes([{ id: 'L1', campaign_slug: 'ads' }])).toEqual({ L1: 'ads' })
  })
  it('retombe sur campaign_id à défaut de slug', () => {
    expect(tableCampagnes([{ id: 'L1', campaign_id: 42 }])).toEqual({ L1: '42' })
  })
  it('ignore les lignes inexploitables', () => {
    expect(tableCampagnes([{ id: 'L1' }, { campaign_slug: 'x' }, null])).toEqual({})
    expect(tableCampagnes(null)).toEqual({})
  })
})

describe('repartitionOrigines', () => {
  it('compte les origines d’un portefeuille', () => {
    const clients = [client({ id: 'a' }), client({ id: 'b' }), client({ id: 'c', origine: 'reseau_perso' })]
    const deals = { a: [{ lead_id: 'L1' }], b: [{ id: 'd' }], c: [] }
    expect(repartitionOrigines(clients, deals, { L1: 'ads' }))
      .toEqual({ lead: 1, direct: 1, reseau_perso: 1 })
  })
})

describe('ORIGINES_MANUELLES', () => {
  it('reste une liste courte : une liste longue finit en « Autre » partout', () => {
    expect(ORIGINES_MANUELLES.length).toBeLessThanOrEqual(6)
    expect(ORIGINES_MANUELLES.map((o) => o.cle)).toContain('reseau_perso')
  })
})
