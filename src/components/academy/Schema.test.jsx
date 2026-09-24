import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Schema } from './Schema'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><title>Les trois poches</title><rect width="640" height="360" fill="#fff"/><text x="320" y="180" text-anchor="middle" font-size="16" fill="#162443">Précaution</text></svg>'

const rendre = (props) => renderToStaticMarkup(<Schema {...props} />)

describe('Schema', () => {
  it('rend une figure ac-schema avec le SVG assaini, le titre et la légende', () => {
    const html = rendre({ svg: SVG, titre: 'Les trois poches', legende: 'Précaution, projets datés, long terme : on ne mélange pas.' })
    expect(html).toMatch(/^<figure class="ac-schema">/)
    expect(html).toContain('<div class="ac-schema-image"><svg ')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Les trois poches"')
    expect(html).toContain('width="100%"')
    // « auto » n est pas une longueur SVG : l attribut height ne doit plus
    // etre pose, le CSS s en charge.
    expect(html).not.toContain('height="auto"')
    expect(html).toContain('viewBox="0 0 640 360"')
    expect(html).toContain('>Précaution</text>')
    expect(html).toContain('<figcaption class="ac-schema-legende"><strong class="ac-schema-titre">Les trois poches</strong><span class="ac-schema-texte">Précaution, projets datés, long terme : on ne mélange pas.</span></figcaption>')
    expect(html).not.toContain('Schéma indisponible')
  })

  it('prend l’alt avant le titre pour le libellé accessible, et le title du SVG à défaut des deux', () => {
    expect(rendre({ svg: SVG, titre: 'Les trois poches', alt: 'Trois poches côte à côte' })).toContain('aria-label="Trois poches côte à côte"')
    expect(rendre({ svg: SVG })).toContain('aria-label="Les trois poches"')
    expect(rendre({ svg: SVG })).not.toContain('<figcaption')
  })

  it('affiche « Schéma indisponible » sur un SVG hostile, vide ou trop long, en gardant la légende', () => {
    const hostile = rendre({ svg: '<svg viewBox="0 0 1 1" onload="alert(1)"></svg>', titre: 'Titre', legende: 'À retenir.' })
    expect(hostile).toContain('<p class="ac-schema-indisponible">Schéma indisponible</p>')
    expect(hostile).not.toContain('onload')
    expect(hostile).not.toContain('<svg')
    expect(hostile).toContain('<strong class="ac-schema-titre">Titre</strong>')
    expect(hostile).toContain('À retenir.')
    expect(rendre({ svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>' })).toContain('Schéma indisponible')
    expect(rendre({ svg: '' })).toContain('Schéma indisponible')
    expect(rendre({ svg: null })).toContain('Schéma indisponible')
    expect(rendre({})).toContain('Schéma indisponible')
    expect(rendre({ svg: `<svg viewBox="0 0 1 1"><desc>${'a'.repeat(24000)}</desc></svg>` })).toContain('Schéma indisponible')
  })

  it('ne rend que la légende quand il n’y a pas de titre, et l’inverse', () => {
    const sansTitre = rendre({ svg: SVG, legende: 'Seule la légende.' })
    expect(sansTitre).toContain('<figcaption class="ac-schema-legende"><span class="ac-schema-texte">Seule la légende.</span></figcaption>')
    expect(sansTitre).not.toContain('ac-schema-titre')
    const sansLegende = rendre({ svg: SVG, titre: 'Seul le titre' })
    expect(sansLegende).toContain('<figcaption class="ac-schema-legende"><strong class="ac-schema-titre">Seul le titre</strong></figcaption>')
    expect(sansLegende).not.toContain('ac-schema-texte')
  })
})
