// Les fiches sont generees dans le navigateur du conseiller : une erreur ici
// ne se voit qu au moment ou il clique, juste avant un rendez vous. On genere
// donc les neuf a chaque test, et on verifie ce qui doit imperativement y
// figurer ou ne pas y figurer.

import { describe, it, expect } from 'vitest'
import { FICHES_IMMO, fichesDuPartenaire, ficheDe } from '../config/fichesImmo'
import { PARTENAIRES_IMMO, partenaireDe } from '../config/partenairesImmo'
import { genererFiche, nomFichierFiche } from './fiches-immo-pdf'

describe('fiches dispositif', () => {
  it('couvre les dispositifs annonces sur les cartes partenaires', () => {
    for (const p of PARTENAIRES_IMMO) {
      const couverts = fichesDuPartenaire(p.cle).map((f) => f.dispositif)
      for (const d of p.dispositifs) expect(couverts).toContain(d)
    }
  })

  it('donne un nom de fichier propre, sans accent ni espace', () => {
    for (const f of FICHES_IMMO) {
      expect(nomFichierFiche(f)).toMatch(/^Entasis-fiche-[a-z0-9-]+\.pdf$/)
    }
  })

  it('ne laisse filtrer aucun montant de remuneration', () => {
    const tout = JSON.stringify(FICHES_IMMO)
    expect(tout).not.toMatch(/commission|rétrocession|retrocession|notre marge|nous touchons/i)
  })

  it('porte une mise en garde sur chaque dispositif', () => {
    for (const f of FICHES_IMMO) {
      expect(f.vigilance.length).toBeGreaterThanOrEqual(3)
      expect(f.questions.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('genere les neuf fiches sans lever, en une ou deux pages', async () => {
    for (const f of FICHES_IMMO) {
      const doc = await genererFiche(f, partenaireDe(f.partenaire), 'Conseiller Test')
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
      expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2)
      const octets = doc.output('arraybuffer')
      expect(octets.byteLength).toBeGreaterThan(2000)
      if (process.env.ECRIRE_FICHES) {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(`${process.env.ECRIRE_FICHES}/${nomFichierFiche(f)}`, Buffer.from(octets))
      }
    }
  }, 30000)

  it('resout une cle inconnue sans planter', () => {
    expect(ficheDe('nexiste-pas')).toBeNull()
  })
})
