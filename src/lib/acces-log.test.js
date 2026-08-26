import { describe, it, expect } from 'vitest'
import { decrireExport, SEUIL_EXPORT_MASSIF } from './acces-log'

describe('decrireExport', () => {
  it('décrit un export courant', () => {
    const d = decrireExport('clients', 12, { filtre: 'AOÛT' })
    expect(d.action).toBe('export_csv')
    expect(d.ressource).toBe('clients')
    expect(d.nb_lignes).toBe(12)
    expect(d.contexte.filtre).toBe('AOÛT')
    expect(d.contexte.massif).toBe(false)
  })

  it('marque un export massif au-delà du seuil', () => {
    expect(decrireExport('clients', SEUIL_EXPORT_MASSIF).contexte.massif).toBe(true)
    expect(decrireExport('clients', SEUIL_EXPORT_MASSIF - 1).contexte.massif).toBe(false)
  })

  it('marque massif un export de tout l’annuaire client', () => {
    // Le scénario que ce journal existe pour attraper : 379 fiches d'un coup.
    const d = decrireExport('clients', 379)
    expect(d.contexte.massif).toBe(true)
    expect(d.nb_lignes).toBe(379)
  })

  it('ne fait jamais confiance au nombre de lignes reçu', () => {
    expect(decrireExport('clients', -5).nb_lignes).toBe(0)
    expect(decrireExport('clients', 3.7).nb_lignes).toBe(3)
    expect(decrireExport('clients', 'beaucoup').nb_lignes).toBe(0)
    expect(decrireExport('clients', null).nb_lignes).toBe(0)
    expect(decrireExport('clients', undefined).nb_lignes).toBe(0)
  })

  it('borne la ressource et encaisse une valeur absente', () => {
    expect(decrireExport(null, 1).ressource).toBe('inconnu')
    expect(decrireExport('x'.repeat(500), 1).ressource).toHaveLength(100)
  })

  it('n’émet jamais auteur_id : la base le prend de la session', () => {
    // Garde-fou : si un jour quelqu'un ajoute auteur_id ici, la policy le
    // rejetterait — mais surtout, il deviendrait falsifiable par le client.
    const d = decrireExport('clients', 5)
    expect(d).not.toHaveProperty('auteur_id')
    expect(d).not.toHaveProperty('auteur_email')
  })

  it('conserve le contexte fourni sans l’écraser', () => {
    const d = decrireExport('dossiers', 4, { mois: 'AOÛT', statut: 'Signé' })
    expect(d.contexte).toEqual({ mois: 'AOÛT', statut: 'Signé', massif: false })
  })
})
