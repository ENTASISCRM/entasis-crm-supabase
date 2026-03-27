import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  // 1. Authentification
  try {
    await verifyAuth(req)
  } catch(e) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { userMessage } = req.body

  // 2. Valider userMessage
  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'Message requis' })
  }

  // 3. Sanitiser userMessage
  const safeMessage = userMessage
    .replace(/<[^>]*>/g, '')
    .substring(0, 2000)

  // 4. System prompt fixe côté serveur uniquement
  const SYSTEM_PROMPT = `Tu es un assistant pour conseillers en gestion de patrimoine (CGP) chez Entasis Conseil. Tu aides à rédiger des notes professionnelles sur les clients et leurs dossiers patrimoniaux. Sois précis, professionnel et concis.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: safeMessage }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Erreur API Anthropic' })
    }

    res.status(200).json({ content: data.content?.[0]?.text || '' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
