// Le referentiel des deux referents, et le brouillon de mail qui part vers
// eux. Une adresse fausse ou un brouillon qui laisserait filtrer un montant
// de remuneration se verrait ici avant la production.

import { describe, it, expect } from 'vitest'
import { PARTENAIRES_IMMO, partenaireDe, ETAPES_IMMO, etapeDe } from './partenairesImmo'
import { brouillonMail } from '../lib/mail-immo'

describe('partenaires immobilier', () => {
  it('garde exactement deux referents, un par metier', () => {
    expect(PARTENAIRES_IMMO).toHaveLength(2)
    expect(new Set(PARTENAIRES_IMMO.map((p) => p.cle)).size).toBe(2)
  })

  it('donne a chacun un referent joignable', () => {
    for (const p of PARTENAIRES_IMMO) {
      expect(p.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i)
      expect(p.telephone.replace(/\D/g, '').length).toBeGreaterThanOrEqual(9)
      expect(p.referent.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('resume le dossier dans le brouillon, sans montant de remuneration', () => {
    const f = {
      client_nom: 'Marie Dupont', client_telephone: '06 12 34 56 78',
      client_email: 'marie@exemple.fr', objectif: 'Réduire l impôt',
      dispositif_retenu: 'Malraux', budget_total: 420000, apport: 30000,
      notes: 'Secteur Cergy.',
    }
    const { sujet, corps } = brouillonMail(PARTENAIRES_IMMO[1], f, 'Nans Martin')
    expect(sujet).toContain('Marie Dupont')
    expect(corps).toContain('06 12 34 56 78')
    expect(corps).toContain('Malraux')
    expect(corps).toContain('Secteur Cergy.')
    expect(corps).toContain('Nans Martin')
    // Le referent apprend le projet, pas ce que le cabinet gagne.
    expect(corps).not.toMatch(/commission|honoraires|rémunération|retrocession/i)
  })

  it('omet proprement les champs laisses vides', () => {
    const f = {
      client_nom: 'Karim Benali', client_telephone: '', client_email: '',
      objectif: '', dispositif_retenu: '', budget_total: '', apport: '', notes: '',
    }
    const { corps } = brouillonMail(PARTENAIRES_IMMO[0], f, 'Clément M')
    expect(corps).toContain('Karim Benali')
    expect(corps).not.toContain('Budget :')
    expect(corps).not.toContain('undefined')
    expect(corps).not.toContain('null')
  })

  it('resout une cle inconnue sans planter', () => {
    expect(partenaireDe('inconnu')).toBeNull()
    expect(etapeDe('inconnu').cle).toBe('transmis')
  })

  it('couvre les etapes utilisees en base', () => {
    expect(ETAPES_IMMO.map((e) => e.cle)).toEqual(
      ['transmis', 'etude', 'reserve', 'acte', 'sans_suite'],
    )
  })
})
