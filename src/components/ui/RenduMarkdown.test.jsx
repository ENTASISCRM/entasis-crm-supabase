// RenduMarkdown. Ce que ces tests verrouillent : le Markdown passe par marked
// puis par l assainisseur avant d atteindre dangerouslySetInnerHTML, un
// script ne survit pas, et le crochet qui ouvre les liens externes dans un
// nouvel onglet est bien branche et ne touche que les liens http(s).
//
// DOMPurify a besoin d un DOM et jsdom n est pas dans les dependances du
// depot : sous Node, l instance reelle est inerte (isSupported faux). Le faux
// ci dessous reproduit son contrat (sanitize retire les scripts, addHook
// enregistre les crochets, afterSanitizeAttributes recoit chaque element
// avec getAttribute et setAttribute). Il prouve le branchement et la logique
// du crochet ; l assainissement lui meme reste celui de DOMPurify, joue dans
// le navigateur.

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('dompurify', () => {
  const crochets = {}
  function elementA(attrs) {
    const attributs = new Map()
    for (const m of attrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attributs.set(m[1], m[2])
    return {
      tagName: 'A',
      getAttribute: (k) => (attributs.has(k) ? attributs.get(k) : null),
      setAttribute: (k, v) => { attributs.set(k, v) },
      serialiser: () => '<a ' + [...attributs].map(([k, v]) => `${k}="${v}"`).join(' ') + '>',
    }
  }
  const instance = {
    isSupported: true,
    addHook: (nom, fn) => { (crochets[nom] ||= []).push(fn) },
    sanitize: (html) => String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<a\b([^>]*)>/gi, (_tout, attrs) => {
        const node = elementA(attrs)
        for (const fn of crochets.afterSanitizeAttributes || []) fn(node)
        return node.serialiser()
      }),
  }
  const fabrique = () => instance
  Object.assign(fabrique, instance)
  return { default: fabrique }
})

const { default: RenduMarkdown } = await import('./RenduMarkdown')

const rendre = (markdown, className) => renderToStaticMarkup(<RenduMarkdown markdown={markdown} className={className} />)

describe('RenduMarkdown', () => {
  it('rend un titre Markdown en h2 dans un conteneur md-rendu', () => {
    const html = rendre('## Titre\n\nUn paragraphe.')
    expect(html).toContain('<h2>Titre</h2>')
    expect(html).toContain('<p>Un paragraphe.</p>')
    expect(html).toMatch(/^<div class="md-rendu">/)
    expect(rendre('Texte', 'lecon-corps')).toMatch(/^<div class="md-rendu lecon-corps">/)
  })

  it('retire un script glisse dans le contenu', () => {
    const html = rendre('Bonjour\n\n<script>alert(1)</script>\n\nSuite')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('Bonjour')
    expect(html).toContain('Suite')
  })

  it('ouvre les liens http dans un nouvel onglet, et laisse les liens internes en place', () => {
    const html = rendre('[Site](https://exemple.fr/page) et [retour](#/academy)')
    expect(html).toMatch(/<a [^>]*href="https:\/\/exemple\.fr\/page"[^>]*target="_blank"/)
    expect(html).toMatch(/<a [^>]*href="https:\/\/exemple\.fr\/page"[^>]*rel="noopener noreferrer"/)
    expect(html).toMatch(/<a href="#\/academy">retour<\/a>/)
  })

  it('rend un conteneur vide sans texte', () => {
    expect(rendre(undefined)).toBe('<div class="md-rendu"></div>')
    expect(rendre('')).toBe('<div class="md-rendu"></div>')
  })
})
