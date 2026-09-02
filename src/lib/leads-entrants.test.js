import { describe, it, expect } from 'vitest'
import {
  ageHeures, formaterTelephone, classerLeads, rechercherLeads,
  dossierPourLead, delaiPremierAppel, libelleDelai, libelleRecu,
} from './leads-entrants'

const TODAY = new Date('2026-09-02T10:00:00+02:00')
const MOI = 'profil-moi'
const COLLEGUE = 'profil-collegue'

// Noms inventés, aucune donnée client réelle.
const lead = (o) => ({
  id: o.id || 'l1', nom: 'Camille Exemple', telephone: '33612345678', email: 'camille@exemple.fr',
  campagne: 'SUCCESSION', status: 'available', taken_by: null, taken_at: null,
  created_at: '2026-09-02T08:00:00+02:00', ...o,
})

describe('formaterTelephone', () => {
  it('lit un numéro français stocké en international sans le plus', () => {
    expect(formaterTelephone('33612345678')).toEqual({ affiche: '06 12 34 56 78', appel: '+33612345678' })
  })
  it('accepte un numéro déjà national, avec espaces, plus ou 00', () => {
    expect(formaterTelephone('0612345678').affiche).toBe('06 12 34 56 78')
    expect(formaterTelephone('+33 6 12 34 56 78').appel).toBe('+33612345678')
    expect(formaterTelephone('0033612345678').affiche).toBe('06 12 34 56 78')
  })
  it('garde l indicatif visible sur un numéro étranger', () => {
    expect(formaterTelephone('41791234567')).toEqual({ affiche: '+41 791 234 567', appel: '+41791234567' })
  })
  it('ne compose rien sans numéro', () => {
    expect(formaterTelephone('')).toEqual({ affiche: '', appel: null })
    expect(formaterTelephone(null).appel).toBeNull()
  })
})

describe('ageHeures', () => {
  it('compte les heures depuis la réception', () => {
    expect(ageHeures('2026-09-02T08:00:00+02:00', TODAY)).toBe(2)
    expect(ageHeures('n importe quoi', TODAY)).toBeNull()
  })
})

describe('classerLeads', () => {
  it('range à moi, nouveaux, pris par un collègue, morts', () => {
    const r = classerLeads([
      lead({ id: 'moi', taken_by: MOI }),
      lead({ id: 'moi-booke', taken_by: MOI, status: 'booked' }),
      lead({ id: 'neuf' }),
      lead({ id: 'collegue', taken_by: COLLEGUE }),
      lead({ id: 'booke-sans-preneur', status: 'booked' }),
      lead({ id: 'mort', status: 'dead' }),
      lead({ id: 'rendu', status: 'released', taken_by: MOI }),
    ], { profileId: MOI, today: TODAY })
    expect(r.aMoi.map((l) => l.id)).toEqual(['moi', 'moi-booke'])
    expect(r.nouveaux.map((l) => l.id)).toEqual(['neuf'])
    expect(r.enCours.map((l) => l.id)).toEqual(['collegue', 'booke-sans-preneur'])
    expect(r.morts.map((l) => l.id)).toEqual(['mort', 'rendu'])
    expect(r.total).toBe(7)
  })

  it('enrichit chaque lead avec son âge et ses deux formes de téléphone', () => {
    const r = classerLeads([lead({ id: 'a' })], { profileId: MOI, today: TODAY })
    expect(r.nouveaux[0]).toMatchObject({ ageHeures: 2, telephoneAffiche: '06 12 34 56 78', telephoneAppel: '+33612345678' })
  })

  it('met le plus récent en tête de chaque groupe', () => {
    const r = classerLeads([
      lead({ id: 'vieux', created_at: '2026-09-01T08:00:00+02:00' }),
      lead({ id: 'recent', created_at: '2026-09-02T09:30:00+02:00' }),
    ], { profileId: MOI, today: TODAY })
    expect(r.nouveaux.map((l) => l.id)).toEqual(['recent', 'vieux'])
  })

  it('sans profil, rien n est à moi', () => {
    const r = classerLeads([lead({ id: 'x', taken_by: MOI })], { today: TODAY })
    expect(r.aMoi).toHaveLength(0)
    expect(r.enCours).toHaveLength(1)
  })

  it('tient sans liste', () => {
    expect(classerLeads(null, { profileId: MOI }).total).toBe(0)
  })
})

describe('libelleRecu', () => {
  it('parle en minutes, puis en heures, puis donne la date', () => {
    expect(libelleRecu(lead({ created_at: '2026-09-02T09:35:00+02:00' }), TODAY)).toBe('reçu il y a 25 min')
    expect(libelleRecu(lead({ created_at: '2026-09-02T08:00:00+02:00' }), TODAY)).toBe('reçu il y a 2 h')
    expect(libelleRecu(lead({ created_at: '2026-08-28T08:00:00+02:00' }), TODAY)).toBe('reçu le 28 août')
  })
})

describe('rechercherLeads', () => {
  const liste = [
    lead({ id: 'a', nom: 'Aurélie Modèle', campagne: 'article_790_2026', telephone: '33612345678' }),
    lead({ id: 'b', nom: 'Dominique Prototype', campagne: 'SUCCESSION', telephone: '33698765432', email: 'dominique@proto.fr' }),
  ]
  it('ignore les accents et l ordre des mots', () => {
    expect(rechercherLeads(liste, 'aurelie').map((l) => l.id)).toEqual(['a'])
    expect(rechercherLeads(liste, 'modele aurelie').map((l) => l.id)).toEqual(['a'])
  })
  it('trouve par campagne, email et numéro tapé d une traite ou par morceaux', () => {
    expect(rechercherLeads(liste, '790').map((l) => l.id)).toEqual(['a'])
    expect(rechercherLeads(liste, 'proto.fr').map((l) => l.id)).toEqual(['b'])
    expect(rechercherLeads(liste, '0698').map((l) => l.id)).toEqual(['b'])
    expect(rechercherLeads(liste, '06 12').map((l) => l.id)).toEqual(['a'])
  })
  it('rend tout sans requête, rien sur une requête introuvable', () => {
    expect(rechercherLeads(liste, '  ')).toHaveLength(2)
    expect(rechercherLeads(liste, 'zzzz')).toHaveLength(0)
  })
})

describe('dossierPourLead', () => {
  it('prépare le même brouillon que le pont Lead Room', () => {
    const d = dossierPourLead(lead({ id: 'lead-42', nom: '  Camille Exemple ' }), 'DEMO')
    expect(d).toMatchObject({
      client: 'Camille Exemple',
      client_phone: '06 12 34 56 78',
      client_email: 'camille@exemple.fr',
      source: 'lead_room',
      lead_id: 'lead-42',
      product: 'Autre',
      status: 'Prévu',
      advisor_code: 'DEMO',
    })
    // Le reste vient d emptyDeal : un identifiant neuf, un mois, une priorité.
    expect(d.id).toBeTruthy()
    expect(d.priority).toBe('Normale')
  })
  it('reste ouvrable sans email ni téléphone', () => {
    const d = dossierPourLead({ id: 'x', nom: 'Sacha Démo', telephone: null, email: null }, '')
    expect(d.client_phone).toBe('')
    expect(d.client_email).toBe('')
  })
})

describe('delaiPremierAppel', () => {
  const pris = (id, recu, prisA) => lead({ id, taken_by: COLLEGUE, created_at: recu, taken_at: prisA })
  it('rend la médiane en heures sur les leads pris', () => {
    const h = delaiPremierAppel([
      pris('a', '2026-09-01T08:00:00+02:00', '2026-09-01T09:00:00+02:00'),  // 1 h
      pris('b', '2026-09-01T08:00:00+02:00', '2026-09-01T12:00:00+02:00'),  // 4 h
      pris('c', '2026-09-01T08:00:00+02:00', '2026-09-02T08:00:00+02:00'),  // 24 h
    ], { today: TODAY })
    expect(h).toBe(4)
  })
  it('fait la moyenne des deux valeurs centrales quand le nombre est pair', () => {
    const h = delaiPremierAppel([
      pris('a', '2026-09-01T08:00:00+02:00', '2026-09-01T09:00:00+02:00'),
      pris('b', '2026-09-01T08:00:00+02:00', '2026-09-01T11:00:00+02:00'),
    ], { today: TODAY })
    expect(h).toBe(2)
  })
  it('ignore les leads jamais pris et ceux pris il y a plus de 30 jours', () => {
    const h = delaiPremierAppel([
      lead({ id: 'libre' }),
      pris('vieux', '2026-07-01T08:00:00+02:00', '2026-07-01T09:00:00+02:00'),
    ], { today: TODAY })
    expect(h).toBeNull()
  })
})

describe('libelleDelai', () => {
  it('choisit l unité qui se lit', () => {
    expect(libelleDelai(0.68)).toBe('41 min')
    expect(libelleDelai(2.6)).toBe('3 h')
    expect(libelleDelai(60)).toBe('3 j')
    expect(libelleDelai(null)).toBe('')
  })
})
