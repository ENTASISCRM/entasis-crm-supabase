import { describe, it, expect } from 'vitest'
import { lireJson } from './leadroom-api'

const rep = (corps, ok = true, status = 200) => ({ ok, status, text: async () => corps })

describe('lireJson', () => {
  it('rend le JSON quand tout va bien', async () => {
    expect(await lireJson(rep('{"leads":[1,2]}'))).toEqual({ leads: [1, 2] })
  })

  it("ne lève pas de SyntaxError sur une réponse qui n'est pas du JSON", async () => {
    // Le cas observé : le proxy renvoyait son propre code source.
    await expect(lireJson(rep('// api/leadroom-proxy.js\nexport default …')))
      .rejects.toThrow('Réponse inattendue de la Lead Room')
  })

  it('sur une page d’erreur HTML, donne le statut plutôt qu’un parse raté', async () => {
    await expect(lireJson(rep('<html>502 Bad Gateway</html>', false, 502)))
      .rejects.toThrow('Lead Room indisponible (HTTP 502)')
  })

  it('préfère le message d’erreur du serveur quand il y en a un', async () => {
    await expect(lireJson(rep('{"error":"Campagne inconnue"}', false, 400)))
      .rejects.toThrow('Campagne inconnue')
  })

  it('traite un corps vide comme une réponse inattendue', async () => {
    await expect(lireJson(rep(''))).rejects.toThrow('Réponse inattendue')
  })

  it('accepte un tableau JSON nu', async () => {
    expect(await lireJson(rep('[1,2,3]'))).toEqual([1, 2, 3])
  })
})
