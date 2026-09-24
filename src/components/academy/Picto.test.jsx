import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Picto } from './Picto'

// Les mots clés du catalogue de succès (spec § Succès, colonne icône) et
// ceux des huit défis du jour : chacun doit avoir son dessin.
const SUCCES = ['pas', 'cible', 'eclair', 'couronne', 'bouclier', 'etoile', 'livres', 'bibliotheque', 'flamme', 'compteur', 'medaille', 'soleil', 'lune', 'fleche', 'calendrier', 'palier']
const DEFIS = ['session', 'parfaite', 'justes', 'revision', 'deck', 'combo', 'matin', 'decks']

const rendre = (props) => renderToStaticMarkup(<Picto {...props} />)
const dessin = (html) => html.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

describe('Picto', () => {
  it('rend un SVG inline 24 × 24 en currentColor, traits de 2 px, décoratif', () => {
    const html = rendre({ nom: 'flamme' })
    expect(html).toMatch(/^<svg class="ac-picto ac-picto-flamme" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">/)
    expect(html).toContain('<path d=')
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i)
    expect(html).not.toContain('<image')
    expect(html).not.toContain('<text')
  })

  it('a un dessin distinct pour chaque mot clé des succès et des défis', () => {
    const dessins = new Map()
    for (const nom of [...SUCCES, ...DEFIS]) {
      const html = rendre({ nom })
      expect(html).toContain(`class="ac-picto ac-picto-${nom}"`)
      const d = dessin(html)
      expect(d.length).toBeGreaterThan(20)
      expect(d).not.toBe(dessin(rendre({ nom: 'inconnu' })))
      dessins.set(nom, d)
    }
    expect(new Set(dessins.values()).size).toBe(SUCCES.length + DEFIS.length)
  })

  it('tombe sur le pictogramme neutre pour un nom inconnu, vide ou mal typé', () => {
    const neutre = rendre({ nom: 'neutre' })
    expect(neutre).toContain('class="ac-picto ac-picto-neutre"')
    expect(dessin(rendre({ nom: 'licorne' }))).toBe(dessin(neutre))
    expect(rendre({ nom: 'licorne' })).toContain('class="ac-picto ac-picto-neutre"')
    expect(dessin(rendre({}))).toBe(dessin(neutre))
    expect(dessin(rendre({ nom: null }))).toBe(dessin(neutre))
    expect(dessin(rendre({ nom: 42 }))).toBe(dessin(neutre))
    // Un nom du prototype n’est pas un dessin.
    expect(rendre({ nom: 'constructor' })).toContain('ac-picto-neutre')
    expect(rendre({ nom: 'toString' })).toContain('ac-picto-neutre')
  })

  it('tolère la casse et les espaces autour du nom', () => {
    expect(rendre({ nom: ' Flamme ' })).toContain('class="ac-picto ac-picto-flamme"')
    expect(dessin(rendre({ nom: 'FLAMME' }))).toBe(dessin(rendre({ nom: 'flamme' })))
  })

  it('applique la taille en pixels, 20 par défaut, 8 au minimum', () => {
    expect(rendre({ nom: 'cible', taille: 32 })).toContain('width="32" height="32"')
    expect(rendre({ nom: 'cible', taille: '48' })).toContain('width="48" height="48"')
    expect(rendre({ nom: 'cible' })).toContain('width="20" height="20"')
    expect(rendre({ nom: 'cible', taille: 0 })).toContain('width="20" height="20"')
    expect(rendre({ nom: 'cible', taille: 3 })).toContain('width="8" height="8"')
    expect(rendre({ nom: 'cible', taille: 'grande' })).toContain('width="20" height="20"')
  })
})
