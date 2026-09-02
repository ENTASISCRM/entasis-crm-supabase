import { describe, it, expect } from 'vitest'
import { rapprocherLeads, choisirDossier, situationDe } from './rapprochement-leads.js'

// Noms inventés, aucune donnée client réelle.
const leadLr = (o) => ({
  id: o.id, name: o.name || 'Camille Exemple', status: o.status || 'signed',
  taken_by: o.taken_by || null, updated_at: o.updated_at || '2026-08-20T10:00:00+00:00',
  rdv_date: o.rdv_date || null, email: o.email || 'camille@exemple.fr', phone: o.phone || '+33612345678',
})

describe('situationDe et choisirDossier', () => {
  it('lit la situation depuis le dossier', () => {
    expect(situationDe(null)).toBe('sans_dossier')
    expect(situationDe({ status: 'Prévu' })).toBe('dossier_non_signe')
    expect(situationDe({ status: 'Signé' })).toBe('ok')
  })
  it('préfère un dossier signé quand un lead en porte plusieurs', () => {
    expect(choisirDossier([{ status: 'Prévu' }, { status: 'Signé' }]).status).toBe('Signé')
    expect(choisirDossier([])).toBeNull()
  })
})

describe('rapprocherLeads', () => {
  const deals = [
    { lead_id: 'ok', status: 'Signé', product: 'PER Individuel', advisor_code: 'DEMO', client: 'Camille Exemple' },
    { lead_id: 'brouillon', status: 'Prévu', product: 'Autre', advisor_code: 'DEMO', client: 'Dominique Modèle', client_email: 'dom@modele.fr', client_phone: '06 98 76 54 32' },
  ]

  it('ne garde que les leads sans dossier ou au dossier non signé', () => {
    const lignes = rapprocherLeads([
      leadLr({ id: 'ok', updated_at: '2026-08-25T10:00:00+00:00' }),
      leadLr({ id: 'brouillon', name: 'Dominique Modèle', updated_at: '2026-08-22T10:00:00+00:00' }),
      leadLr({ id: 'absent', name: 'Sacha Démo', updated_at: '2026-08-28T10:00:00+00:00' }),
    ], deals)
    expect(lignes.map((l) => [l.leadId, l.situation])).toEqual([
      ['absent', 'sans_dossier'],
      ['brouillon', 'dossier_non_signe'],
    ])
  })

  it('reprend le contact du dossier CRM pour retrouver le brouillon à la sauvegarde', () => {
    const [l] = rapprocherLeads([leadLr({ id: 'brouillon', email: 'autre@mail.fr' })], deals)
    expect(l.email).toBe('dom@modele.fr')
    expect(l.telephone).toBe('06 98 76 54 32')
    expect(l.dossier).toEqual({ id: null, status: 'Prévu', product: 'Autre', advisor_code: 'DEMO', client: 'Dominique Modèle' })
    expect(l.conseiller).toBe('DEMO')
  })

  it('retrouve le conseiller par l email du preneur quand aucun dossier n existe', () => {
    const advisorParId = new Map([['adv-1', { email: 'Sacha@Entasis-Conseil.fr' }]])
    const codeParEmail = new Map([['sacha@entasis-conseil.fr', 'SACHA']])
    const [l] = rapprocherLeads([leadLr({ id: 'absent', taken_by: 'adv-1' })], [], { advisorParId, codeParEmail })
    expect(l.conseiller).toBe('SACHA')
    expect(l.dossier).toBeNull()
    expect(l.email).toBe('camille@exemple.fr')
  })

  it('ne laisse passer aucun montant', () => {
    const [l] = rapprocherLeads([leadLr({ id: 'brouillon' })], [{ ...deals[1], pp_m: 150, pu: 20000 }])
    expect(JSON.stringify(l)).not.toMatch(/pp_m|pu"|20000/)
  })

  it('tient sans rien', () => {
    expect(rapprocherLeads(null, null)).toEqual([])
  })
})
