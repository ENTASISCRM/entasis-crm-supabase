import { describe, it, expect } from 'vitest'
import { COLONNES_DEALS, nettoyerPourEcriture } from './colonnes-deals'

// Un dossier tel qu'il circule à l'écran : les colonnes, plus tout ce que
// les écrans y accrochent en route.
const dossierEnrichi = {
  id: 'D-1', status: 'Signé', date_signed: '2026-09-02', month: 'SEPTEMBRE',
  advisor_code: 'DEMO', co_advisor_code: null, pp_m: 150, pu: 0, notes: '',
  client_id: 'c1', client: 'Camille Exemple', client_email: 'c@exemple.fr',
  next_action: null, next_action_date: null, sequence_key: null, sequence_etape: null,
  // ce qui n'est pas une colonne
  clients: { id: 'c1', nom: 'Camille Exemple' },
  client_data: true,
  client_statut_pro: 'TNS', client_profession: 'Architecte', client_revenus: 50000, client_patrimoine: 200000,
  joursSansMouvement: 30,
  heureRdv: '14h30',
}

describe('nettoyerPourEcriture', () => {
  it('ne garde que les colonnes de deals', () => {
    const { patch } = nettoyerPourEcriture(dossierEnrichi)
    for (const cle of Object.keys(patch)) expect(COLONNES_DEALS).toContain(cle)
    expect(patch.status).toBe('Signé')
    expect(patch.date_signed).toBe('2026-09-02')
    expect(patch.client_id).toBe('c1')
  })

  it('écarte les clés calculées par les écrans et la jointure, et les nomme', () => {
    const { patch, ecartes } = nettoyerPourEcriture(dossierEnrichi)
    for (const cle of ['clients', 'client_data', 'client_statut_pro', 'client_profession', 'client_revenus', 'client_patrimoine', 'joursSansMouvement', 'heureRdv']) {
      expect(patch).not.toHaveProperty(cle)
      expect(ecartes).toContain(cle)
    }
    expect(ecartes).toHaveLength(8)
  })

  it('garde une valeur nulle : effacer un champ est une écriture voulue', () => {
    const { patch } = nettoyerPourEcriture({ next_action_date: null, co_advisor_code: null })
    expect(patch).toEqual({ next_action_date: null, co_advisor_code: null })
  })

  it('un patch réduit passe tel quel', () => {
    const { patch, ecartes } = nettoyerPourEcriture({ status: 'En cours', updated_at: '2026-09-03T06:00:00Z' })
    expect(patch).toEqual({ status: 'En cours', updated_at: '2026-09-03T06:00:00Z' })
    expect(ecartes).toEqual([])
  })

  it('tolère un objet vide ou absent', () => {
    expect(nettoyerPourEcriture({})).toEqual({ patch: {}, ecartes: [] })
    expect(nettoyerPourEcriture(null)).toEqual({ patch: {}, ecartes: [] })
  })

  it('la liste des colonnes est figée et porte les colonnes vitales', () => {
    expect(Object.isFrozen(COLONNES_DEALS)).toBe(true)
    for (const cle of ['id', 'status', 'date_signed', 'date_expected', 'month', 'advisor_code', 'client_id', 'updated_at', 'sequence_key', 'sequence_etape', 'next_action_date']) {
      expect(COLONNES_DEALS).toContain(cle)
    }
  })
})
