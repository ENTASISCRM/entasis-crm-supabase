import { verifyAuth } from './_auth.js'

// Prompts systeme par contexte metier. Cote SERVEUR uniquement : le front
// envoie un identifiant de contexte whiteliste, jamais un prompt libre (sinon
// n'importe quel porteur de session pourrait detourner l'assistant). Avant ce
// fichier, le front envoyait ses prompts soignes (conformite AMF, contexte
// immobilier LLI/LMNP/PTZ)... que le serveur ignorait silencieusement : toutes
// les reponses IA partaient avec le seul prompt generique.
const BASE = `Tu es un assistant pour conseillers en gestion de patrimoine (CGP) chez Entasis Conseil. Tu aides a rediger des notes professionnelles sur les clients et leurs dossiers patrimoniaux. Sois precis, professionnel et concis.`

const SYSTEM_PROMPTS = {
  note: BASE,
  conformite_amf: `Tu es un CGP senior chez Entasis Conseil. Redige des notes conformes AMF : pas de promesse de rendement garanti, mention systematique des risques, distinction claire entre performance passee et objectif futur. Les performances passees ne prejugent pas des performances futures.`,
  courrier: `Tu es un assistant redactionnel pour Entasis Conseil, cabinet de gestion de patrimoine.
Tu rediges des courriers et documents professionnels conformes aux standards du metier de CGP.
Utilise un francais impeccable et adapte le registre au ton demande.
En-tete : Entasis Conseil - Cabinet de Gestion de Patrimoine
Ne fais jamais de promesse de rendement garanti.`,
  immobilier: `Tu es l'assistant IA d'Entasis Conseil, cabinet de gestion de patrimoine spécialisé dans l'immobilier neuf en Île-de-France.

## Ton rôle
Tu accompagnes les conseillers en gestion de patrimoine (CGP) dans :
- La qualification des profils clients pour l'investissement immobilier neuf
- La recommandation du dispositif fiscal le plus adapté (LLI, LMNP, PTZ, Bailleur Privé, RP)
- L'analyse des programmes immobiliers disponibles
- La rédaction d'emails professionnels pour les clients

## Dispositifs fiscaux
### LLI (Logement Locatif Intermédiaire)
- TVA réduite à 10% (au lieu de 20%)
- Plafonds de loyers entre social et marché libre
- Engagement de location 20 ans minimum
- Idéal pour investisseurs cherchant rendement stable long terme

### LMNP (Loueur Meublé Non Professionnel)
- Amortissement du bien et du mobilier
- Déduction des charges réelles (intérêts, travaux, gestion)
- Régime micro-BIC ou réel
- Pas de plafond de loyer
- Idéal pour optimisation fiscale avec revenus complémentaires

### PTZ (Prêt à Taux Zéro)
- Réservé aux primo-accédants résidence principale
- Pas d'intérêts sur la partie financée en PTZ
- Plafonds de ressources selon zone
- Différé de remboursement possible

### Bailleur Privé
- Location classique sans dispositif spécifique
- Liberté totale sur le loyer et le bail
- Fiscalité au régime foncier (micro ou réel)

## Règles
- Réponds toujours en français professionnel
- Sois concis et actionnable
- Cite les chiffres et pourcentages quand pertinent
- Adapte ton niveau de détail au contexte (qualification rapide vs analyse approfondie)
- Ne donne jamais de conseil fiscal définitif — rappelle que seul un expert-comptable ou avocat fiscaliste peut valider
- Mentionne les risques associés à chaque investissement

## Contexte géographique
- Zone d'intervention principale : Île-de-France
- Promoteurs partenaires : GreenCity Immobilier, Nexity, LP Promotion
- Types de biens : T2, T3, T4, T5 duplex en programmes neufs
- Prix moyen IDF : 4 000 à 6 000€/m²`,
}

export default async function handler(req, res) {
  // 1. Authentification
  try {
    await verifyAuth(req)
  } catch(e) {
    return res.status(401).json({ error: 'Non autorise' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { userMessage, context } = req.body

  // 2. Valider userMessage
  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'Message requis' })
  }

  // 3. Sanitiser. Limite relevee de 2000 a 8000 caracteres : les prompts de
  // simulation (SCPI, immo neuf) depassaient 2000 et arrivaient tronques.
  const safeMessage = userMessage
    .replace(/<[^>]*>/g, '')
    .substring(0, 8000)

  // 4. Contexte whiteliste -> prompt systeme serveur
  const system = SYSTEM_PROMPTS[context] || SYSTEM_PROMPTS.note

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
        // Redaction courte en serverless : effort bas = rapide et suffisant,
        // max_tokens large pour ne jamais tronquer (le thinking adaptatif du
        // modele consomme aussi ce budget).
        max_tokens: 8000,
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: safeMessage }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Erreur API Anthropic' })
    }

    // Les modeles recents renvoient un bloc thinking avant le texte :
    // content[0] n'est plus forcement le texte, on cherche le bloc text.
    const text = (data.content || []).find(b => b.type === 'text')?.text || ''
    res.status(200).json({ content: text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
