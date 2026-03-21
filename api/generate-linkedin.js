export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { theme, ton, contexte } = req.body

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
        max_tokens: 1000,
        system: `Tu es un expert en communication LinkedIn pour les Conseillers en Gestion de Patrimoine (CGP) francais. Tu generes des posts LinkedIn professionnels, engageants et conformes aux regles AMF. Regles: jamais de promesses de rendement, ton professionnel mais accessible, maximum 1300 caracteres, structure accroche forte puis developpement puis call-to-action, 2-3 emojis max, 3-5 hashtags. Cabinet: Entasis Conseil, Paris 8e, CGPI independant.`,
        messages: [{ role: 'user', content: `Theme: ${theme}\nTon: ${ton}\nContexte: ${contexte || 'Pas de contexte specifique, choisis un angle pertinent et actuel.'}\nGenere un post LinkedIn optimise.` }],
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
