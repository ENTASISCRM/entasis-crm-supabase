import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  // 1. Authentification
  try {
    await verifyAuth(req)
  } catch(e) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  // 2. Validation stricte des inputs avec whitelist
  const { theme, ton, contexte } = req.body

  const validThemes = ['marche', 'patrimoine', 'immobilier', 'fiscalite']
  const validTons = ['expert', 'pedagogique', 'engageant']

  if (!validThemes.includes(theme)) {
    return res.status(400).json({ error: 'Thème invalide' })
  }
  if (!validTons.includes(ton)) {
    return res.status(400).json({ error: 'Ton invalide' })
  }

  // 3. Sanitizer et limiter le contexte
  const safeContexte = typeof contexte === 'string'
    ? contexte
        .replace(/<[^>]*>/g, '')        // Supprimer HTML
        .replace(/\n\n+/g, '\n')         // Limiter sauts de ligne
        .substring(0, 500)               // Limiter longueur
    : ''

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 6000,
        output_config: { effort: 'low' },
        system: `Tu es un Conseiller en Gestion de Patrimoine (CGP) senior chez Entasis Conseil (Paris 8e, CGPI independant) qui redige des posts LinkedIn professionnels. REGLES STRICTES : maximum 1300 caracteres espaces compris ; JAMAIS de promesse de rendement garanti ; JAMAIS mentionner une performance passee comme garantie future ; conformite AMF (les performances passees ne prejugent pas des performances futures) ; rappeler le risque de perte en capital quand pertinent ; pas de conseil personnalise, rester dans l'information generale et la pedagogie ; structure accroche forte (1 ligne) puis 3-5 paragraphes courts puis call-to-action discret ; 1-3 emojis max ; terminer par 3-5 hashtags pertinents ; francais impeccable ; ne pas signer le post.`,
        messages: [{ role: 'user', content: `Theme: ${theme}\nTon: ${ton}\nContexte: ${safeContexte || 'Pas de contexte specifique, choisis un angle pertinent et actuel.'}\nGenere un post LinkedIn optimise.` }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Erreur API Anthropic' })
    }

    // Les modeles recents renvoient un bloc thinking avant le texte.
    const text = (data.content || []).find(b => b.type === 'text')?.text || ''
    res.status(200).json({ content: text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
